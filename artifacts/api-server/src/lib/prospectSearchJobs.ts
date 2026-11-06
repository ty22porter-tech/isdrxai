import crypto from "node:crypto";
import { pool } from "@workspace/db";
import { logger } from "./logger";
import { SearchPaused, type ProspectSearchExecution } from "./prospectSearchExecution";
import { eligibleHiringResearch } from "./recruitingJobDiscovery";

type SearchJob = {
  id: string; client_id: string; request_key: string; request: any;
  discovery: any[] | null; checkpoints: Record<string, any>; attempts: Record<string, number>;
  status: string; response: any; response_status: number | null; retry_at: Date | null;
};
type Executor = (request: any, clientId: string, execution: ProspectSearchExecution) => Promise<{ status: number; body: any }>;
let execute: Executor | undefined;
let active = false;
let timer: ReturnType<typeof setInterval> | undefined;

export async function readSearchJob(id: string, clientId: string): Promise<SearchJob | undefined> {
  return (await pool.query("SELECT * FROM prospect_search_jobs WHERE id=$1 AND client_id=$2 AND created_at > now()-interval '24 hours'", [id, clientId])).rows[0];
}

export function publicSearchJob(job: SearchJob) {
  const leads = Object.values(job.checkpoints);
  // Older saved jobs may predate the unified qualification checks. Never
  // present those rows as contact-ready merely because their old search passed.
  const result = Array.isArray(job.response) ? job.response.map(lead => {
    const report = lead.opportunityIntelligence?.itResearch;
    const eligible = eligibleHiringResearch(report?.recruiting,
      report?.industryRelationship === "match" && Boolean(report?.recommendations?.length));
    return { ...lead,
      ...(lead.estimatedEmployees == null && typeof lead.employeeCount === "number"
        ? { estimatedEmployees: lead.employeeCount } : {}),
      ...(!eligible ? { outsideSelectedFilters: true } : {}),
    };
  }) : job.response;
  return { id: job.id, status: job.status, completed: leads.length, total: job.discovery?.length ?? 0,
    retryAt: job.retry_at?.toISOString() ?? null,
    retryableCount: leads.filter(lead => lead.researchError).length,
    ...(job.status === "completed" ? { responseStatus: job.response_status, result } : {}),
  };
}

