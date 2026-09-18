/** Reuse the scorer's current cached level, including the manual override. */
export function giftVideoLeadStrength(prospect: { interestLevel: string; manualInterestLevel: string | null }): "Hot" | "Medium" | "Low" {
  const level = prospect.manualInterestLevel ?? prospect.interestLevel;
  return level === "hot" ? "Hot" : level === "medium" ? "Medium" : "Low";
}

/** An edited prepared video needs review again, not a stale disabled Ready UI. */
export function giftVideoEditStatus(record: { status: string; draftSubject: string | null; draftBody: string | null; dueAt: Date | null }, videoId: number | null): string {
  if (["skipped", "stopped"].includes(record.status)) return record.status;
  if (!videoId) return "needs_video";
  if (record.draftSubject?.trim() && record.draftBody?.trim()) return "review";
  return record.dueAt ? "scheduled" : record.status === "ready" ? "review" : record.status;
}