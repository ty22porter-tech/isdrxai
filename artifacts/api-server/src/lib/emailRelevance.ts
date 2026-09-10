import type { SellerIntelligence } from "./prospectMatching";

export interface EmailRelevanceContext {
  companyName: string;
  contactName?: string;
  industry: string;
  city?: string;
  templateMode?: boolean;
  seller: SellerIntelligence;
  verifiedProspectContext?: string[];
  verifiedProspectSignalTypes?: string[];
  unconfirmedProspectTopics?: string[];
}

export interface EmailRelevanceResult {
  score: number;
  reasons: string[];
  blockingReasons: string[];
}

const FORBIDDEN_OPENING = /^(?:i noticed|i came across|i wanted to reach out|i hope this email finds you well|my name is|we are a leading|are you looking for)\b/i;
const DISCOVERY_LANGUAGE = /\b(current approach|how (?:you|your team)|worth comparing|currently evaluating|priority|brief conversation|compare notes|handling this|understand)\b/i;
const VALUE_LANGUAGE = /\b(outcome|reduce|improve|support|protect|reliable|reliability|consistent|consistency|visibility|secure|security|efficien|risk|growth|recognition|uptime|quality|response)\w*/i;

const normalize = (value: string) =>
  value.toLowerCase().replace(/\{\{[^}]+\}\}/g, " placeholder ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

const includesPhrase = (text: string, phrase: string) =>
  Boolean(phrase && ` ${text} `.includes(` ${phrase} `));

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const significantTokens = (value: string) =>
  normalize(value).split(" ").filter(token => token.length >= 5 && !["their", "there", "about", "which", "these", "those", "company", "service"].includes(token));

const PROSPECT_EVENT_PATTERNS: Array<{ signalTypes: string[]; pattern: RegExp }> = [
  { signalTypes: ["hiring", "job_posting"], pattern: /\b(?:hiring|hired|recruiting|job openings?)\b/i },
  { signalTypes: ["expansion"], pattern: /\b(?:expanding|expanded|expansion|growth plans?)\b/i },
  { signalTypes: ["expansion", "new_location", "new_facility"], pattern: /\b(?:opening|opened|adding|added)\b[^.!?\n]{0,35}\b(?:locations?|facilities|offices?|branches|staff|headcount)\b/i },
  { signalTypes: ["expansion", "new_location", "new_facility"], pattern: /\b(?:new|additional)\s+(?:locations?|facilities|offices?|branches)\b/i },
  { signalTypes: ["expansion", "new_location", "new_facility"], pattern: /\boperates?\s+(?:[a-z]+|\d+)\s+(?:locations?|facilities|offices?|branches)\b/i },
  { signalTypes: ["acquisition"], pattern: /\b(?:acquired|acquiring|acquisition|merged|merger)\b/i },
  { signalTypes: ["purchase", "vehicle_purchase"], pattern: /\b(?:bought|buying|purchased|purchasing|ordered|ordering)\b[^.!?\n]{0,35}\b(?:vehicles?|equipment|software|systems?)\b/i },
  { signalTypes: ["purchase", "vehicle_purchase", "fleet_growth"], pattern: /\b(?:new|additional)\s+vehicles?\b/i },
  { signalTypes: ["fleet", "fleet_growth", "vehicle_purchase"], pattern: /\b(?:fleet|new vehicles?|additional vehicles?)\b/i },
  { signalTypes: ["rebrand", "branding_change"], pattern: /\b(?:rebranding|rebranded|new brand|brand refresh)\b/i },
  { signalTypes: ["provider_change"], pattern: /\b(?:current provider|works? with [^.!?\n]{0,25} provider|switching providers?)\b/i },
  { signalTypes: ["provider_change"], pattern: /\b(?:seeking|searching for|looking for|evaluating|replacing|switching)\b[^.!?\n]{0,35}\bprovider\b/i },
  { signalTypes: ["expansion", "new_location", "new_facility", "hiring", "purchase", "vehicle_purchase"], pattern: /\b(?:plans?|planning|intends?|expecting)\b[^.!?\n]{0,40}\b(?:expand|expansion|open|add|hire|buy|purchase|acquire|rebrand|move)\b/i },
  { signalTypes: ["contract_timing"], pattern: /\b(?:under contract|contract (?:expires|ends|renews))\b/i },
  { signalTypes: ["budget"], pattern: /\b(?:allocated|approved|increased|has)\b[^.!?\n]{0,20}\bbudget\b/i },
  { signalTypes: ["security_incident"], pattern: /\b(?:cybersecurity|security)\b[^.!?\n]{0,20}\b(?:incident|breach|problem|failure)\b/i },
  { signalTypes: ["verified_business_need", "service_gap"], pattern: /\b(?:needs?|requires?|wants?)\b[^.!?\n]{0,45}\b(?:services?|solution|support|provider|cleaning|security|branding|technology|IT)\b/i },
  { signalTypes: ["verified_business_need", "service_gap"], pattern: /\b(?:struggles?|suffers?|faces?|experiences?|lacks?)\b[^.!?\n]{0,45}\b(?:service|support|security|cleaning|branding|technology|consistency|reliability|downtime|response)\b/i },
  { signalTypes: ["verified_business_need", "service_gap"], pattern: /\bhas\b[^.!?\n]{0,30}\b(?:service gaps?|support gaps?|security gaps?|cleaning problems?|downtime|inconsistency|poor service|slow response)\b/i },
];