export async function createSearchJob(clientId: string, requestKey: string, request: unknown) {
  const existing = await pool.query("SELECT * FROM prospect_search_jobs WHERE client_id=$1 AND request_key=$2", [clientId, requestKey]);
  if (existing.rows[0]) {
    if (JSON.stringify(existing.rows[0].request) !== JSON.stringify(request)) {
      // JSONB key ordering differs from JS insertion order; compare in Postgres.
      const same = await pool.query("SELECT request=$3::jsonb AS same FROM prospect_search_jobs WHERE client_id=$1 AND request_key=$2", [clientId, requestKey, JSON.stringify(request)]);
      if (!same.rows[0]?.same) throw new Error("A search request key cannot be reused for different settings.");
    }
    return existing.rows[0] as SearchJob;
  }
  // A per-tenant advisory lock makes the active-job limit race-safe.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`prospect-search:${clientId}`]);
    const duplicate = await client.query("SELECT *, request=$3::jsonb AS same_request FROM prospect_search_jobs WHERE client_id=$1 AND request_key=$2", [clientId, requestKey, JSON.stringify(request)]);
    if (duplicate.rows[0]) {
      if (!duplicate.rows[0].same_request) throw new Error("A search request key cannot be reused for different settings.");
      await client.query("COMMIT");
      return duplicate.rows[0] as SearchJob;
    }
    const pending = await client.query("SELECT id FROM prospect_search_jobs WHERE client_id=$1 AND status <> 'completed' AND created_at > now()-interval '24 hours' LIMIT 1", [clientId]);
    if (pending.rows.length) throw new Error("A Recruiting search is already running. Reconnect to it before starting another.");
    const result = await client.query("INSERT INTO prospect_search_jobs(id,client_id,request_key,request) VALUES($1,$2,$3,$4::jsonb) RETURNING *", [crypto.randomUUID(), clientId, requestKey, JSON.stringify(request)]);
    await client.query("COMMIT");
    void work();
    return result.rows[0] as SearchJob;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function retrySearchJob(id: string, clientId: string) {
  // Keep discovery and successful employers; retry only failed research.
  const result = await pool.query(`UPDATE prospect_search_jobs SET
    checkpoints=COALESCE((SELECT jsonb_object_agg(key,value) FROM jsonb_each(checkpoints) WHERE NOT (value ? 'researchError')), '{}'::jsonb),
    attempts='{}'::jsonb, status='queued', response=NULL, response_status=NULL, retry_at=NULL, updated_at=now()
    WHERE id=$1 AND client_id=$2 AND status='completed' AND created_at > now()-interval '24 hours' RETURNING *`, [id, clientId]);
  void work();
  return (result.rows[0] as SearchJob | undefined) ?? readSearchJob(id, clientId);
}

export async function runNextSearchJob() {
  if (active || !execute) return;
  active = true;
  let job: SearchJob | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let lockClient: { query: (sql: string, values?: any[]) => Promise<{ rows: any[]; rowCount: number | null }>; release: () => void } | undefined;
  const owner = crypto.randomUUID();
  try {
    lockClient = await pool.connect();
    const lock = await lockClient.query("SELECT pg_try_advisory_lock(hashtext('recruiting-search-provider')) AS acquired");
    if (!lock.rows[0]?.acquired) return;
    const claimed = await pool.query(`UPDATE prospect_search_jobs SET status='running', lease_owner=$1,
      lease_until=now()+interval '2 minutes', updated_at=now()
      WHERE id=(SELECT id FROM prospect_search_jobs
        WHERE created_at > now()-interval '24 hours' AND status <> 'completed'
          AND (lease_until IS NULL OR lease_until < now()) AND (retry_at IS NULL OR retry_at <= now())
          AND NOT EXISTS (SELECT 1 FROM prospect_search_jobs WHERE status='waiting' AND retry_at > now())
        ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`, [owner]);
    job = claimed.rows[0];
    if (!job) return;
    const id = job.id;
    const write = async (sql: string, values: unknown[]) => {
      const result = await pool.query(sql, values);
      if (!result.rowCount) throw new Error("Search worker lease was lost.");
    };
    heartbeat = setInterval(() => {
      void pool.query("UPDATE prospect_search_jobs SET lease_until=now()+interval '2 minutes' WHERE id=$1 AND lease_owner=$2", [id, owner])
        .catch(() => logger.warn("Search heartbeat unavailable; checkpoint writes remain lease-protected"));
    }, 15_000);
    heartbeat.unref();
    const execution: ProspectSearchExecution = {
      discovery: job.discovery ?? undefined, checkpoints: job.checkpoints, attempts: job.attempts,
      saveDiscovery: async employers => {
        await write("UPDATE prospect_search_jobs SET discovery=$3::jsonb, updated_at=now() WHERE id=$1 AND lease_owner=$2", [id, owner, JSON.stringify(employers)]);
        execution.discovery = employers;
        job!.discovery = employers;
      },
      saveLead: async (index, lead) => {
        const key = String(index);
        const attempts = (execution.attempts[key] ?? 0) + 1;
        await write(`UPDATE prospect_search_jobs SET checkpoints=jsonb_set(checkpoints,ARRAY[$3],$4::jsonb),
          attempts=jsonb_set(attempts,ARRAY[$3],to_jsonb($5::integer)), updated_at=now() WHERE id=$1 AND lease_owner=$2`, [id, owner, key, JSON.stringify(lead), attempts]);
        execution.checkpoints[key] = lead;
        execution.attempts[key] = attempts;
      },
    };
    const result = await execute(job.request, job.client_id, execution);
    await write("UPDATE prospect_search_jobs SET status='completed',response=$3::jsonb,response_status=$4,lease_until=NULL,lease_owner=NULL,retry_at=NULL,updated_at=now() WHERE id=$1 AND lease_owner=$2", [id, owner, JSON.stringify(result.body), result.status]);
  } catch (error) {
    if (job) {
      if (error instanceof SearchPaused) {
        const discoveryAttempts = job.discovery ? 0 : (job.attempts.discovery ?? 0) + 1;
        if (discoveryAttempts >= 3) {
          await pool.query("UPDATE prospect_search_jobs SET status='completed',response=$3::jsonb,response_status=502,lease_until=NULL,lease_owner=NULL,updated_at=now() WHERE id=$1 AND lease_owner=$2", [job.id, owner, JSON.stringify({ error: "Job discovery was rate-limited repeatedly. Retry the saved search later." })]);
        } else {
          await pool.query("UPDATE prospect_search_jobs SET status='waiting',retry_at=$3,lease_until=NULL,lease_owner=NULL,attempts=jsonb_set(attempts,'{discovery}',to_jsonb($4::integer)),updated_at=now() WHERE id=$1 AND lease_owner=$2", [job.id, owner, new Date(Date.now() + error.retryAfterMs), discoveryAttempts]);
        }
      } else {
        logger.error({ jobId: job.id }, "Saved prospect search interrupted; completed checkpoints retained");
        await pool.query("UPDATE prospect_search_jobs SET status='completed',response=$3::jsonb,response_status=502,lease_until=NULL,lease_owner=NULL,updated_at=now() WHERE id=$1 AND lease_owner=$2", [job.id, owner, JSON.stringify({ error: "Search was interrupted. Retry saved research to keep discovery and completed employers." })]);
      }
    } else logger.error("Prospect search worker could not access its queue");
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    if (lockClient) {
      try { await lockClient.query("SELECT pg_advisory_unlock(hashtext('recruiting-search-provider'))"); }
      finally { lockClient.release(); }
    }
    active = false;
  }
}

function work() {
  return runNextSearchJob().catch(() => { logger.error("Prospect search queue unavailable; checkpoints retained"); });
}

export function startProspectSearchWorker(executor: Executor, options: { poll?: boolean } = {}) {
  execute = executor;
  if (options.poll === false) return;
  if (!timer) {
    timer = setInterval(() => { void work(); }, 2000);
    timer.unref();
    void work();
    // Expire saved searches; no customer prospect/pipeline records are touched.
    void pool.query("DELETE FROM prospect_search_jobs WHERE created_at < now()-interval '24 hours'").catch(() => {});
  }
}
