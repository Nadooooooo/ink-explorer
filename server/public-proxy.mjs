// Shared by the static hosting function and the optional loopback gateway.
// The destination is operator configuration, never a request parameter.
export function publicApiOrigin(env = process.env) {
  let configured = env.INK_PUBLIC_API_ORIGIN;
  if (!configured && env.VITE_API_ORIGIN) {
    // Compatibility with older deployments whose build environment still
    // points at a tailnet-only Serve port. Funnel uses a separate public port.
    const legacy = new URL(env.VITE_API_ORIGIN);
    if (legacy.hostname.endsWith(".ts.net") && legacy.port === "4189") {
      legacy.port = "8443"; legacy.pathname = "/ink"; legacy.search = ""; legacy.hash = "";
      configured = legacy.href;
    } else configured = env.VITE_API_ORIGIN;
  }
  if (!configured) throw new Error("Public API origin is not configured");
  const url = new URL(configured);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("Invalid public API origin");
  return url.href.replace(/\/$/, "");
}
export function publicApiPath(value) {
  if (typeof value !== "string" || value.length > 8192 || /[\\\x00-\x20]/.test(value)) throw new Error("Invalid API path");
  const rawPath = decodeURIComponent(value.split(/[?#]/, 1)[0]);
  if (/\/\.{1,2}(?:\/|$)/.test(rawPath) || /[\\\x00-\x20]/.test(rawPath)) throw new Error("Invalid API path");
  const url = new URL(value, "http://gateway.invalid");
  if (url.origin !== "http://gateway.invalid" || !/^\/(?:testnet\/)?api\/[a-zA-Z0-9_.%~/-]+$/i.test(url.pathname)) throw new Error("Invalid API path");
  const decoded = decodeURIComponent(url.pathname);
  if (decoded.includes("..") || /%2f|%5c|%2e/i.test(url.pathname) || /[\\\x00-\x20]/.test(decoded)) throw new Error("Invalid API path");
  return url.pathname + url.search;
}
export function allowedPublicMethod(path, method) {
  if (method === "GET" || method === "HEAD") return true;
  return method === "POST" && /^\/(?:testnet\/)?api\/(?:contract-rpc|approvals\/0x[\da-f]{40}\/state|verification\/submit|public-tags\/submit)$/i.test(new URL(path, "http://gateway.invalid").pathname);
}
export async function proxyPublicApi(req, res, { origin, path, fetcher = fetch }) {
  const sendError = (status, error) => { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" }); res.end(JSON.stringify({ error })); };
  let target;
  try { path = publicApiPath(path); target = new URL(`${origin}${path}`); } catch { return sendError(400, "Invalid API path"); }
  if (!allowedPublicMethod(path, req.method)) return sendError(405, "Method not allowed");
  if (new URL(path, "http://gateway.invalid").pathname.endsWith("/api/live")) return sendError(426, "Use the public live WebSocket or snapshot endpoint");
  try {
    let body;
    if (req.method === "POST") {
      if (req.body !== undefined) body = Buffer.isBuffer(req.body) ? req.body : typeof req.body === "string" ? Buffer.from(req.body) : Buffer.from(JSON.stringify(req.body));
      else {
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 4 * 1024 * 1024) return sendError(413, "Request exceeds the hosting limit"); chunks.push(chunk); }
        body = Buffer.concat(chunks);
      }
      if (body.length > 4 * 1024 * 1024) return sendError(413, "Request exceeds the hosting limit");
    }
    const headers = { accept: req.headers.accept || "application/json" };
    if (req.headers["content-type"]) headers["content-type"] = req.headers["content-type"];
    // Preserve the browser's actual Origin; credentials and forwarded host/IP
    // headers are deliberately excluded. Upstream validates each write route.
    if (req.headers.origin) headers.origin = req.headers.origin;
    const upstream = await fetcher(target, { method: req.method, headers, body, redirect: "error", signal: AbortSignal.timeout(55000) });
    const responseHeaders = { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow", "x-content-type-options": "nosniff" };
    for (const name of ["content-type", "cache-control", "etag", "x-media-cache", "content-security-policy", "retry-after"]) if (upstream.headers.has(name)) responseHeaders[name] = upstream.headers.get(name);
    res.writeHead(upstream.status, responseHeaders);
    if (req.method === "HEAD") { await upstream.body?.cancel(); return res.end(); }
    if (upstream.body) for await (const chunk of upstream.body) {
      if (res.destroyed) { await upstream.body.cancel().catch(() => {}); return; }
      if (!res.write(chunk)) await new Promise(resolve => { res.once("drain", resolve); res.once("close", resolve); });
    }
    res.end();
  } catch { if (!res.headersSent) sendError(502, "apiConnectionFailed"); else res.destroy(); }
}
