import { Router } from "express";
import { resolveTxt } from "node:dns/promises";
import { requireAuth } from "../lib/requireAuth";
import { getPlatformFromEmail } from "../lib/emailSender";

const router = Router();
router.use(requireAuth);

type CheckStatus = "pass" | "fail" | "warn" | "unknown";
interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

async function getResendDomainRecords(domain: string): Promise<
  | { found: true; status: string; records: Array<{ record?: string; type?: string; name?: string; status?: string }> }
  | { found: false; error?: string }
> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { found: false, error: "RESEND_API_KEY is not set." };
  try {
    const listRes = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!listRes.ok) return { found: false, error: `Resend API error ${listRes.status}` };
    const list = (await listRes.json()) as { data?: Array<{ id: string; name: string; status: string }> };
    const match = list.data?.find((d) => d.name.toLowerCase() === domain.toLowerCase());
    if (!match) return { found: false };

    // Fetch detail for the SPF/DKIM record breakdown.
    const detailRes = await fetch(`https://api.resend.com/domains/${match.id}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const detail = detailRes.ok
      ? ((await detailRes.json()) as { status?: string; records?: any[] })
      : {};
    return {
      found: true,
      status: detail.status ?? match.status,
      records: Array.isArray(detail.records) ? detail.records : [],
    };
  } catch (err: any) {
    return { found: false, error: err?.message ?? "Failed to reach Resend." };
  }
}

async function getDmarc(domain: string): Promise<{ present: boolean; policy?: string; record?: string }> {
  try {
    const records = await resolveTxt(`_dmarc.${domain}`);
    const flat = records.map((chunks) => chunks.join("")).find((r) => /v=DMARC1/i.test(r));
    if (!flat) return { present: false };
    const policyMatch = flat.match(/\bp=([a-zA-Z]+)/);
    return { present: true, policy: policyMatch?.[1]?.toLowerCase(), record: flat };
  } catch {
    return { present: false };
  }
}

router.get("/", async (_req, res) => {
  const fromEmail = getPlatformFromEmail();
  const sendingDomain = fromEmail.split("@")[1]?.trim() ?? "";
  const checks: Check[] = [];

  // 1. Provider configured
  const hasKey = !!process.env.RESEND_API_KEY;
  checks.push({
    id: "provider",
    label: "Email provider connected",
    status: hasKey ? "pass" : "fail",
    detail: hasKey
      ? "Resend is connected and ready to send."
      : "No email provider key found. Emails cannot be sent.",
  });

  const domainInfo = await getResendDomainRecords(sendingDomain);

  // 2. Domain verified
  const domainVerified = domainInfo.found && domainInfo.status === "verified";
  checks.push({
    id: "domain",
    label: `Sending domain verified (${sendingDomain || "not set"})`,
    status: !sendingDomain ? "fail" : domainVerified ? "pass" : domainInfo.found ? "warn" : "fail",
    detail: !sendingDomain
      ? "No sending domain configured."
      : domainVerified
        ? "Your domain is verified with the email provider."
        : domainInfo.found
          ? `Domain found but status is "${domainInfo.status}". Complete verification in your Resend dashboard.`
          : domainInfo.error ?? "Domain is not registered with the email provider.",
  });

  // 3 + 4. SPF / DKIM (from Resend records when available)
  const records = domainInfo.found ? domainInfo.records : [];
  const recStatus = (kind: RegExp): CheckStatus => {
    const matches = records.filter((r) => kind.test(`${r.record ?? ""} ${r.name ?? ""} ${r.type ?? ""}`));
    if (matches.length === 0) return domainVerified ? "pass" : "unknown";
    return matches.every((r) => (r.status ?? "").toLowerCase() === "verified") ? "pass" : "warn";
  };
  const spfDetail = (s: CheckStatus) =>
    s === "pass"
      ? "SPF is set up — receivers can confirm you're an authorized sender."
      : s === "unknown"
        ? "Couldn't read SPF status from the email provider right now. Try Recheck in a moment."
        : "SPF record is missing or not yet verified. Add it in your DNS.";
  const dkimDetail = (s: CheckStatus) =>
    s === "pass"
      ? "DKIM is set up — your emails are cryptographically signed."
      : s === "unknown"
        ? "Couldn't read DKIM status from the email provider right now. Try Recheck in a moment."
        : "DKIM record is missing or not yet verified. Add it in your DNS.";
  const spfStatus = recStatus(/spf/i);
  const dkimStatus = recStatus(/dkim|domainkey/i);
  checks.push({ id: "spf", label: "SPF authentication", status: spfStatus, detail: spfDetail(spfStatus) });
  checks.push({ id: "dkim", label: "DKIM authentication", status: dkimStatus, detail: dkimDetail(dkimStatus) });

  // 5. DMARC (authoritative DNS lookup)
  const dmarc = await getDmarc(sendingDomain);
  checks.push({
    id: "dmarc",
    label: "DMARC policy",
    status: !sendingDomain ? "fail" : dmarc.present ? "pass" : "warn",
    detail: dmarc.present
      ? `DMARC found (policy: ${dmarc.policy ?? "none"}). This improves inbox placement.`
      : `No DMARC record at _dmarc.${sendingDomain}. Add a TXT record like "v=DMARC1; p=none; rua=mailto:dmarc@${sendingDomain}" to boost deliverability.`,
  });

  const score = checks.filter((c) => c.status === "pass").length;
  res.json({
    fromEmail,
    sendingDomain,
    checks,
    score,
    total: checks.length,
    summary:
      score === checks.length
        ? "Your sending setup is fully configured for best deliverability."
        : "Some deliverability items need attention. New domains often land in Spam/Promotions until reputation builds.",
  });
});

export default router;
