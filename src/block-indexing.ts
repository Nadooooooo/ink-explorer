export const BLOCK_INDEXING_DEADLINE = 90_000;
export const BLOCK_INDEXING_RETRY = 3_000;

export type BlockIndexing = {
  code: "BLOCK_INDEXING";
  chainId: number;
  block: { number: string; hash: string };
  retryAfterMs: number;
};
export type BlockResourceKind = "block" | "transactions";
const hashPattern = /^0x[0-9a-f]{64}$/i;
const numberPattern = /^(?:0|[1-9][0-9]*)$/;
const record = (value: unknown): value is Record<string, any> => value !== null && typeof value === "object" && !Array.isArray(value);

function matchesBlock(id: string, number: string, hash: string) {
  return hashPattern.test(id) ? id.toLowerCase() === hash.toLowerCase() : /^\d+$/.test(id) && id.replace(/^0+(?=\d)/, "") === number;
}

export function recognizeBlockIndexing(value: unknown, id: string, chainId: number): BlockIndexing | undefined {
  if (!record(value) || value.code !== "BLOCK_INDEXING" || value.chainId !== chainId || value.retryAfterMs !== BLOCK_INDEXING_RETRY || !record(value.block)) return;
  const { number, hash } = value.block;
  if (typeof number !== "string" || !numberPattern.test(number) || typeof hash !== "string" || !hashPattern.test(hash) || !matchesBlock(id, number, hash)) return;
  return value as BlockIndexing;
}

export function validIndexedBlockResource(value: unknown, id: string, kind: BlockResourceKind) {
  if (!record(value) || "code" in value) return false;
  if (kind === "transactions") return Array.isArray(value.items);
  const number = typeof value.height === "number" && Number.isSafeInteger(value.height) && value.height >= 0 ? String(value.height) : value.height;
  return typeof number === "string" && numberPattern.test(number) && typeof value.hash === "string" && hashPattern.test(value.hash) && matchesBlock(id, number, value.hash);
}

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const cancel = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", cancel); resolve(); }, ms);
    signal.addEventListener("abort", cancel, { once: true });
  });
}

/** The elapsed-time deadline includes fetch, response bodies and retry delays. */
export async function loadIndexedBlockResource<T>({ id, chainId, kind, signal, request, onIndexing }: {
  id: string;
  chainId: number;
  kind: BlockResourceKind;
  signal: AbortSignal;
  request: (signal: AbortSignal, timeout: number) => Promise<{ value: unknown; status: number }>;
  onIndexing: (value: BlockIndexing) => void;
}): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  if (signal.aborted) cancel();
  else signal.addEventListener("abort", cancel, { once: true });
  const deadline = Date.now() + BLOCK_INDEXING_DEADLINE;
  const timer = setTimeout(() => controller.abort(new Error("blockIndexingExpired")), BLOCK_INDEXING_DEADLINE);
  let indexing = false;
  try {
    for (;;) {
      if (controller.signal.aborted) throw controller.signal.reason;
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(indexing ? "blockIndexingExpired" : "requestTimeout");
      const { value, status } = await request(controller.signal, Math.min(20_000, remaining));
      if (controller.signal.aborted) throw controller.signal.reason;
      if (Date.now() >= deadline) throw new Error(indexing ? "blockIndexingExpired" : "requestTimeout");
      if (status === 202) {
        const pending = recognizeBlockIndexing(value, id, chainId);
        if (!pending) throw new Error("invalidApiResponse");
        indexing = true;
        onIndexing(pending);
        await pause(Math.min(pending.retryAfterMs, deadline - Date.now()), controller.signal);
        continue;
      }
      if (status !== 200 || !validIndexedBlockResource(value, id, kind)) throw new Error("invalidApiResponse");
      return value as T;
    }
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (controller.signal.aborted && Date.now() >= deadline) throw new Error(indexing ? "blockIndexingExpired" : "requestTimeout");
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}
