import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const origin = process.env.MONITOR_ORIGIN || "https://inkexplorer.xyz";
const apiOrigin = process.env.MONITOR_API_ORIGIN || origin;
const directory = path.resolve("data/production-monitor");
await mkdir(directory, { recursive: true });
let previous;
try { previous = JSON.parse(await readFile(path.join(directory, "status.json"), "utf8")); } catch { /* first observation */ }

export async function sample() {
  const checks = [];
  const routes = [
    ["/", "page", null],
    ...[ ["", 57073], ["/testnet", 763373] ].flatMap(([prefix, chainId]) => [
      [`${prefix}/api/network`, "network", chainId],
      [`${prefix}/api/live/snapshot`, "live", chainId],
      [`${prefix}/api/explorer/blocks`, "blocks", chainId],
      [`${prefix}/api/explorer/transactions`, "transactions", chainId],
      [`${prefix}/api/stats/counters`, "counters", chainId],
      [`${prefix}/api/contract-info/pools`, "pools", chainId],
    ]),
  ];
  for (const [route, type, chainId] of routes) {
    const start = Date.now();
    try {
      // Keep public page and network checks at the edge. Validate the larger
      // data suite at the origin rather than spending Workers quota on probes.
      const targetOrigin = ["page", "network"].includes(type) ? origin : apiOrigin;
      const response = await fetch(targetOrigin + route, { signal: AbortSignal.timeout(20000), redirect: "error", headers: { "user-agent": "InkExplorer-Health/1.0" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      let details = {};
      if (type !== "page") {
        const freshness = response.headers.get("x-ink-data-status");
        if (freshness && freshness !== "fresh") throw new Error(`Data source ${freshness}`);
        const data = await response.json();
        if (type === "network") {
          details = { chainId: data.chainId, online: data.online, synced: data.synced, stale: data.stale, head: data.head, derivationSynced: data.derivation?.synced };
          if (data.chainId !== chainId || !data.online || !data.synced || data.stale || !data.derivation?.online || !data.derivation?.synced) throw new Error("Chain health degraded");
        } else if (type === "live") {
          const latest = data.utilization?.toBlock;
          const sampledAt = Date.parse(data.utilization?.sampledAt);
          details = { chainId: data.network?.chainId, head: data.block?.height, utilizationHead: latest, sampledAt: data.utilization?.sampledAt };
          if (data.network?.chainId !== chainId || !Number.isSafeInteger(latest) || latest !== data.block?.height || data.utilization?.blocks !== 30 || !Number.isFinite(sampledAt) || Math.abs(Date.now() - sampledAt) > 120000 || !Number.isFinite(data.utilization?.percentage) || data.utilization.percentage < 0 || data.utilization.percentage > 100) throw new Error("Live snapshot stale or inconsistent");
        } else if (type === "blocks" || type === "transactions") {
          const first = data.items?.[0], timestamp = Date.parse(first?.timestamp);
          details = { count: data.items?.length, height: first?.height ?? first?.block_number, latestAt: first?.timestamp, freshness };
          if (!Array.isArray(data.items) || !data.items.length || !Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 15 * 60000) throw new Error("Indexed activity stale or invalid");
        } else if (type === "counters") {
          const counters = data.counters;
          const important = ["totalBlocks", "newTxns24h", "totalAccounts"];
          details = { count: counters?.length, freshness };
          if (!Array.isArray(counters) || important.some(id => !counters.some(row => row.id === id && /^\d+(?:\.\d+)?$/.test(String(row.value))))) throw new Error("Statistics unavailable or invalid");
        } else if (type === "pools") {
          details = { count: data.items?.length, freshness };
          if (!Array.isArray(data.items) || chainId === 57073 && !data.items.length) throw new Error("Pool catalogue unavailable or invalid");
        }
      } else {
        const html = await response.text();
        if (!html.includes(`<link rel="canonical" href="${origin}/"`) || !html.includes("Ink Explorer")) throw new Error("Public page or canonical mismatch");
      }
      checks.push({ route, type, passed: true, milliseconds: Date.now() - start, ...details });
    } catch (error) { checks.push({ route, type, passed: false, milliseconds: Date.now() - start, error: error.message }); }
  }
  const healthy = checks.every(check => check.passed);
  const status = { checkedAt: new Date().toISOString(), origin, healthy, coreHealthy: checks.filter(check => ["page", "network", "live"].includes(check.type)).every(check => check.passed), dataHealthy: checks.filter(check => !["page", "network", "live"].includes(check.type)).every(check => check.passed), checks, consecutiveFailures: healthy ? 0 : (previous?.consecutiveFailures || 0) + 1 };
  const temporary = path.join(directory, "status.tmp");
  await writeFile(temporary, JSON.stringify(status, null, 2));
  await rename(temporary, path.join(directory, "status.json"));
  console[status.healthy ? "log" : "error"](JSON.stringify(status));
  previous = status;
  return status;
}

await sample();
if (!process.argv.includes("--once")) {
  // Schedule after completion: a slow origin cannot overlap monitoring rounds.
  const next = () => setTimeout(async () => {
    try { await sample(); } catch (error) { console.error(error.message); }
    next();
  }, 5 * 60 * 1000);
  next();
}
