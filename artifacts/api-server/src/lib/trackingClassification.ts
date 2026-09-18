/** Shared heuristic, not proof of a person's identity. Gmail image proxy is NOT blocked. */
export function botReason(userAgent: string): string | null {
  const ua = userAgent.toLowerCase();
  if (!ua) return "no-user-agent";
  const patterns: [RegExp, string][] = [
    [/barracuda|mimecast|proofpoint|forcepoint|fireeye|trendmicro|symantec|sophos|zscaler|urldefense/, "security-scanner"],
    [/bot\b|crawler|spider|slurp|headless|phantomjs|selenium/, "bot"],
    [/curl|wget|python-requests|python-urllib|go-http-client|okhttp|java\/|libwww/, "http-client"],
    [/outlook-ios-fetcher|ms-office.*prefetch|bingpreview/, "prefetch"],
  ];
  for (const [re, reason] of patterns) if (re.test(ua)) return reason;
  return null;
}

export function videoBotReason(userAgent: string, sentAt: Date | null, purpose = "", now = Date.now()): string | null {
  return botReason(userAgent)
    ?? (/prefetch|prerender/i.test(purpose) ? "prefetch-header" : null)
    ?? (sentAt && now - sentAt.getTime() < 15_000 ? "prefetch-window" : null);
}