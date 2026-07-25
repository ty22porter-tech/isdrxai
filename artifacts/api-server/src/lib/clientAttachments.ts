import type { EmailAttachment } from "./emailSender";
import { ObjectStorageService } from "./objectStorage";

const objectStorage = new ObjectStorageService();

export interface ClientAttachmentMeta {
  path: string;
  name: string;
  size?: number;
  contentType?: string;
}

/**
 * Downloads the client's saved attachment files (flyers, one-pagers, etc.)
 * from object storage so they can be attached to outgoing outreach emails.
 * Failures on individual files are logged by the caller's logger via the
 * thrown error; we skip unreadable files rather than blocking the send.
 */
export async function getClientEmailAttachments(
  attachments: unknown,
  log?: { warn: (obj: unknown, msg: string) => void },
): Promise<EmailAttachment[]> {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];
  const out: EmailAttachment[] = [];
  for (const a of attachments as ClientAttachmentMeta[]) {
    if (!a || typeof a.path !== "string" || typeof a.name !== "string") continue;
    try {
      const file = await objectStorage.getObjectEntityFile(a.path);
      const [content] = await file.download();
      out.push({ filename: a.name, content });
    } catch (err) {
      log?.warn({ err, path: a.path }, "Skipping unreadable email attachment");
    }
  }
  return out;
}
