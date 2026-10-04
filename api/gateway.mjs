import { publicApiOrigin, publicApiPath, proxyPublicApi } from "../server/public-proxy.mjs";
export const config = { maxDuration: 60, api: { bodyParser: false } };
export default async function handler(req, res) {
  try {
    const requestUrl = new URL(req.url, "https://gateway.invalid");
    // Node hosting adapters may retain the original req.url while adding
    // rewrite parameters to req.query. Support both representations.
    const route = req.query?.path || requestUrl.searchParams.get("path") ||
      (requestUrl.pathname !== "/api/gateway" ? requestUrl.pathname : "");
    if (typeof route !== "string") throw new Error("Invalid API route");
    requestUrl.searchParams.delete("path");
    const path = publicApiPath(`${route || ""}${requestUrl.searchParams.size ? `?${requestUrl.searchParams}` : ""}`);
    const origin = publicApiOrigin();
    if (["GET", "HEAD"].includes(req.method) && /^\/(?:testnet\/)?api\/live\/config$/.test(new URL(path, "http://gateway.invalid").pathname)) {
      const websocket = new URL(`${origin}${path.replace(/\/config(?:\?.*)?$/, "")}`);
      websocket.protocol = "wss:";
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" });
      return res.end(JSON.stringify({ url: websocket.href }));
    }
    return proxyPublicApi(req, res, { origin, path });
  } catch { res.writeHead(503, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify({ error: "apiConnectionFailed" })); }
}
