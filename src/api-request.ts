// Bound the entire response, including its body. A reachable server can send
// headers and then stop, so a fetch-only deadline is not sufficient.
export const REQUEST_TIMEOUT = 20_000;
export const FILTER_TIMEOUT = 75_000;
export const explorerRequestTimeout = (path: string) => /^\/explorer\/advanced-filters(?:\?|$)/.test(path) ? FILTER_TIMEOUT : REQUEST_TIMEOUT;

type DataFreshness = { fetchedAt: string; resources: number } | null;
const freshnessListeners = new Set<() => void>();
const staleResources = new Map<string, string>();
const resourceRequests = new Map<string, number>();
let freshnessSnapshot: DataFreshness = null;
let requestSequence = 0;
let pageGeneration = 0;
// A page may have several polling components. Share the server's cooldown so
// their timers cannot hammer a throttled API. Keep service errors per resource.
const cooldowns = new Map<string, number>();
function requestScope(url: string) {
  const parsed = new URL(url, typeof location === "undefined" ? "http://localhost" : location.href);
  return parsed.origin + (parsed.pathname.startsWith("/testnet/api/") ? "/testnet/api/" : "/api/");
}
function cooldownDuration(header: string | null) {
  if (!header) return 60000;
  const seconds = Number(header);
  const duration = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(duration) ? Math.max(1000, Math.min(duration, 86400000)) : 60000;
}

// A deliberate retry may wait for the server's cooldown instead of failing
// immediately. Navigation and page suspension must cancel that wait as well.
export async function waitForRequestRetry(url: string, signal?: AbortSignal): Promise<void> {
  const scope = requestScope(url);
  while (true) {
    signal?.throwIfAborted();
    const delay = Math.max(cooldowns.get(scope) || 0, cooldowns.get(url) || 0) - Date.now();
    if (delay <= 0) return;
    await new Promise<void>((resolve, reject) => {
      const finish = () => { signal?.removeEventListener('abort', cancel); resolve(); };
      const cancel = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); reject(signal?.reason); };
      const timer = setTimeout(finish, delay);
      signal?.addEventListener('abort', cancel, {once: true});
    });
  }
}

export const getDataFreshness = () => freshnessSnapshot;
export function subscribeDataFreshness(listener: () => void) {
  freshnessListeners.add(listener);
  return () => { freshnessListeners.delete(listener); };
}

function publishFreshness() {
  const fetchedAt = [...staleResources.values()].sort()[0];
  if (freshnessSnapshot?.fetchedAt === fetchedAt && freshnessSnapshot?.resources === staleResources.size) return;
  if (!fetchedAt && !freshnessSnapshot) return;
  freshnessSnapshot = fetchedAt ? { fetchedAt, resources: staleResources.size } : null;
  freshnessListeners.forEach(listener => listener());
}

export function resetDataFreshness() {
  pageGeneration++;
  staleResources.clear();
  resourceRequests.clear();
  publishFreshness();
}

export async function requestJson<T = any>(
  url: string,
  init: RequestInit = {},
  timeout = REQUEST_TIMEOUT,
  responseKind: "object" | "count" = "object",
  inspectResponse?: (value: T, status: number, headers: Headers) => void,
): Promise<T> {
  if (init.signal?.aborted) throw init.signal.reason;
  const readOnly = ["GET", "HEAD"].includes((init.method || "GET").toUpperCase());
  const scope = requestScope(url);
  const now = Date.now();
  for (const [key, until] of cooldowns) if (until <= now) cooldowns.delete(key);
  if (readOnly && ((cooldowns.get(scope) || 0) > now || (cooldowns.get(url) || 0) > now)) throw new Error("Data source unavailable");
  const sequence = ++requestSequence;
  const generation = pageGeneration;
  resourceRequests.set(url, sequence);
  const controller = new AbortController();
  const cancel = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) cancel();
  else init.signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException("requestTimeout", "TimeoutError")), timeout);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (readOnly && [429, 503].includes(response.status)) {
      const key = response.status === 429 ? scope : url;
      cooldowns.set(key, Math.max(cooldowns.get(key) || 0, Date.now() + cooldownDuration(response.headers.get("retry-after"))));
    }
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
    inspectResponse?.(value, response.status, response.headers);
    if (!controller.signal.aborted && generation === pageGeneration && resourceRequests.get(url) === sequence) {
      const status = response.headers.get("x-ink-data-status");
      const fetchedAt = response.headers.get("x-ink-data-fetched-at");
      if (status === "stale" && fetchedAt && Number.isFinite(Date.parse(fetchedAt))) {
        staleResources.set(url, new Date(fetchedAt).toISOString());
      } else if (status === "fresh") staleResources.delete(url);
      publishFreshness();
    }
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
    if (generation === pageGeneration && resourceRequests.get(url) === sequence) resourceRequests.delete(url);
  }
}
