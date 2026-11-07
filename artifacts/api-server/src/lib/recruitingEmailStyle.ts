/** One voice across campaign templates, individual drafts, and Autopilot. */
export function recruitingEmailStyle(vertical: string | null | undefined, followUp = false): string {
  if (vertical !== "recruiting_staffing") return "";
  return `RECRUITING EMAIL VOICE:
Write like a real recruiter starting a useful conversation, not a corporate brochure. Use first-name greetings, contractions, short paragraphs, and everyday language. Be warm, direct, and respectful. Avoid generic healthcare or industry lectures, stiff phrases such as "I’m reaching out to understand whether", "maintain continuity", "leverage", "credentialed coverage needs", and repeated explanations of operational benefits.
${followUp ? "Preserve this step's follow-up or closing-the-loop intent. Do not reintroduce yourself as if this were the first email, or invent a previous conversation or reply." : "After the greeting, start with a conversational statement asking whether the team is filling the roles in-house or is open to recruiting support. Then connect that conversation to the researched openings."}
When verified openings are supplied, mention the exact job title(s) naturally and ask about recruiting for those roles; do not tack a disconnected job list onto a generic staffing pitch. You may say "I noticed" about a sourced listing, but never imply that hiring authority, urgency, agency interest, or today's vacancy status is confirmed. If no openings are verified, ask about hiring priorities without inventing roles.
In a reusable template, retain {{jobOpenings}} as a standalone paragraph; it becomes a complete research-based sentence, not a bare list. Do not put it inside another sentence or precede it with a dangling colon. In personalized drafts, use actual researched titles, not merge fields.
Introduce the actual configured seller naturally, for example "At [configured company], we offer [approved services]." Use only the real company identity and current approved catalog; do not output square-bracket examples. Mention short-term staffing and temp-to-hire together only if BOTH are approved and relevant. Never add either service merely because this example mentions it.
Choose different phrasing and sentence rhythms on each generation. These opening patterns are inspiration, not fixed copy:
- "I wanted to ask whether your team is filling these roles in-house or is open to some extra recruiting support."
- "I thought I'd check whether you're handling these openings internally or considering a staffing partner."
- "I'd love to learn how your team is approaching these roles and whether outside recruiting help would be useful."
Adapt the reference to roles if no verified openings are available. End with ONE easy, low-pressure question, such as whether a brief conversation about the roles and a suitable approved staffing option would be useful. Keep earlier hiring questions as statements so there is only one question mark. Do not invent candidates, guarantees, time-to-fill, or unsupported service benefits.`;
}

export function emailOpeningRule(vertical: string | null | undefined): string {
  return vertical === "recruiting_staffing"
    ? "Use the conversational recruiting opening and role-specific flow described below."
    : 'Begin with relevant business value. Do not begin with "I noticed," "I came across," "I wanted to reach out," or "I hope this email finds you well."';
}
