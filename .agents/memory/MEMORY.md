# Memory Index

- [DB schema changes](db-schema-changes.md) — additive cols need raw-SQL ALTER (push prompts/breaks) + `cd lib/db && tsc --build --force` (consumers use dist, not src).
- [Email send paths](email-send-paths.md) — never write status:"sent" without a real Resend dispatch; manual POST /api/emails once only logged. Share emailCompose.ts for CAN-SPAM.
- [Email/call-script generation paths](email-generation-paths.md) — 3 gen paths (ai.ts template, openai.ts LLM, client email-ai.ts); each must inject client senderName/businessName, omit body signature (composeEmail owns it), and scope prospect by clientId.
- [Deliverability checks](deliverability-checks.md) — SPF/DKIM come from Resend GET /domains/{id} detail (not list); DMARC only via DNS resolveTxt(_dmarc.<domain>).
- [Inbound reply (Option B)](inbound-reply-option-b.md) — client's PREFERRED flow, ON in dev (INBOUND_REPLY_DOMAIN=sdrai.xyz): enrolled prospect replies yes → auto scheduling email → /schedule questionnaire → rep emailed + Calendly. Caveat: only fires while app running (dev ephemeral); only for ENROLLED prospects. Recover swallowed replies via GET /emails/receiving.
