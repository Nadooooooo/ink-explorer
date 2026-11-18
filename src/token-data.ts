export const TOKEN_STANDARDS = ["ERC-20", "ERC-721", "ERC-1155", "ERC-404"] as const;
export const TOKEN_SORTS = ["circulating_market_cap", "holders_count", "fiat_value"] as const;
export type TokenFilters = { search: string; standard: string; sort: string; order: "desc" };
export function tokenCursorQuery(cursor?: Record<string, unknown> | null): string {
  if (!cursor) return "";
  // Blockscout token sorting requires the null market_cap/fiat_value keys:
  // omitting them silently restarts at page one instead of advancing.
  const query = new URLSearchParams(Object.entries(cursor).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])).toString();
  return query ? `?${query}` : "";
}
export function readTokenFilters(query: URLSearchParams): TokenFilters {
  const standard = query.get("type") || "", sort = query.get("sort") || "";
  return { search: (query.get("q") || "").trim().slice(0, 256), standard: TOKEN_STANDARDS.some(value => value === standard) ? standard : "", sort: TOKEN_SORTS.some(value => value === sort) ? sort : "circulating_market_cap", order: "desc" };
}
export function tokenListQuery(filters: TokenFilters, cursor = ""): string {
  const query = new URLSearchParams(cursor);
  for (const key of ["q", "type", "sort", "order"]) query.delete(key);
  if (filters.search) query.set("q", filters.search);
  if (filters.standard) query.set("type", filters.standard);
  query.set("sort", filters.sort); query.set("order", filters.order);
  return `?${query}`;
}
function positiveNumber(value: unknown): number | undefined {
  if (value == null || typeof value === "boolean" || typeof value === "object" || typeof value === "string" && !value.trim()) return;
  if (typeof value === "string" && !/^\+?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return;
  const number = Number(value);
  if (number === 0 && typeof value === "string" && /[1-9]/.test(value.split(/e/i)[0])) return;
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}
export function tokenOnchainCap(token: Record<string, any>): number | undefined {
  return tokenFiatValue(token.total_supply, token.decimals, token.exchange_rate);
}
export function tokenFiatValue(raw: unknown, precision: unknown, quote: unknown): number | undefined {
  const price = positiveNumber(quote), decimals = positiveNumber(precision);
  if (typeof raw !== "string" && typeof raw !== "bigint" && !(typeof raw === "number" && Number.isSafeInteger(raw))) return;
  if (price == null || decimals == null || !Number.isInteger(decimals) || decimals > 255 || !/^\d+$/.test(String(raw ?? ""))) return;
  // Insert the decimal point before converting; a large base-unit integer can
  // overflow Number even when the scaled supply is representable.
  const digits = String(raw).padStart(decimals + 1, "0");
  const supply = Number(decimals ? `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}` : digits);
  const value = supply * price;
  return Number.isFinite(value) && !(value === 0 && supply > 0 && price > 0) ? value : undefined;
}
export function tokenUsd(value: unknown, locale = "en", mode: "price" | "cap" | "exact" = "exact"): string {
  const number = positiveNumber(value);
  if (number == null) return "N/A";
  const minimum = mode === "price" ? 0.00000001 : 0.01;
  const currency = { style: "currency" as const, currency: "USD", currencyDisplay: "narrowSymbol" as const };
  if (number > 0 && number < minimum) return `< ${new Intl.NumberFormat(locale, { ...currency, minimumFractionDigits: 0, maximumFractionDigits: mode === "price" ? 8 : 2 }).format(minimum)}`;
  if (mode === "price" && number > 0) return new Intl.NumberFormat(locale, { ...currency, maximumSignificantDigits: 6 }).format(number);
  const compact = mode === "cap" && number >= 1_000;
  return new Intl.NumberFormat(locale, { ...currency, ...(compact ? { notation: "compact" as const } : {}), maximumFractionDigits: compact ? 1 : 2 }).format(number);
}

/** Validate the requested identity and retain integer precision in mutable totals. */
export function normalizeTokenProfile(value: any, address: string, chainId: number): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      typeof value.address_hash !== "string" || !/^0x[\da-f]{40}$/i.test(value.address_hash) ||
      value.address_hash.toLowerCase() !== address.toLowerCase() ||
      value.chain_id != null && String(value.chain_id) !== String(chainId)) throw new Error("invalidApiResponse");
  const integer = (raw: unknown) => {
    if (typeof raw !== "string" && typeof raw !== "bigint" && !(typeof raw === "number" && Number.isSafeInteger(raw))) return;
    return /^\d+$/.test(String(raw)) ? String(raw) : undefined;
  };
  const precision = positiveNumber(value.decimals);
  return {
    ...value,
    name: typeof value.name === "string" ? value.name : undefined,
    symbol: typeof value.symbol === "string" ? value.symbol : undefined,
    type: typeof value.type === "string" ? value.type : undefined,
    decimals: precision != null && Number.isInteger(precision) && precision <= 255 ? precision : null,
    total_supply: integer(value.total_supply),
    holders_count: integer(value.holders_count),
  };
}

