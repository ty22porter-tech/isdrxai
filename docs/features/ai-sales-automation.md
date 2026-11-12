# AI Sales Automation

The seller vertical `ai_sales_automation` describes a virtual sales employee for autonomous daily prospecting, personalized outreach and follow-up. It is independent from the prospect's industry. For example, selecting **Recruiting & Staffing** as a prospect sector searches for agencies that could buy the software; it does not run the recruiting seller's jobs-first employer search.

## Integration

- Onboarding, Settings, vertical normalization and campaign defaults recognize the new seller industry.
- Prospect research uses software-buyer instructions and independently verifies the company's actual sector. Company operations and sales-related hiring can support a fit hypothesis; they do not establish buying intent, actual spending or guaranteed ROI.
- Contact targeting accepts owners, CEOs, sales leaders and business development leaders. It does not fall back to arbitrary employees when no matching leader is found. Owner titles can contribute to contact-fit scoring after enrichment.
- Existing per-industry seller-profile archives and preferences handle switching. No account migration, deletion or rewriting is required. Unassigned legacy prospects/campaigns remain outside this new vertical, retaining their prior visibility in existing industries.
- Existing model selection, reasoning effort and provider configuration are unchanged.

## Savings evidence

The numerical claim is off by default. A general marketing statement such as “save up to 65%” does not enable it.

In Settings, open Company Intelligence for the AI Sales Automation seller profile and add a **Proof Point** as an approved edit, with this exact field order:

```text
AI Sales cost comparison | baseline annual cost: 100000 | software annual cost: 35000 | basis: like-for-like role scope including all software and operating costs | source: https://your-evidence-url
```

Replace all example values and the URL with the seller's supporting evidence. Both costs must be positive, finite annual amounts; the comparison must support at least 65%, include a meaningful basis and an HTTPS source. This is seller-configured evidence and arithmetic validation, not independent verification of the source or the prospect's costs. Review the supporting document before configuring it.

With that evidence, generated copy may say: “Depending on your current process and costs, we could help you save up to 65%.” It must remain conditional and seller-provided, never a guarantee. Comparison amounts must not be presented as the prospect's spending. Removing the approved comparison disables the claim, including in saved drafts at composition time. Client-side fallback templates omit numerical savings entirely.

Generation prompts and output guards cover individual drafts and campaign templates. Composition also guards saved body copy; manual campaign sends validate the subject and body. Unsupported numerical savings, guaranteed results and raw booking URLs are rejected.

## Booking links

The composer adds only the seller's actual configured HTTPS booking URL, including for AI Sales Automation campaign emails. Existing tracking retains that destination. Without a configured URL, drafts invite a reply rather than referring to a calendar below. Generators do not invent URLs. HTML contains the clickable booking link; the existing plain-text convention shows its label.

## Development Preview

```sh
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/ai-sdr dev
```

Open `http://localhost:5173/ai-sales-preview.html`. This development-only fixture renders the actual onboarding dialog, software-buyer sectors and the actual fallback email generator. Selecting an industry changes fixture state only. Network calls are disabled in the fixture; no live settings, records or outreach are changed. It is not an authenticated end-to-end test of external research providers. The normal production build uses `index.html` and does not include this fixture entry.

Live research and enrichment still require the application's existing database, authentication and provider credentials. No production credentials were configured for this implementation session, and no outreach was sent or deployment published.
