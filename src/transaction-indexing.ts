const hash = /^0x[\da-f]{64}$/i;
export const TRANSACTION_INDEXING_DEADLINE = 30_000;
export function recognizeTransactionIndexing(value: any, id: string, chainId: number) {
  const tx = value?.transaction;
  return value?.code === "TRANSACTION_INDEXING" && value.chainId === chainId && value.retryAfterMs === 1000 &&
    hash.test(id) && typeof tx?.hash === "string" && tx.hash.toLowerCase() === id.toLowerCase() &&
    typeof tx.blockHash === "string" && hash.test(tx.blockHash) && typeof tx.blockNumber === "string" && /^(0|[1-9]\d*)$/.test(tx.blockNumber);
}
export async function loadIndexedTransaction<T>({ id, chainId, signal, request, onIndexing }: {
  id: string; chainId: number; signal: AbortSignal;
  request: (signal: AbortSignal, timeout: number) => Promise<{ value: any; status: number }>;
  onIndexing: () => void;
}): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  if (signal.aborted) cancel(); else signal.addEventListener("abort", cancel, { once: true });
  const deadline = Date.now() + TRANSACTION_INDEXING_DEADLINE;
  const timer = setTimeout(() => controller.abort(new Error("transactionIndexingExpired")), TRANSACTION_INDEXING_DEADLINE);
  let indexing = false;
  try {
    for (;;) {
      if (controller.signal.aborted) throw controller.signal.reason;
      const { value, status } = await request(controller.signal, Math.min(20_000, Math.max(1, deadline - Date.now())));
      if (controller.signal.aborted) throw controller.signal.reason;
      if (Date.now() >= deadline) throw new Error(indexing ? "transactionIndexingExpired" : "requestTimeout");
      if (status === 202) {
        if (!recognizeTransactionIndexing(value, id, chainId)) throw new Error("invalidApiResponse");
        indexing = true; onIndexing();
        await new Promise<void>((resolve, reject) => {
          const abort = () => { clearTimeout(pause); reject(controller.signal.reason); };
          const pause = setTimeout(() => { controller.signal.removeEventListener("abort", abort); resolve(); }, Math.min(1000, deadline - Date.now()));
          controller.signal.addEventListener("abort", abort, { once: true });
        });
        continue;
      }
      if (status !== 200 || !value || Array.isArray(value) || "code" in value || typeof value.hash !== "string" || !hash.test(value.hash) || value.hash.toLowerCase() !== id.toLowerCase()) throw new Error("invalidApiResponse");
      return value as T;
    }
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (controller.signal.aborted && Date.now() >= deadline) throw new Error(indexing ? "transactionIndexingExpired" : "requestTimeout");
    throw error;
  } finally { clearTimeout(timer); signal.removeEventListener("abort", cancel); }
}
