type Row = Record<string, any>;

let amountLocale: {
  locale: string;
  formatter: Intl.NumberFormat;
  decimal: string;
  digits: string[];
} | undefined;

function amountFormat(locale: string) {
  if (amountLocale?.locale === locale) return amountLocale;
  const formatter = new Intl.NumberFormat(locale);
  amountLocale = {
    locale,
    formatter,
    decimal: formatter.formatToParts(1.1).find(part => part.type === "decimal")?.value || ".",
    digits: Array.from({ length: 10 }, (_, digit) => formatter.format(digit)),
  };
  return amountLocale;
}

// Detail amounts retain every wei, including values beyond Number precision.
export function formatWei(value: unknown, locale = "en"): string {
  return formatChainAmount(value, 18, locale);
}

export function formatChainAmount(value: unknown, decimals: unknown, locale = "en", maximumFractionDigits?: number): string {
  if (value == null || value === "" || decimals == null || decimals === "") return "—";
  if (typeof value === "number" && !Number.isSafeInteger(value)) return "—";
  const precision = Number(decimals);
  if (!Number.isInteger(precision) || precision < 0 || precision > 255 || !/^-?\d+$/.test(String(value))) return "—";
  if (maximumFractionDigits != null && (!Number.isInteger(maximumFractionDigits) || maximumFractionDigits < 0)) return "—";
  try {
    const amount = BigInt(String(value));
    let absolute = amount < 0n ? -amount : amount;
    if (maximumFractionDigits != null && maximumFractionDigits < precision) {
      const step = 10n ** BigInt(precision - maximumFractionDigits);
      if (absolute > 0n && absolute < step) {
        return `${amount < 0n ? "> −" : "< "}${formatChainAmount(step, precision, locale)}`;
      }
      absolute = ((absolute + step / 2n) / step) * step;
    }
    const scale = 10n ** BigInt(precision);
    const whole = absolute / scale;
    const fraction = precision ? String(absolute % scale).padStart(precision,"0").replace(/0+$/,"") : "";
    const format = amountFormat(locale);
    const digits = fraction.replace(/\d/g, digit => format.digits[Number(digit)]);
    return `${amount<0n?"−":""}${format.formatter.format(whole)}${fraction?format.decimal+digits:""}`;
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

export function blockFinality(block: Row, snapshot?: Row): "confirmed" | "safe" | "finalized" | "Forked block" {
  if (block.type === "reorg") return "Forked block";
  if (!snapshot?.synced || !snapshot.online || snapshot.stale || snapshot.chainId !== snapshot.expectedChainId) return "confirmed";
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

export function mergeIndexedBlocks(current: Row[], indexed: Row[]): Row[] {
  const seen = new Set<string>();
  return [...indexed, ...current]
    .sort((first, second) => Number(second.height) - Number(first.height))
    .filter(block => {
      const key = String(block.height ?? block.hash);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, Math.max(current.length, indexed.length));
}