function unsupportedProspectEventClaim(body: string, context: EmailRelevanceContext): string | null {
  const normalizedCompany = normalize(context.companyName);
  const ambiguousCompanyName = ["a", "an", "it", "us", "we", "me", "my", "at", "by", "in", "on", "or", "if", "of", "to"].includes(normalizedCompany);
  const companySubjectPattern = ambiguousCompanyName
    ? null
    : new RegExp(`\\b${escapeRegExp(context.companyName)}(?:['’]s)?\\b`, "i");
  const genericSubjectPattern = /\b(?:the company|the business|they|your team|you)\b/i;
  const verifiedTypes = new Set(context.verifiedProspectSignalTypes ?? []);
  const verifiedFacts = context.verifiedProspectContext ?? [];
  const structuredGuardEnabled = context.verifiedProspectSignalTypes !== undefined;
  const modalLanguage = /\b(?:may|might|could|possible|potential|unconfirmed|appears?|suggests?)\b/i;
  const assertionVerb = /\b(?:is|are|was|were|has(?!\s+to\b)|have(?!\s+to\b)|had|operates?|owns?|uses?|works?|plans?|expects?|seeks?|needs?|requires?|wants?|hired|bought|purchased|added|opened|expanded|acquired|launched|announced|struggles?|suffers?|faces?|experiences?|lacks?|runs?|maintains?|manages?)\b/i;

  const coordinatedClauseBoundary = /[,;]|\s+(?:and|but|while|yet)\s+(?=(?:may|might|could|is|are|was|were|has|have|had|operates?|owns?|uses?|works?|plans?|expects?|seeks?|needs?|requires?|wants?|hired|bought|purchased|added|opened|expanded|acquired|launched|announced|struggles?|suffers?|faces?|experiences?|lacks?|runs?|maintains?|manages?)\b)/i;
  for (const sentence of body.split(/[.!?\n]+/).map(value => value.trim()).filter(Boolean)) {
    let inheritedSubject: string | null = null;
    for (const clause of sentence.split(coordinatedClauseBoundary).map(value => value.trim()).filter(Boolean)) {
      const directSubject = companySubjectPattern?.exec(clause) ?? genericSubjectPattern.exec(clause);
      if (directSubject?.[0]) inheritedSubject = directSubject[0];
      const subjectText = directSubject?.[0] ?? inheritedSubject;
      if (!subjectText) continue;
      const subjectIndex = directSubject?.index ?? 0;
      const subjectEnd = directSubject ? subjectIndex + directSubject[0].length : 0;

      for (const event of PROSPECT_EVENT_PATTERNS) {
        const eventMatch = event.pattern.exec(clause);
        if (!eventMatch || eventMatch.index == null) continue;
        const eventEnd = eventMatch.index + eventMatch[0].length;
        const betweenSubjectAndEvent = subjectIndex <= eventMatch.index
          ? clause.slice(subjectEnd, eventMatch.index)
          : "";
        const immediatelyBeforeSubject = clause.slice(Math.max(0, subjectIndex - 16), subjectIndex);
        const immediatelyBeforeEvent = clause.slice(Math.max(0, eventMatch.index - 16), eventMatch.index);
        const trailing = clause.slice(eventEnd).trim();
        const sameClauseConditional =
          modalLanguage.test(betweenSubjectAndEvent) ||
          /\b(?:if|whether)\s*$/i.test(immediatelyBeforeSubject) ||
          (subjectIndex > eventEnd && /\b(?:possible|potential|may|might|could)\s*$/i.test(immediatelyBeforeEvent)) ||
          /^(?:can|may|might|could)\b/i.test(trailing);
        if (sameClauseConditional) continue;
        if (!event.signalTypes.some(type => verifiedTypes.has(type))) return eventMatch[0];
      }
      if (!structuredGuardEnabled) continue;
      const tail = clause.slice(subjectEnd);
      const assertion = assertionVerb.exec(tail);
      if (!assertion || assertion.index == null) continue;
      const leadIn = tail.slice(0, assertion.index);
      const immediatelyBeforeSubject = clause.slice(Math.max(0, subjectIndex - 16), subjectIndex);
      const sameClauseConditional =
        modalLanguage.test(leadIn) ||
        /\b(?:if|whether)\s*$/i.test(immediatelyBeforeSubject);
      if (sameClauseConditional || includesFact(clause, verifiedFacts)) continue;
      return `${subjectText} ${assertion[0]}`;
    }
  }
  return null;
}

