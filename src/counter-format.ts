// Overview values stay readable; their exact source values remain in details.
export function formatCounterValue(value: unknown, locale: string, units?: string) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
  const number = Number(value), magnitude = Math.abs(number);
  if (units === 'ETH' && magnitude > 0 && magnitude < 1e-9) {
    return new Intl.NumberFormat(locale, { notation:'scientific', maximumFractionDigits:3 }).format(number);
  }
  const compact = !units && magnitude >= 1e6;
  const feeDigits = magnitude === 0 ? 0 : Math.min(9, Math.max(0, 3 - Math.floor(Math.log10(magnitude))));
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits:units === 'ETH' ? feeDigits : units ? 3 : compact ? 2 : 0,
    notation:compact ? 'compact' : 'standard',
  }).format(number);
}

// Keep the header concise; the exact wei-derived amount remains in its title.
export function formatCompactGas(wei: unknown, locale: string) {
  if (typeof wei !== 'string' && typeof wei !== 'number' && typeof wei !== 'bigint') return 'N/A';
  if (!/^\d+$/.test(String(wei))) return 'N/A';
  const gwei = Number(wei) / 1e9;
  if (!Number.isFinite(gwei)) return 'N/A';
  return `${new Intl.NumberFormat(locale, { maximumSignificantDigits:3 }).format(gwei)} Gwei`;
}
