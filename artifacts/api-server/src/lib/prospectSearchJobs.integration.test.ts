import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("./requireAuth", () => ({
  requireAuth: (req: any, _res: any, next: () => void) => {
    req.clientId = req.headers["x-test-account"] ?? "synthetic-search-integration";
    req.log = { error: vi.fn() };
    next();
  },
  requireEntitlement: (_req: any, _res: any, next: () => void) => next(),
}));

const enabled = process.env.RUN_SEARCH_JOB_INTEGRATION === "1";
let pool: typeof import("@workspace/db").pool;
let jobs: typeof import("./prospectSearchJobs");
let SearchPaused: typeof import("./prospectSearchExecution").SearchPaused;
const clientId = "synthetic-search-integration";
const request = { city: "Dallas", state: "TX", industry: "Manufacturing", count: 10 };
const delay = () => new Promise<void>(resolve => setTimeout(resolve, 10));

async function until(id: string, status: string) {
  for (let i = 0; i < 200; i++) {
    const job = await jobs.readSearchJob(id, clientId);
    if (job?.status === status) return job;
    await delay();
  }
  throw new Error(`Saved job did not reach ${status}`);
}

describe.skipIf(!enabled)("saved Recruiting searches with PostgreSQL", () => {
  beforeAll(async () => {
    pool = (await import("@workspace/db")).pool;
    jobs = await import("./prospectSearchJobs");
    SearchPaused = (await import("./prospectSearchExecution")).SearchPaused;
    await pool.query("DELETE FROM prospect_search_jobs WHERE client_id=$1", [clientId]);
    await pool.query("INSERT INTO users(id,vertical) VALUES($1,'recruiting_staffing') ON CONFLICT(id) DO UPDATE SET vertical='recruiting_staffing'", [clientId]);
  });
  afterEach(async () => { await delay(); await pool.query("DELETE FROM prospect_search_jobs WHERE client_id=$1", [clientId]); });
  afterAll(async () => { await pool.query("DELETE FROM users WHERE id=$1", [clientId]); await pool.end(); });

  it("responds over HTTP before long research finishes and allows authenticated polling after reconnect", async () => {
    const express = (await import("express")).default;
    const router = (await import("../routes/prospectSearchJobs")).default;
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    jobs.startProspectSearchWorker(async () => { await pending; return { status: 200, body: [] }; }, { poll: false });
    const app = express();
    app.use(express.json());
    app.use("/jobs", router);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server unavailable");
    const base = `http://127.0.0.1:${address.port}/jobs`;
    let id = "";
    try {
      const response = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestKey: "http-reconnect-request-1", request }) });
      expect(response.status).toBe(202);
      const job = await response.json() as any;
      id = job.id;
      expect(job.status).not.toBe("completed");
      expect((await fetch(`${base}/${id}`, { headers: { "x-test-account": "other-account" } })).status).toBe(404);
      finish();
      await until(id, "completed");
      const reconnected = await fetch(`${base}/${id}`);
      expect(reconnected.headers.get("cache-control")).toBe("no-store");
      expect(await reconnected.json()).toMatchObject({ status: "completed", responseStatus: 200, result: [] });
    } finally {
      finish();
      if (id) await until(id, "completed");
      await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
    }
  });

  it("returns a job before research finishes, persists its result after a client disconnect, and scopes reads to its account", async () => {
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    let executions = 0;
    jobs.startProspectSearchWorker(async (_request, _clientId, execution) => {
      executions++;
      await execution.saveDiscovery([{ companyName: "Synthetic Employer", industry: "Manufacturing", jobs: [] }]);
      await pending;
      await execution.saveLead(0, { companyName: "Synthetic Employer" });
      return { status: 200, body: [{ companyName: "Synthetic Employer" }] };
    }, { poll: false });
    const [job, duplicate] = await Promise.all([
      jobs.createSearchJob(clientId, "idempotent-request-0001", request),
      jobs.createSearchJob(clientId, "idempotent-request-0001", request),
    ]);
    try {
      expect(duplicate.id).toBe(job.id);
      await expect(jobs.createSearchJob(clientId, "another-request-00001", request)).rejects.toThrow(/already running/);
      expect(await jobs.readSearchJob(job.id, "another-account")).toBeUndefined();
      expect(await jobs.retrySearchJob(job.id, "another-account")).toBeUndefined();
    } finally { finish(); }
    const complete = await until(job.id, "completed");
    expect(complete.response).toEqual([{ companyName: "Synthetic Employer" }]);
    expect(executions).toBe(1);
    expect(jobs.publicSearchJob(complete).completed).toBe(1);
  });

  it("honors the stored rate-limit window and retains discovery and completed checkpoints", async () => {
    let executions = 0;
    jobs.startProspectSearchWorker(async (_request, _clientId, execution) => {
      executions++;
      if (!execution.discovery) {
        await execution.saveDiscovery([{ companyName: "First Employer", industry: "Manufacturing", jobs: [] }]);
        await execution.saveLead(0, { companyName: "First Employer", researchError: "rate limited", researchRetryAfterMs: 60_000 });
        throw new SearchPaused(60_000);
      }
      expect(execution.checkpoints["0"].researchError).toBe("rate limited");
      expect(execution.attempts["0"]).toBe(1);
      await execution.saveLead(0, { companyName: "First Employer" });
      return { status: 200, body: [] };
    }, { poll: false });
    const job = await jobs.createSearchJob(clientId, "rate-limited-request-1", request);
    const waiting = await until(job.id, "waiting");
    expect(new Date(waiting.retry_at!).getTime()).toBeGreaterThan(Date.now() + 55_000);
    await jobs.runNextSearchJob();
    expect(executions).toBe(1);
    await pool.query("UPDATE prospect_search_jobs SET retry_at=now()-interval '1 second' WHERE id=$1", [job.id]);
    await jobs.runNextSearchJob();
    const complete = await until(job.id, "completed");
    expect(executions).toBe(2);
    expect(complete.discovery).toHaveLength(1);
    expect(complete.attempts["0"]).toBe(2);
  });

  it("retries only failed research while preserving successful employers and avoiding rediscovery", async () => {
    jobs.startProspectSearchWorker(async (_request, _clientId, execution) => {
      if (!execution.discovery) {
        await execution.saveDiscovery([{ companyName: "Saved Employer", industry: "Manufacturing", jobs: [] }]);
        await execution.saveLead(0, { companyName: "Saved Employer" });
        await execution.saveLead(1, { companyName: "Failed Employer", researchError: "No citable sources" });
      } else {
        expect(execution.checkpoints["0"]).toEqual({ companyName: "Saved Employer" });
        expect(execution.checkpoints["1"]).toBeUndefined();
        await execution.saveLead(1, { companyName: "Recovered Employer" });
      }
      return { status: 200, body: [] };
    }, { poll: false });
    const job = await jobs.createSearchJob(clientId, "retry-failed-request-1", request);
    await until(job.id, "completed");
    await delay();
    await jobs.retrySearchJob(job.id, clientId);
    const complete = await until(job.id, "completed");
    expect(complete.checkpoints["0"]).toEqual({ companyName: "Saved Employer" });
    expect(complete.checkpoints["1"]).toEqual({ companyName: "Recovered Employer" });
    expect(complete.discovery).toHaveLength(1);
  });

  it("recovers an expired worker lease using retained discovery and rejects a changed idempotency request", async () => {
    jobs.startProspectSearchWorker(async (_request, _clientId, execution) => {
      expect(execution.discovery?.[0].companyName).toBe("Retained Employer");
      return { status: 200, body: [] };
    }, { poll: false });
    const id = crypto.randomUUID();
    await pool.query(`INSERT INTO prospect_search_jobs(id,client_id,request_key,request,discovery,status,lease_owner,lease_until)
      VALUES($1,$2,$3,$4::jsonb,$5::jsonb,'running','dead-worker',now()-interval '1 second')`,
    [id, clientId, "recovered-request-0001", JSON.stringify(request), JSON.stringify([{ companyName: "Retained Employer" }])]);
    await jobs.runNextSearchJob();
    await until(id, "completed");
    await expect(jobs.createSearchJob(clientId, "recovered-request-0001", { ...request, count: 20 }))
      .rejects.toThrow(/different settings/);
  });

  it("bounds automatic discovery retries when the provider remains rate-limited", async () => {
    let executions = 0;
    jobs.startProspectSearchWorker(async () => { executions++; throw new SearchPaused(60_000); }, { poll: false });
    const job = await jobs.createSearchJob(clientId, "discovery-rate-limit-1", request);
    await until(job.id, "waiting");
    for (let attempt = 0; attempt < 2; attempt++) {
      await delay();
      await pool.query("UPDATE prospect_search_jobs SET retry_at=now()-interval '1 second' WHERE id=$1", [job.id]);
      await jobs.runNextSearchJob();
    }
    const complete = await until(job.id, "completed");
    expect(executions).toBe(3);
    expect(complete.response.error).toContain("rate-limited repeatedly");
  });
});
