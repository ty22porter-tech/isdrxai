# Ask iSDRX AI: rollout and maintenance

The floating Ask iSDRX AI button is available inside the signed-in app, including on mobile. It answers how-to questions using the same Markdown guide as Help & Training. Update `docs/training/isdrxai-user-guide.md` and rebuild both apps whenever instructions change.

The assistant uses the existing chat model selection. It does not enable Astra, retrieve customer records, report live account status, or perform app actions. Answers require supporting quotes from retrieved guide excerpts; unsupported questions, invalid responses, and provider failures open the editable support form. Generated answers should still be reviewed for accuracy.

## Support workflow

Only an explicit Send to Support submission emails `info@isdrxai.com`, using the platform email transport. The user can edit their reply email and question. The message includes their authenticated account reference and current app section; it does not automatically include chat history. Sending requires the existing outbound-delivery configuration and verified sender readiness.

The UI displays “Your question has been sent to support. We’ll respond within 24 hours, seven days a week.” only after the transport acknowledges the request with a message ID. This acknowledges acceptance for sending; it does not prove inbox delivery. The response commitment requires the support team to monitor the inbox seven days a week. Delivery failures preserve the form and offer a direct email link. Retries reuse the request’s idempotency key unless the submitted fields change.

Both endpoints require a signed-in Clerk identity, but no paid entitlement. Limits are process-local: 10 assistant requests per 10 minutes and 3 support submissions per hour per user. No database migration or new environment variables are required.

## Replit development verification

Pull the update while preserving local changes. Rebuild the API and frontend and restart both development services. Keep `OPENAI_ASTRA_ENABLED` unset. Confirm the existing AI integration and platform email readiness in Replit. Test a guide question, a question the guide cannot answer, and the editable support form. Use mocked email transport for automated verification; do not send real support messages without an intentional test submission.

Local verification covered route authentication, rate limits, citation validation, unsupported questions, provider failures, HTML escaping, safe guide links, form retention, idempotent retry, and desktop/mobile layout. AI responses and email delivery were mocked; live integrations require Replit verification. Nothing was republished.
