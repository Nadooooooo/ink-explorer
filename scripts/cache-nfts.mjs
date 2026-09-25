import { sampleNftHolder } from "./public-nft-fixture.mjs";

const base = process.env.BASE_URL || "http://127.0.0.1:4188";
const address = process.argv[2] || await sampleNftHolder(base);
if (!/^0x[a-fA-F0-9]{40}$/.test(address)) throw new Error("Expected an Ink address");

const payload = await fetch(`${base}/api/explorer/addresses/${address}/nft`).then(async response => {
  if (!response.ok) throw new Error(`NFT index returned ${response.status}`);
  return response.json();
});
const urls = [...new Set((payload.items || []).map(item => item.image_url || item.metadata?.image_url || item.metadata?.image).filter(url => typeof url === "string" && url.startsWith("https://")))];
let cursor = 0, downloaded = 0, unavailable = 0, bytes = 0;

async function worker() {
  while (cursor < urls.length) {
    const remote = urls[cursor++];
    try {
      const response = await fetch(`${base}/api/media?url=${encodeURIComponent(remote)}`);
      if (!response.ok) throw new Error(String(response.status));
      bytes += Number(response.headers.get("content-length") || 0);
      downloaded++;
    } catch {
      unavailable++;
    }
  }
}

await Promise.all(Array.from({ length: Math.min(4, urls.length) }, worker));
console.log(`NFT cache ready for ${address}: ${downloaded}/${urls.length} images, ${(bytes / 1_000_000).toFixed(1)} MB read, ${unavailable} unavailable.`);
