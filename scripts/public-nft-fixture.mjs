// Uniswap v4 PositionManager on Ink: https://developers.uniswap.org/deployments
// Select a holder at runtime so the repository does not pin anyone's wallet.
export const nftContract = "0x1b35d13a2E2528f192637F14B05f0Dc0e7dEB566";
export const nftInstance = "545";

export async function sampleNftHolder(base) {
  const response = await fetch(`${base}/api/explorer/tokens/${nftContract}/holders`);
  if (!response.ok) throw new Error(`NFT holder list returned ${response.status}`);
  const payload = await response.json();
  const candidates = (payload.items || []).filter((item) => {
    const address = item.address?.hash;
    if (!/^0x[a-fA-F0-9]{40}$/.test(address || "")) return false;
    try { return BigInt(item.value) >= 50n; } catch { return false; }
  });
  for (const holder of candidates) {
    const address = holder.address.hash;
    const nftResponse = await fetch(`${base}/api/explorer/addresses/${address}/nft`);
    if (!nftResponse.ok) continue;
    const nfts = await nftResponse.json();
    const hasMedia = nfts.items?.some((item) =>
      [item.image_url, item.metadata?.image_url, item.metadata?.image]
        .some((url) => typeof url === "string" && url.startsWith("https://")),
    );
    if (nfts.items?.length === 50 && nfts.next_page_params && hasMedia) return address;
  }
  throw new Error("No public NFT holder with pagination and HTTPS media for browser checks");
}