export function normalizeTokenDirectory(value:any,chainId:number):{items:Record<string,any>[];next_page_params:Record<string,unknown>|null} {
  if(!value||typeof value!=="object"||Array.isArray(value)||!Array.isArray(value.items)||
      value.chain_id!=null&&String(value.chain_id)!==String(chainId))throw new Error("invalidApiResponse");
  const seen=new Set<string>();
  const items=value.items.map((item:any)=>{
    const token=normalizeTokenProfile(item,item?.address_hash,chainId),key=token.address_hash.toLowerCase();
    if(seen.has(key))throw new Error("invalidApiResponse");
    seen.add(key);return token;
  });
  const cursor=value.next_page_params;
  if(cursor!=null&&(typeof cursor!=="object"||Array.isArray(cursor)||
      Object.values(cursor).some(field=>field!=null&&!["string","number","boolean"].includes(typeof field)||typeof field==="number"&&!Number.isFinite(field))))
    throw new Error("invalidApiResponse");
  return {items,next_page_params:cursor&&Object.keys(cursor).length?cursor:null};
}

/** A holder page must identify distinct accounts and retain exact base-unit balances. */
export function normalizeTokenHolders(value:any,tokenAddress:string,chainId:number):{items:Record<string,any>[];next_page_params:Record<string,unknown>|null} {
  if(!value||typeof value!=="object"||Array.isArray(value)||!Array.isArray(value.items)||
      value.chain_id!=null&&String(value.chain_id)!==String(chainId)||
      value.token_address_hash!=null&&(typeof value.token_address_hash!=="string"||value.token_address_hash.toLowerCase()!==tokenAddress.toLowerCase()))
    throw new Error("invalidApiResponse");
  const seen=new Set<string>();
  const items=value.items.map((item:any)=>{
    const address=typeof item?.address==="string"?{hash:item.address}:item?.address;
    if(!item||typeof item!=="object"||Array.isArray(item)||!address||typeof address!=="object"||Array.isArray(address)||
        typeof address.hash!=="string"||!/^0x[\da-f]{40}$/i.test(address.hash)||
        address.chain_id!=null&&String(address.chain_id)!==String(chainId))throw new Error("invalidApiResponse");
    const key=address.hash.toLowerCase();
    if(seen.has(key))throw new Error("invalidApiResponse");
    seen.add(key);
    const raw=item.value,valid=(typeof raw==="string"||typeof raw==="bigint"||typeof raw==="number"&&Number.isSafeInteger(raw))&&/^\d+$/.test(String(raw));
    return{...item,address,value:valid?String(raw):undefined};
  });
  const cursor=value.next_page_params;
  if(cursor!=null&&(typeof cursor!=="object"||Array.isArray(cursor)||
      Object.values(cursor).some(field=>field!=null&&!["string","number","boolean"].includes(typeof field)||typeof field==="number"&&!Number.isFinite(field))))
    throw new Error("invalidApiResponse");
  return{items,next_page_params:cursor&&Object.keys(cursor).length?cursor:null};
}
