---
name: Resend outbound email dev limitation
description: Why all outbound email (autopilot + walkthrough questionnaire) fails in the dev environment
---

All outbound email goes through `sendEmail()` (artifacts/api-server/src/lib/emailSender.ts), which sends `from: RESEND_FROM_EMAIL`. In the dev environment `RESEND_FROM_EMAIL` is set to an unverified `gmail.com` address, so Resend rejects every send with `The gmail.com domain is not verified. Please add and verify your domain on https://resend.com/domains`.

**Why:** Resend only allows sending from a verified domain (public gmail/yahoo/etc. addresses can never be verified). This is a platform/config matter, not a code bug.

**How to apply:** When testing any email-sending feature (autopilot step emails, Calendly/walkthrough emails, the public `/api/schedule/:token` POST), expect a 500 with that message at the Resend step even though all preceding validation/parsing/DB logic ran correctly. To actually deliver email the user must verify a custom domain in Resend and point `RESEND_FROM_EMAIL` at it. Do not treat this as a regression in the feature code — confirm the failure is the unverified-domain error before debugging further.
