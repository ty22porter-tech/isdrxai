import { startProspectSearchJob, getProspectSearchJob, retryProspectSearchJob } from "@workspace/api-client-react";
import type { ProspectSearchJob, ProspectSearchRequest, ProspectLead } from "@workspace/api-client-react";

type SavedSearch<T> = { requestKey: string; request: ProspectSearchRequest; jobId?: string; retrying?: boolean;
  pending: boolean; params: T; updatedAt: number };
const key = (userId: string) => `prospecting:saved-search:${userId}`;

export function savedRecruitingSearch<T>(userId: string, storage: Storage = localStorage): SavedSearch<T> | undefined {
  try {
    const saved = JSON.parse(storage.getItem(key(userId)) ?? "null");
    return saved && Date.now() - saved.updatedAt < 24 * 60 * 60 * 1000 ? saved : undefined;
  } catch { return undefined; }
}

export async function persistentRecruitingSearch<T>(request: ProspectSearchRequest, options: {
  userId: string; params: T; retryFailed?: boolean; resumeExisting?: boolean; onProgress?: (job: ProspectSearchJob) => void;
  storage?: Storage; wait?: () => Promise<void>;
  transport?: { start: typeof startProspectSearchJob; get: typeof getProspectSearchJob; retry: typeof retryProspectSearchJob };
}): Promise<ProspectLead[]> {
  const storage = options.storage ?? localStorage;
  const transport = options.transport ?? { start: startProspectSearchJob, get: getProspectSearchJob, retry: retryProspectSearchJob };
  const previous = savedRecruitingSearch<T>(options.userId, storage);
  const sameRequest = previous && JSON.stringify(previous.request) === JSON.stringify(request);
  let saved = sameRequest && (previous.pending || options.retryFailed || options.resumeExisting) ? previous : undefined;
  if (options.retryFailed && !saved?.jobId) throw new Error("The saved search expired. Start a new search.");
  saved ??= { requestKey: crypto.randomUUID(), request, pending: true, params: options.params, updatedAt: Date.now() };
  saved.pending = true;
  if (options.retryFailed) saved.retrying = true;
  const persist = () => {
    saved!.updatedAt = Date.now();
    try { storage.setItem(key(options.userId), JSON.stringify(saved)); }
    catch { throw new Error("Browser storage is unavailable. Enable storage to use recoverable Recruiting searches."); }
  };
  // Save the idempotency key before any credit-consuming request.
  persist();
  const requestOptions = () => ({ signal: AbortSignal.timeout(15_000) });
  const rejectMissing = (error: unknown) => {
    if (error && typeof error === "object" && "status" in error && error.status === 404) {
      storage.removeItem(key(options.userId));
      throw new Error("The saved search is unavailable or expired after 24 hours. Start a new search.");
    }
  };
  const reconnect = async (operation: Promise<ProspectSearchJob>) => {
    try { return await operation; } catch (error) { rejectMissing(error); throw error; }
  };
  let job = await reconnect(options.retryFailed && saved.jobId
    ? transport.retry(saved.jobId, requestOptions())
    : saved.jobId ? transport.get(saved.jobId, requestOptions())
    : transport.start({ requestKey: saved.requestKey, request }, requestOptions()));
  saved.jobId = job.id;
  persist();
  let failures = 0;
  while (true) {
    options.onProgress?.(job);
    if (job.status === "completed") {
      saved.pending = false;
      persist();
      if ((job.responseStatus ?? 500) >= 400 || !Array.isArray(job.result)) {
        const data = !Array.isArray(job.result) ? job.result : undefined;
        throw Object.assign(new Error(data?.error ?? "Search did not complete. Retry saved research."), {
          data, status: job.responseStatus,
        });
      }
      return job.result;
    }
    await (options.wait?.() ?? new Promise<void>(resolve => setTimeout(resolve, 2000)));
    try { job = await transport.get(saved.jobId, requestOptions()); failures = 0; }
    catch (error) {
      rejectMissing(error);
      if (++failures >= 3) throw new Error("Connection interrupted. Your search is saved; reload this page to reconnect without repeating discovery.");
    }
  }
}
