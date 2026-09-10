---
name: Autopilot drives campaign 7-step sequences
description: How the autopilot engine relates to campaign callScript sequences and its fallback behavior
---

- Campaign sequences live in `campaigns.callScript` JSON: `{followUp1..followUp6: {dayDelay, subject, body}}` = steps 2–7; step 1 is the intro. Placeholders: `{{contactName}} {{companyName}} {{city}} {{state}} {{industry}}`.
- The autopilot engine sends the campaign's configured sequence automatically (index-based step lookup, per-step dayDelay measured from last send). Campaigns WITHOUT a configured sequence fall back to the legacy 3-step AI cadence (day 0 / +3d / +4d).
- Enrolling WITHOUT a campaign is supported and must stay supported (campaign_id nullable): user explicitly wants campaign selection optional on Autopilot — requiring it was reported as a regression. No campaign → 3-step AI fallback. Autopilot enablement also requires business mailing address (CAN-SPAM), not just name+email — keep UI copy in sync.
- **Why:** two overlapping systems existed (manual Sequences page + 3-step autopilot); user wanted the 7-step cadence hands-off. Keeping the fallback avoids breaking old enrollments.
- **How to apply:** any change to the sequence JSON shape must be mirrored in BOTH `sequences.tsx` (manual queue) and `autopilotEngine.ts` (auto sender). Stop conditions (reply → status "replied"; unsubscribe → optedOut) must be preserved in both paths.
- The Add Prospects dialog is intentionally a handoff from Prospect Search, not a general
  pipeline browser. Show only prospects added during the current search selection and provide
  Select all for that subset; clear the handoff after successful enrollment or a new search.
  **Why:** showing every pipeline record made it unclear which newly researched prospects the
  user intended to start on Autopilot.
