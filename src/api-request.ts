// Bound the entire response, including its body. A reachable server can send
// headers and then stop, so a fetch-only deadline is not sufficient.
export const REQUEST_TIMEOUT = 20_000;
export const FILTER_TIMEOUT = 75_000;

export async function requestJson<T = any>(
  url: string,
  init: RequestInit = {},
  timeout = REQUEST_TIMEOUT,
  responseKind: "object" | "count" = "object",
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) cancel();
  else init.signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException("requestTimeout", "TimeoutError")), timeout);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    let value;
    try {
      value = await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new Error(response.ok ? "invalidApiResponse" : "Data source unavailable");
    }
    if (!response.ok) throw new Error(typeof value?.error === "string" ? value.error : "Data source unavailable");
    if (responseKind === "count") {
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("invalidApiResponse");
    } else if (value !== null && typeof value !== "object") throw new Error("invalidApiResponse");
    return value;
  } catch (error) {
    // Cancellation belongs to the calling component; it must not become a
    // user-facing connection error after navigation.
    if (init.signal?.aborted) throw init.signal.reason;
    if (controller.signal.aborted) throw new Error("requestTimeout");
    if (error instanceof TypeError) throw new Error("apiConnectionFailed");
    throw error;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", cancel);
  }
}
