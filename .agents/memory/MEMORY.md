# Memory Index

- [DB schema changes](db-schema-changes.md) — additive cols need raw-SQL ALTER (push prompts/breaks) + `cd lib/db && tsc --build --force` (consumers use dist, not src).
- [Email send paths](email-send-paths.md) — never write status:"sent" without a real Resend dispatch; manual POST /api/emails once only logged. Share emailCompose.ts for CAN-SPAM.
