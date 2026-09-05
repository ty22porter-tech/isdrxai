---
name: Caller pilot architecture
description: Records the chosen operating model and safety boundary for AI+ calling.
---

The caller pilot is hybrid: human callers operate the queue now, while call and task records retain provider/external identifiers for a later telephony integration. Approved script snapshots are immutable per queued task.

**Why:** The user explicitly chose human operation now with provider-ready architecture rather than pretending an automated voice provider is connected.

**How to apply:** Keep manual dialing fully functional, never imply calls are automated, enforce suppression and limits on the server, and integrate future providers through the existing task/call lifecycle instead of creating a parallel queue.