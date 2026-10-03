type Row = Record<string, any>;

// Detail amounts retain every wei, including values beyond Number precision.
export function formatWei(value: unknown, locale = "en"): string {
  if(value == null || value === "")return "—";
  try {
    const amount=BigInt(String(value)),absolute=amount<0n?-amount:amount;
    const whole=absolute/1000000000000000000n;
    const fraction=String(absolute%1000000000000000000n).padStart(18,"0").replace(/0+$/,"");
    const formatter=new Intl.NumberFormat(locale,{useGrouping:false});
    const decimal=new Intl.NumberFormat(locale).formatToParts(1.1).find(part=>part.type==="decimal")?.value || ".";
    const digits=fraction.replace(/\d/g,digit=>formatter.format(Number(digit)));
    return `${amount<0n?"−":""}${whole.toLocaleString(locale)}${fraction?decimal+digits:""}`;
  }catch{return "—";}
}

export function stateChangeText(value: unknown): string {
  if(value == null)return "—";
  // ERC-721 changes are arrays of {direction,total}, not a scalar balance diff.
  return typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
}

export function transactionState(tx: Row): "pending" | "failed" | "confirmed" | "success" {
  if (tx.status === "error" || tx.result === "error" || tx.result === "reverted") return "failed";
  if (tx.status === "pending" || tx.block_number == null) return "pending";
  if (tx.status === "ok" || tx.result === "success") return "success";
  // A block inclusion from the live node does not prove execution success.
  return "confirmed";
}

export function blockFinality(block: Row, snapshot?: Row): "confirmed" | "safe" | "finalized" {
  if (!snapshot?.synced || !snapshot.online || snapshot.chainId !== snapshot.expectedChainId) return "confirmed";
  const height = Number(block.height);
  if (!Number.isSafeInteger(height) || height < 0) return "confirmed";
  if (Number.isSafeInteger(snapshot.finalizedBlock) && snapshot.finalizedBlock > 0 && height <= snapshot.finalizedBlock) return "finalized";
  if (Number.isSafeInteger(snapshot.safeBlock) && snapshot.safeBlock > 0 && height <= snapshot.safeBlock) return "safe";
  return "confirmed";
}

export function executionFee(tx: Row): string | undefined {
  // The OP Stack API includes L1 data in fee.value. Prefer the actual gas
  // product so extra chain-specific fee components cannot distort execution.
  if (tx.fee?.type !== "actual" || tx.fee?.value == null) return undefined;
  try {
    if (tx.gas_used != null && tx.gas_price != null) return String(BigInt(tx.gas_used) * BigInt(tx.gas_price));
    if (tx.l1_fee == null) return undefined;
    const value = BigInt(tx.fee.value) - BigInt(tx.l1_fee);
    return value >= 0n ? String(value) : undefined;
  } catch {
    return undefined;
  }
}

export function cursorQuery(cursor?: Row | null): string {
  if (!cursor) return "";
  const query = new URLSearchParams(Object.entries(cursor)
    .filter(([, value]) => value != null)
    .map(([key, value]) => [key, String(value)])).toString();
  return query ? `?${query}` : "";
}
