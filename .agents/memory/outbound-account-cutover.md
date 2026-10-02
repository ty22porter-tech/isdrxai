---
name: Outbound email account separation
description: Why branded outgoing email and historical inbound replies use separate Resend accounts.
---
The user chose the Resend account where isdrxai.com is verified and explicitly confirmed info@isdrxai.com as the correct platform email. Do not substitute an invented outreach mailbox. Keep clients' own business display names.

**Why:** The original sender belonged to a different Resend account. Replacing its credentials would prevent retrieval of historical inbound replies and break their signature verification.

**How to apply:** Preserve the legacy account and reply-domain setup when changing outgoing sending. New-account delivery events need separate signature verification. Do not remove the old key or migrate inbound DNS merely to change the visible From address. Existing client-specific verified senders remain overrides.