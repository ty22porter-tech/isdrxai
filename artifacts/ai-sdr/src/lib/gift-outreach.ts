import {
  requestGiftVideoUploadUrl,
  type GiftVideoUploadInput,
  type GiftOutreachRecord,
  type Email,
} from "@workspace/api-client-react";
import type { QueryClient } from "@tanstack/react-query";

export async function uploadGiftFile(file: File, kind: "video" | "thumbnail"): Promise<number> {
  const allowed = kind === "video" ? ["video/mp4"] : ["image/png", "image/jpeg", "image/webp"];
  const limit = (kind === "video" ? 100 : 5) * 1024 * 1024;
  if (!allowed.includes(file.type) || file.size === 0 || file.size > limit) {
    throw new Error(kind === "video" ? "Choose an MP4 file between 1 byte and 100 MiB." : "Choose a PNG, JPEG, or WebP image between 1 byte and 5 MiB.");
  }
  const reservation = await requestGiftVideoUploadUrl({
    kind, name: file.name, size: file.size,
    contentType: file.type as GiftVideoUploadInput["contentType"],
  });
  const response = await fetch(reservation.uploadURL, {
    method: "PUT", headers: { "Content-Type": file.type }, body: file,
  });
  if (!response.ok) throw new Error(`File upload failed (${response.status}). Please retry.`);
  return reservation.uploadId;
}

export async function invalidateGiftQueries(client: QueryClient) {
  await client.invalidateQueries({
    predicate: ({ queryKey }) => queryKey.some(key => typeof key === "string" && (
      key.startsWith("gift-") || key.startsWith("/api/gift-") || key.includes("autopilot")
    )),
  });
}

// Autopilot has no generated client schema; this is the subset returned by
// GET /api/autopilot/enrollments (an array, not an envelope).
export interface GiftEnrollment {
  id: number;
  prospectId: number;
  campaignId: number;
  giftMode: boolean;
  currentStep: number;
  status: string;
}

export async function listGiftEnrollments(): Promise<GiftEnrollment[]> {
  const response = await fetch("/api/autopilot/enrollments", { credentials: "include" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Unable to load enrollments (${response.status})`);
  if (!Array.isArray(data)) throw new Error("Invalid enrollment response: expected an array.");
  return data;
}

export function giftSequenceProgress(
  emails: Pick<Email, "id">[],
  record: GiftOutreachRecord | undefined,
  enrollment: GiftEnrollment | undefined,
  enabled: boolean,
) {
  const giftMode = !!record || !!enrollment?.giftMode;
  const resolved = record?.status === "sent" || record?.status === "skipped";
  // The package replaces original followUp1. A skipped package has no email,
  // and a sent package must never be counted twice.
  const ordinaryCount = emails.filter(email => email.id !== record?.emailId).length;
  const completed = giftMode ? ordinaryCount + (resolved ? 1 : 0) : emails.length;
  const nextOriginalStep = completed + 1;
  const autopilotOwned = giftMode && (!!enrollment || record?.enrollmentId != null);
  const held = giftMode && (autopilotOwned || !enabled || !resolved || record?.status === "stopped");
  return { giftMode, nextOriginalStep, held, autopilotOwned, displayStep: giftMode ? nextOriginalStep + 1 : nextOriginalStep };
}