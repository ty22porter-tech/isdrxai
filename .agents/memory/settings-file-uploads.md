---
name: Settings file uploads & object storage ACL
description: How logo/photo/attachment uploads work in ai-sdr settings and the ACL claim model.
---

Rule: uploaded objects (GCS presigned flow via /api/storage) have NO ACL until the user saves settings; `PUT /users/settings` claims them (owner=clientId, visibility=public) and rejects paths already owned by another user.

**Why:** ACL is object metadata, so it can't be set before the file exists; and trusting client paths without an ownership check lets any user hijack another's object.

**How to apply:** any new feature persisting an objectPath must go through the same claim-and-verify pattern (normalize → verify existing owner → set ACL). `/api/storage/objects/*` serves public-ACL objects to anyone, no-ACL objects to any authenticated user, otherwise enforces ACL.