function includesFact(text: string, facts: string[]): boolean {
  const normalizedText = normalize(text);
  return facts.some(fact => {
    const tokens = significantTokens(fact);
    if (!tokens.length) return false;
    const needed = Math.min(2, tokens.length);
    return tokens.filter(token => normalizedText.includes(token)).length >= needed;
  });
}

function firstBusinessParagraph(body: string): string {
  const paragraphs = body.split(/\n\s*\n/).map(part => part.trim()).filter(Boolean);
  if (paragraphs.length > 1 && /^(hi|hello|dear)\b/i.test(paragraphs[0])) return paragraphs[1];
  return paragraphs[0] ?? "";
}

function unsupportedGuaranteeClaim(body: string): string | null {
  const explicitGuarantee = body.match(/\b(?:guarantee[ds]?|promise[sd]?)\b[^.!?\n]*/i);
  if (explicitGuarantee) return explicitGuarantee[0].trim();

  const certainNumericOutcome = body.match(
    /\b(?:will|can)\s+(?:definitely\s+)?(?:reduce|lower|increase|improve|eliminate|prevent)\b[^.!?\n]{0,60}\b\d+(?:\.\d+)?%/i,
  );
  return certainNumericOutcome?.[0]?.trim() ?? null;
}

function unapprovedSellerServiceClaim(body: string, context: EmailRelevanceContext): string | null {
  if (!context.seller.ready) return null;
  const approvedOffers = [
    ...context.seller.capabilities,
    ...context.seller.services,
    ...context.seller.products,
    ...context.seller.valuePropositions,
  ];
  const sellerName = context.seller.name?.trim();
  const sellerSubject = sellerName
    ? `(?:we|our company|${escapeRegExp(sellerName)}(?:['’]s)?)`
    : "(?:we|our company)";
  const claimPattern = new RegExp(
    `\\b${sellerSubject}\\s+(?:offer|offers|provide|provides|deliver|delivers|specialize|specializes)(?:\\s+in)?\\s+[^.!?\\n]+`,
    "gi",
  );

  for (const match of body.matchAll(claimPattern)) {
    const claim = match[0].trim();
    if (!includesFact(claim, approvedOffers)) return claim;
  }
  return null;
}

