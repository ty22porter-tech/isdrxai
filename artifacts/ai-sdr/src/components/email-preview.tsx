interface EmailPreviewProps {
  subject: string;
  body: string;
  recipientName?: string | null;
  recipientCompany?: string | null;
  recipientEmail?: string | null;
  senderName?: string | null;
  senderCompany?: string | null;
  senderWebsite?: string | null;
  senderPhone?: string | null;
  senderMobilePhone?: string | null;
  senderEmail?: string | null;
  statusLabel?: string;
  eyebrow?: string;
  title?: string;
}

function bodyWithoutTypedSignature(body: string): string {
  return body
    .trim()
    .replace(/\n{2,}(?:best(?: regards)?|kind regards|regards|sincerely),?\s*\n[\s\S]*$/i, "")
    .trim();
}

function cleanWebsite(value?: string | null): string {
  return (value ?? "").replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

export function EmailPreview({
  subject,
  body,
  recipientName,
  recipientCompany,
  recipientEmail,
  senderName,
  senderCompany,
  senderWebsite,
  senderPhone,
  senderMobilePhone,
  senderEmail,
  statusLabel = "Draft",
  eyebrow = "Email preview",
  title = "Review before sending",
}: EmailPreviewProps) {
  const displayRecipient = [recipientName, recipientCompany].filter(Boolean).join(" · ")
    || recipientEmail
    || "Selected prospect";
  const displayBody = bodyWithoutTypedSignature(body) || "Your email message will appear here.";
  const displaySender = senderName?.trim() || senderCompany?.trim() || "Your name";
  const displayCompany = senderCompany?.trim() || "Your company";
  const displayWebsite = cleanWebsite(senderWebsite);

  return (
    <section
      className="rounded-[18px] border border-[#d8d6cf] bg-[#eef2f3] p-4 text-[#172b3a] shadow-[0_12px_30px_rgba(30,45,53,0.06)] sm:p-5"
      aria-label="Email preview"
      style={{ fontFamily: "'DM Sans', 'Outfit', sans-serif" }}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#278d87]"
            style={{ fontFamily: "'IBM Plex Mono', 'Space Mono', monospace" }}
          >
            {eyebrow}
          </p>
          <h3 className="mt-1 text-lg font-semibold tracking-[-0.02em]">{title}</h3>
        </div>
        <span className="rounded-full bg-[#d7e6e2] px-4 py-1.5 text-sm font-semibold text-[#27876f]">
          {statusLabel}
        </span>
      </div>

      <div className="mb-4">
        <p className="mb-1.5 text-xs font-semibold text-[#65727a]">Subject</p>
        <div className="rounded-xl border border-[#d7d4cc] bg-[#fffdfa] px-4 py-3 text-base font-medium shadow-sm">
          {subject || "Subject line will appear here"}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#d7d4cc] bg-[#fffdfa] shadow-sm">
        <div className="grid grid-cols-[64px_1fr] border-b border-[#dfdcd5] px-4 py-3 text-xs">
          <span className="text-[#748087]">To</span>
          <span className="font-semibold text-[#203240]">{displayRecipient}</span>
        </div>
        <div className="grid grid-cols-[64px_1fr] border-b border-[#dfdcd5] px-4 py-3 text-xs">
          <span className="text-[#748087]">Subject</span>
          <span className="font-semibold text-[#203240]">{subject || "—"}</span>
        </div>
        <div className="px-5 py-6 sm:px-6">
          <div className="whitespace-pre-wrap text-[14px] leading-[1.65] text-[#243540]">
            {displayBody}
          </div>
          <div className="mt-6 border-l-[3px] border-[#24aaa0] pl-4">
            <p className="text-sm text-[#43545e]">Best regards,</p>
            <p className="mt-2 text-[15px] font-semibold text-[#172b3a]">{displaySender}</p>
            <p className="mt-0.5 text-xs text-[#69767d]">{displayCompany}</p>
            {senderPhone && <p className="mt-0.5 text-xs text-[#69767d]">Office Phone: {senderPhone}</p>}
            {senderMobilePhone && <p className="mt-0.5 text-xs text-[#69767d]">Mobile: {senderMobilePhone}</p>}
            {senderEmail && <p className="mt-0.5 text-xs text-[#69767d]">Email: {senderEmail}</p>}
            {displayWebsite && <p className="mt-0.5 text-xs text-[#69767d]">{displayWebsite}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}