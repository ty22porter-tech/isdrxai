import { Router } from "express";
import { ProspectSearchBody } from "@workspace/api-zod";
import { pool } from "@workspace/db";
import { requireAuth, requireEntitlement } from "../lib/requireAuth";
import { createSearchJob, readSearchJob, publicSearchJob, retrySearchJob } from "../lib/prospectSearchJobs";

const router = Router();
router.use(requireAuth, requireEntitlement);

router.post("/", async (req, res) => {
  const parsed = ProspectSearchBody.safeParse(req.body?.request);
  const requestKey = req.body?.requestKey;
  if (!parsed.success || !Number.isInteger(parsed.data.count) || typeof requestKey !== "string"
    || !/^[a-zA-Z0-9-]{16,80}$/.test(requestKey)) return res.status(400).json({ error: "Invalid saved search request." });
  const user = await pool.query("SELECT vertical FROM users WHERE id=$1", [req.clientId]);
  if (user.rows[0]?.vertical !== "recruiting_staffing") return res.status(400).json({ error: "Saved searches are available for Recruiting accounts." });
  try {
    return res.status(202).json(publicSearchJob(await createSearchJob(req.clientId, requestKey, parsed.data)));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "A search request key cannot be reused for different settings."
      || message === "A Recruiting search is already running. Reconnect to it before starting another.") {
      return res.status(409).json({ error: message });
    }
    req.log.error("Could not save prospect search");
    return res.status(503).json({ error: "The search could not be saved. Please retry." });
  }
});

router.get("/:id", async (req, res) => {
  const job = await readSearchJob(String(req.params.id), req.clientId);
  if (!job) return res.status(404).json({ error: "Saved search not found or expired." });
  res.setHeader("Cache-Control", "no-store");
  return res.json(publicSearchJob(job));
});

router.post("/:id/retry", async (req, res) => {
  const job = await retrySearchJob(String(req.params.id), req.clientId);
  if (!job) return res.status(404).json({ error: "Saved search not found or expired." });
  return res.status(202).json(publicSearchJob(job));
});

export default router;
