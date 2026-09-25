const base = process.env.BASE_URL || "http://127.0.0.1:4188";
const failures = [];

async function expectStatus(path, status, init) {
  const response = await fetch(`${base}${path}`, init);
  if (response.status !== status) failures.push(`${path}: expected ${status}, received ${response.status}`);
  return response;
}

await expectStatus("/api/overview", 405, { method: "POST", body: "{}" });
const head = await expectStatus("/", 200, { method: "HEAD" });
if ((await head.text()).length !== 0 || !head.headers.get("content-type")?.startsWith("text/html")) failures.push("HEAD: public pages must return GET headers without a body");
await expectStatus("/api/explorer/import/smart-contracts/test", 400);
await expectStatus("/api/explorer/addresses/../../stats", 404);
await expectStatus("/api/contract-info/pools/not-an-address", 400);
await expectStatus("/api/contract-info/verified-addresses", 400);
await expectStatus(`/api/search?q=${"x".repeat(4100)}`, 414);
await expectStatus("/api/media?url=http%3A%2F%2F127.0.0.1%3A8545", 502);
await expectStatus("/api/media?url=https%3A%2F%2Flocalhost%2Fsecret", 502);
await expectStatus("/api/media?url=https%3A%2F%2F%5B%3A%3Affff%3A127.0.0.1%5D%2F", 502);
await expectStatus("/api/media?url=https%3A%2F%2F192.0.2.1%2F", 502);
await expectStatus("/definitely-not-a-route", 404);

const html = await fetch(`${base}/`).then(response => {
  const csp = response.headers.get("content-security-policy") || "";
  const permissions = response.headers.get("permissions-policy") || "";
  if (!csp.includes("frame-ancestors 'none'") || !csp.includes("object-src 'none'")) failures.push("HTML: restrictive CSP is missing");
  if (!permissions.includes("camera=()") || response.headers.get("x-frame-options") !== "DENY") failures.push("HTML: browser security headers are incomplete");
  return response.text();
});
if (!html.includes('rel="canonical"') || !html.includes('name="robots" content="index,follow')) failures.push("HTML: crawl metadata is incomplete");

const assetPath = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
if (!assetPath) {
  failures.push("Assets: hashed JavaScript entry was not found");
} else {
  const compressed = await fetch(`${base}${assetPath}`, { headers: { "accept-encoding": "br" } });
  if (compressed.headers.get("content-encoding") !== "br" || !compressed.headers.get("vary")?.includes("Accept-Encoding")) failures.push("Assets: Brotli negotiation is missing");
  if (!compressed.headers.get("cache-control")?.includes("immutable")) failures.push("Assets: hashed bundle cache is not immutable");
  await compressed.arrayBuffer();
}
const mutableAsset = await fetch(`${base}/manifest.webmanifest`);
if (mutableAsset.headers.get("cache-control")?.includes("immutable")) failures.push("Assets: unhashed manifest must remain replaceable");

const api = await fetch(`${base}/api/health`);
if (api.headers.get("x-robots-tag") !== "noindex, nofollow" || api.headers.get("cache-control") !== "no-store") failures.push("API: indexing or cache protections are missing");

const search = await fetch(`${base}/search?q=WETH`).then(response => response.text());
if (!search.includes('name="robots" content="noindex,follow"')) failures.push("Search: result pages should not be indexed");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Security boundary test passed (methods, proxy allow-lists, SSRF, headers and crawl policy).");
