// Blockscout currently labels its native-coin transfer series as token
// transfers. Keep the chart meaning aligned with its metric identifier.
export const nativeTransferDescription = "Number of ETH transfers completed in each period.";

export function chartDescription(id: string, description: string): string {
  return id === "newNativeCoinTransfers" ? nativeTransferDescription : description;
}
