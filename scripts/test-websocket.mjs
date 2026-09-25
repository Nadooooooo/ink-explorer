import WebSocket from "ws";

const endpoint = process.env.WS_URL || "ws://127.0.0.1:4188/api/live";
const socket = new WebSocket(endpoint);
const frames = [];
let finishing = false;
const timeout = setTimeout(() => {
  console.error(`Timed out waiting for live frames from ${endpoint}`);
  process.exit(1);
}, 12000);

socket.on("message", async raw => {
  const frame = JSON.parse(String(raw));
  if (!["welcome", "network", "block"].includes(frame.type)) return;
  frames.push(frame);
  if (frames.length < 2 || !frames.some(item => item.type === "block") || finishing) return;
  finishing = true;
  const latest = frames.at(-1);
  if (latest.protocol !== "ink-observer.live.v1") throw new Error("Unexpected live protocol");
  if (!latest.network?.online || !latest.network?.synced) throw new Error("Node is not reported live and synced");
  if (!latest.block?.height || !latest.block?.hash) throw new Error("Live block payload is incomplete");
  if (!Array.isArray(latest.transactions)) throw new Error("Live transaction payload is missing");
  if (latest.sequence <= frames[0].sequence) throw new Error("Live sequence did not advance");
  const statusUrl = endpoint.replace(/^ws/, "http").replace(/\/api\/live$/, "/api/live/status");
  const status = await fetch(statusUrl).then(response => response.json());
  if (status.clients < 1 || status.protocol !== "ink-observer.live.v1") throw new Error("Live status does not report the connected client");
  clearTimeout(timeout);
  console.log(`WebSocket live test passed (${frames.map(item=>item.type).join(" → ")}, head #${latest.block.height}, ${latest.transactions.length} transactions, sequence ${latest.sequence}).`);
  socket.close();
});

socket.on("error", error => {
  clearTimeout(timeout);
  console.error(error);
  process.exit(1);
});
