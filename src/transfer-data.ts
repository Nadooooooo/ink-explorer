export type TransferNft = { id: string; quantity?: string; record?: Record<string, any> };
function unsigned(value: unknown): string | undefined {
  if (typeof value === "number" && !Number.isSafeInteger(value)) return;
  return /^(?:0|[1-9]\d*)$/.test(String(value ?? "")) ? String(value) : undefined;
}
export function transferNfts(item: Record<string, any>): TransferNft[] {
  const total = item.total || {}, ids = Array.isArray(total.token_ids) ? total.token_ids : [total.token_id ?? item.token_id];
  return ids.flatMap((value: unknown, index: number) => {
    const id = unsigned(value);
    if (id === undefined) return [];
    const raw = Array.isArray(total.token_ids) ? total.values?.[index] : total.value;
    const quantity = unsigned(raw) ?? (raw == null && item.token?.type === "ERC-721" ? "1" : undefined);
    const record = (!Array.isArray(total.token_ids) && total.token_instance?.id == null) || String(total.token_instance?.id) === id ? total.token_instance : undefined;
    return [{ id, quantity, record }];
  });
}