export function evaluateEmailRelevance(
  subject: string,
  body: string,
  context: EmailRelevanceContext,
): EmailRelevanceResult {
  const reasons: string[] = [];
  const blockingReasons: string[] = [];
  let score = 0;
  const opening = firstBusinessParagraph(body);
  const sellerOffers = [
    ...context.seller.capabilities,
    ...context.seller.services,
    ...context.seller.products,
    ...context.seller.valuePropositions,
  ];
  const prospectAnchors = [
    context.industry,
    context.city ?? "",
    ...(context.templateMode ? ["{{city}}"] : []),
  ].filter(Boolean);
  const completeEmail = normalize(`${subject} ${body}`);
  const normalizedCompany = normalize(context.companyName);
  const normalizedContact = normalize(context.contactName ?? "");
  const ambiguousCompanyName = ["a", "an", "it", "us", "we", "me", "my", "at", "by", "in", "on", "or", "if", "of", "to"].includes(normalizedCompany);
  const companyGrounded = context.templateMode
    ? /\{\{companyName\}\}/.test(`${subject} ${body}`)
    : ambiguousCompanyName
      ? includesPhrase(completeEmail, normalizedContact)
      : includesPhrase(completeEmail, normalizedCompany);

  const forbiddenOpening = FORBIDDEN_OPENING.test(opening);
  if (!forbiddenOpening && opening.length >= 35 &&
    (includesFact(opening, [context.industry, context.city ?? ""]) || VALUE_LANGUAGE.test(opening))) {
    score += 20;
  } else {
    reasons.push(forbiddenOpening ? "Replace the prohibited generic opening." : "Open with a prospect-relevant business situation or outcome.");
  }

  const prospectGrounded = companyGrounded && (
    includesFact(`${subject} ${body}`, prospectAnchors) ||
    includesFact(opening, [context.industry]) ||
    VALUE_LANGUAGE.test(opening)
  );
  if (prospectGrounded) score += 20;
  else reasons.push("Ground the email in the prospect company, industry, location, or a legitimate business-model connection.");

  if (context.seller.ready) {
    if (includesFact(body, sellerOffers)) score += 20;
    else reasons.push("Connect the prospect challenge to one configured seller capability.");
  } else if (DISCOVERY_LANGUAGE.test(body) && !/\b(?:we|our company)\s+(?:provide|offer|specialize|deliver)\b/i.test(body)) {
    score += 20;
  } else {
    reasons.push("Seller Intelligence is limited; use a discovery question instead of a seller-specific claim.");
  }

  const differentiators = [
    ...context.seller.differentiators,
    ...context.seller.certifications,
    ...context.seller.proof,
    ...context.seller.portfolioExamples,
  ];
  if (!differentiators.length || includesFact(body, differentiators)) score += 15;
  else reasons.push("Use one relevant configured differentiator or omit differentiator claims.");

  const outcomes = [...context.seller.outcomes, ...context.seller.valuePropositions];
  if (includesFact(body, outcomes) || VALUE_LANGUAGE.test(body)) score += 15;
  else reasons.push("Explain a clear potential business value or outcome.");

  if (/\?\s*$/.test(body.trim()) && DISCOVERY_LANGUAGE.test(body)) score += 10;
  else reasons.push("End with an easy, low-friction engagement question.");

  const unsupportedClaim = unsupportedProspectEventClaim(body, context);
  if (unsupportedClaim) {
    score = Math.min(score, 69);
    const reason = `Remove or qualify the unsupported prospect claim "${unsupportedClaim}"; only a matching verified signal may be stated as fact.`;
    reasons.push(reason);
    blockingReasons.push(reason);
  }

  const unsupportedGuarantee = unsupportedGuaranteeClaim(body);
  if (unsupportedGuarantee) {
    score = Math.min(score, 69);
    const reason = `Remove the unsupported guarantee "${unsupportedGuarantee}".`;
    reasons.push(reason);
    blockingReasons.push(reason);
  }

  const unapprovedService = unapprovedSellerServiceClaim(body, context);
  if (unapprovedService) {
    score = Math.min(score, 69);
    const reason = `Remove the unapproved seller-service claim "${unapprovedService}".`;
    reasons.push(reason);
    blockingReasons.push(reason);
  }

  if (!companyGrounded) reasons.push(
    context.templateMode
      ? "Use the {{companyName}} placeholder so the merged email is prospect-specific."
      : "Reference the prospect company so the email cannot be sent unchanged to unrelated businesses.",
  );
  if (!prospectGrounded || !companyGrounded || forbiddenOpening) score = Math.min(score, 69);
  if (/\n(?:best|regards|sincerely|cheers|thank you)[,!.]?\s*$/i.test(body.trim())) {
    score = Math.max(0, score - 10);
    reasons.push("Remove the model-generated sign-off; the app adds the approved signature.");
  }
  if (body.trim().split(/\s+/).length > 220) {
    score = Math.max(0, score - 10);
    reasons.push("Shorten the email to keep it concise.");
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
    blockingReasons,
  };
}