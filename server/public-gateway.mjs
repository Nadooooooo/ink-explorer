import http from "node:http";
import { publicApiPath, allowedPublicMethod, proxyPublicApi } from "./public-proxy.mjs";
const port = Number(process.env.INK_GATEWAY_PORT || 4186);
const upstream = new URL(process.env.INK_GATEWAY_UPSTREAM || "http://127.0.0.1:4188");
if (upstream.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(upstream.hostname) || upstream.username || upstream.password || upstream.pathname !== "/" || upstream.search || upstream.hash) throw new Error("Gateway upstream must be loopback HTTP");
const route = req => {
  const url = new URL(req.url, "http://gateway.invalid");
  // Serve strips the mounted /ink prefix; accept it as well for direct tests
  // and reverse proxies that preserve their configured mount path.
  return publicApiPath(url.pathname.replace(/^\/ink(?=\/)/, "") + url.search);
};
const server = http.createServer((req, res) => {
  let path;
  try { path = route(req); } catch { res.writeHead(404); return res.end(); }
  return proxyPublicApi(req, res, { origin: upstream.origin, path });
});
server.on("upgrade", (req, socket, head) => {
  let path;
  try { path = route(req); } catch { return socket.destroy(); }
  if (!/^\/(?:testnet\/)?api\/live$/.test(path) || !allowedPublicMethod(path, req.method)) return socket.destroy();
  const headers = { ...req.headers, host: upstream.host };
  delete headers.authorization; delete headers.cookie;
  for (const key of Object.keys(headers)) if (key.startsWith("x-forwarded-") || key === "forwarded") delete headers[key];
  const request = http.request({ hostname: upstream.hostname, port: upstream.port, path, headers, method: "GET" });
  request.on("upgrade", (response, upstreamSocket, upstreamHead) => {
    socket.write(`HTTP/1.1 ${response.statusCode} Switching Protocols\r\n${Object.entries(response.headers).map(([key, value]) => `${key}: ${value}`).join("\r\n")}\r\n\r\n`);
    if (head.length) upstreamSocket.write(head); if (upstreamHead.length) socket.write(upstreamHead);
    socket.pipe(upstreamSocket).pipe(socket);
    socket.on("error", () => upstreamSocket.destroy()); socket.on("close", () => upstreamSocket.destroy()); upstreamSocket.on("error", () => socket.destroy());
  });
  request.on("response", response => { response.resume(); socket.destroy(); });
  request.on("error", () => socket.destroy()); socket.on("close", () => request.destroy());
  request.setTimeout(10000, () => request.destroy()); request.end();
});
server.listen(port, "127.0.0.1", () => console.log(`Ink public API gateway listening on loopback port ${port}`));
