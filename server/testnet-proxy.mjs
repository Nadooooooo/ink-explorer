import http from "node:http";
import net from "node:net";

const testnetPort = Number(process.env.INK_TESTNET_PORT || 4190);

// One isolated server per network: caches, live state and upstreams never mix.
export function proxyTestnet(req, res) {
  const upstream = http.request(
    {
      hostname: "127.0.0.1",
      port: testnetPort,
      path: req.url.replace(/^\/testnet(?=\/|\?|$)/, "") || "/",
      method: req.method,
      headers: req.headers,
    },
    (response) => {
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent)
      res.writeHead(503, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ error: "Testnet explorer temporarily unavailable" }),
    );
  });
  upstream.setTimeout(35000, () => upstream.destroy());
  res.on("close", () => upstream.destroy());
  req.pipe(upstream);
}

export function proxyTestnetSocket(req, socket, head) {
  const upstream = net.connect(testnetPort, "127.0.0.1", () => {
    const headers = req.rawHeaders.reduce(
      (lines, value, index, all) =>
        index % 2 ? lines : `${lines}${value}: ${all[index + 1]}\r\n`,
      "",
    );
    upstream.write(`GET /api/live HTTP/1.1\r\n${headers}\r\n`);
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
  socket.on("close", () => upstream.destroy());
  upstream.on("close", () => socket.destroy());
}
