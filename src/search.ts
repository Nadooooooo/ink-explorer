const ADDRESS = /^0x[a-f\d]{40}$/i;
const HASH = /^0x[a-f\d]{64}$/i;
const HEIGHT = /^\d+$/;
type SearchResult = Record<string, unknown>;

export function searchCursorQuery(query: string, cursor: Record<string, unknown>): string {
  const params = new URLSearchParams();
  const append = (key: string, value: unknown, depth = 0) => {
    if (value && typeof value === "object" && !Array.isArray(value) && depth < 3) {
      for (const [child, nested] of Object.entries(value)) append(`${key}[${child}]`, nested, depth + 1);
    } else if (value == null || ["string", "number", "boolean"].includes(typeof value)) {
      // Search cursors require null-valued sort columns. Omitting one silently
      // makes the index return its first page again.
      params.set(key, value == null ? "null" : String(value));
    }
  };
  for (const [key, value] of Object.entries(cursor)) if (key !== "q") append(key, value);
  params.set("q", query);
  return `?${params}`;
}

export function searchResultDestination(item: SearchResult): string {
  if (item.type === "block") {
    if (typeof item.block_hash === "string" && HASH.test(item.block_hash)) return `/block/${item.block_hash}`;
    const height = String(item.block_number ?? "");
    return HEIGHT.test(height) ? `/block/${height}` : "";
  }
  const transaction = item.transaction_hash ?? (item.type === "transaction" ? item.hash : undefined);
  if (typeof transaction === "string" && HASH.test(transaction)) return `/tx/${transaction}`;
  if (typeof item.address_hash === "string" && ADDRESS.test(item.address_hash)) {
    return `/${item.type === "token" ? "token" : "address"}/${item.address_hash}`;
  }
  return "";
}

// A block and transaction hash have the same shape. Ask the selected chain's
// index before choosing a detail page; a missing transaction may still be pending.
export async function resolveSearchDestination(
  query: string,
  lookup: (query: string, signal: AbortSignal) => Promise<unknown>,
  signal?: AbortSignal,
  timeout = 3000,
): Promise<string | undefined> {
  const value = query.trim();
  if (!value) return undefined;
  if (signal?.aborted) throw signal.reason;
  if (ADDRESS.test(value)) return `/address/${value}`;
  if (HEIGHT.test(value)) return `/block/${value}`;
  const resultsPath = `/search?q=${encodeURIComponent(value)}`;
  if (!HASH.test(value)) return resultsPath;

  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException("Search lookup timed out", "TimeoutError")), timeout);
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    const result = await Promise.race([lookup(value, controller.signal), aborted]);
    if (!result || typeof result !== "object" || !Array.isArray((result as { items?: unknown }).items)) return resultsPath;
    const items = (result as { items: SearchResult[] }).items;
    const block = items.find(item => item?.type === "block" && typeof item.block_hash === "string" && item.block_hash.toLowerCase() === value.toLowerCase());
    if (block) return `/block/${value}`;
    return `/tx/${value}`;
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    // An unavailable index cannot establish the entity type. The results page
    // retains the query and supplies the normal error/retry interaction.
    return resultsPath;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    controller.signal.removeEventListener("abort", onAbort);
  }
}
