/**
 * Deterministic "Recommended Next Action" rules (spec-driven, no AI).
 * Order matters: the first matching rule wins.
 */
export interface NextActionInput {
  emailsSent: number;
  emailsDelivered: number;
  emailsBounced: number;
  validOpens: number;
  attachmentViewed: boolean;
  linksClicked: number;
  calendlyClicked: boolean;
  meetingRequestSent: boolean;
  meetingScheduled: boolean;
  interestLevel: "low" | "medium" | "hot";
}

export interface NextAction {
  action: string;
  reason: string;
}

export function recommendedNextAction(i: NextActionInput): NextAction {
  if (i.meetingScheduled) {
    return { action: "Prepare for the scheduled meeting", reason: "A meeting is already on the calendar." };
  }
  if (i.emailsSent === 0) {
    return { action: "Send first outreach email", reason: "No emails have been sent to this prospect yet." };
  }
  if (i.emailsBounced > 0 && i.emailsDelivered === 0) {
    return { action: "Verify email address — all emails bounced", reason: "Every email to this address bounced; find a working contact." };
  }
  if (i.calendlyClicked) {
    return { action: "Send a scheduling reminder", reason: "Clicked the scheduling link but hasn't booked a meeting." };
  }
  if (i.attachmentViewed) {
    return { action: "Prioritize a personal follow-up", reason: "Viewed the attached case study — strong buying signal." };
  }
  if (i.interestLevel === "hot") {
    return { action: "Call now — hot prospect", reason: "Engagement score crossed the Hot threshold." };
  }
  if (i.meetingRequestSent) {
    return { action: "Wait 2–3 days, then follow up", reason: "An automated meeting request was sent; give them time to respond." };
  }
  if (i.validOpens >= 3) {
    return { action: "Send a direct meeting ask", reason: "Opened your emails repeatedly — they're paying attention." };
  }
  if (i.linksClicked > 0) {
    return { action: "Follow up on their interest", reason: "Clicked a link in your email." };
  }
  if (i.validOpens === 0) {
    return { action: "Verify email address or try a new subject line", reason: "No opens recorded (note: open tracking is an estimate)." };
  }
  return { action: "Continue the outreach sequence", reason: "Opened at least once; keep the cadence going." };
}
