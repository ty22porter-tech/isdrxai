---
name: Deployment health path
description: The API artifact base path is probed by publishing uptime monitoring and must be a lightweight success endpoint.
---

Keep the API artifact base path `/api` as a dependency-free `200` liveness endpoint, alongside `/api/healthz`. Use `/api/health` separately for database-aware readiness diagnostics.

**Why:** Publishing uptime monitoring probes the artifact base path even when a separate startup health path is configured. A healthy API process returning `404` at `/api` is reported as downtime.

**How to apply:** Never remove or authenticate the `/api` liveness response. Keep it fast and side-effect-free; put database and integration checks on deeper health endpoints.