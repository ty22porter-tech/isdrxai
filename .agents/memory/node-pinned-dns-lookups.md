---
name: Node pinned DNS lookups
description: Compatibility rule for SSRF-safe HTTP requests that pin a validated public DNS result.
---

Custom DNS lookup callbacks used to pin an outbound request to a validated public IP must support both Node callback shapes: return one `{ address, family }` object in an array when `options.all` is true, and scalar address/family arguments otherwise.

**Why:** Newer Node networking may request all addresses during automatic-family selection. Returning only the legacy scalar shape in that case produces `Invalid IP address: undefined`, making safe public-site research fail even though DNS resolution and direct requests work.

**How to apply:** Keep the prior public-address validation and redirect checks. Only adapt the callback result shape; never fall back to an unvalidated second DNS lookup or disable SSRF protections.