export interface CallableProspect {
  phone: string | null;
  optedOut: boolean;
  status: string;
}

const TERMINAL_STATUSES = new Set([
  "closed_won",
  "closed_lost",
  "won",
  "booked",
  "meeting_booked",
  "wrong_number",
  "do_not_call",
  "not_interested",
]);

export type SuppressionResult = { allowed: true } | { allowed: false; reason: string };

export function canCall(prospect: CallableProspect): SuppressionResult {
  const phone = prospect.phone?.trim() ?? "";
  const digits = phone.replace(/\D/g, "");
  if (!phone) return { allowed: false, reason: "Prospect has no phone number" };
  if (digits.length < 7 || digits.length > 15) {
    return { allowed: false, reason: "Prospect phone number is invalid" };
  }
  if (prospect.optedOut) return { allowed: false, reason: "Prospect has opted out / do-not-call" };
  if (TERMINAL_STATUSES.has(prospect.status.toLowerCase())) {
    return { allowed: false, reason: `Prospect status '${prospect.status}' is not callable` };
  }
  return { allowed: true };
}

export function callerLimitViolation(
  enabled: boolean,
  today: number,
  month: number,
  dailyLimit: number,
  monthlyLimit: number,
): string | null {
  if (!enabled) return "Human caller pilot is not enabled for this client";
  if (today >= dailyLimit) return `Daily caller limit of ${dailyLimit} has been reached`;
  if (month >= monthlyLimit) return `Monthly caller limit of ${monthlyLimit} has been reached`;
  return null;
}

export function callbackIdempotencyKey(taskId: number, callbackAt: Date): string {
  return `callback:${taskId}:${callbackAt.toISOString()}`;
}