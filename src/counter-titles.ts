// Keep compact, grammatical labels for the public 24-hour fee counters.
// Counter IDs and values remain the authoritative API contract.
export function counterTitle(id: string, sourceTitle: string): string {
  if (id === "txnsFee24h") return "Transaction fees · 24h";
  if (id === "averageTxnFee24h") return "Avg. tx fee · 24h";
  return sourceTitle;
}
