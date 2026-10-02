import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

/** Outbound account only. Legacy credentials remain dedicated to historical replies. */
export async function outboundResendRequest(path: string, init?: RequestInit): Promise<Response> {
  const request = connectors.proxy("resend", path, {
    method: init?.method,
    body: init?.body,
    headers: Object.fromEntries(new Headers(init?.headers).entries()),
  });
  // The SDK does not forward AbortSignal. Bound our wait without retrying a
  // possibly accepted send; callers retain their stable provider idempotency key.
  const signal = init?.signal ?? AbortSignal.timeout(20_000);
  return new Promise<Response>((resolve, reject) => {
    const abort = () => reject(new Error("Resend request timed out or was cancelled"));
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    request.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}