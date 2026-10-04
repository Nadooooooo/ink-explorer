export const isTestnet = /^\/testnet(?:\/|$)/.test(location.pathname);
export const basePath = isTestnet ? "/testnet" : "";
export const network = isTestnet
  ? {
      name: "Ink Sepolia",
      chainId: 763373,
      rpc: "https://rpc-gel-sepolia.inkonchain.com",
    }
  : {
      name: "Ink Mainnet",
      chainId: 57073,
      rpc: "https://rpc-gel.inkonchain.com",
    };
// Same-origin API routes work on local hosting and Vercel. Legacy private
// VITE_API_ORIGIN is consumed only by the server-side migration adapter.
export const apiOrigin = (import.meta.env.VITE_PUBLIC_API_ORIGIN || "").replace(/\/$/, "");
export const API = `${apiOrigin}${basePath}/api`;
export let liveWebSocketUrl = (() => {
  const url = new URL(`${API}/live`, location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
})();
export async function resolveLiveWebSocketUrl() {
  try {
    const response = await fetch(`${API}/live/config`, { signal: AbortSignal.timeout(5000) });
    const value = await response.json();
    const url = new URL(value.url);
    if (response.ok && ["ws:", "wss:"].includes(url.protocol) && !url.username && !url.password && url.pathname.endsWith(`${basePath}/api/live`) && (isTestnet || !/\/testnet\/api\/live$/.test(url.pathname))) liveWebSocketUrl = url.href;
  } catch { /* The local WebSocket remains usable while config is unavailable. */ }
  return liveWebSocketUrl;
}
export function networkPath(path: string) {
  return `${basePath}${path.startsWith("/") ? path : `/${path}`}`;
}
export function externalDestination(value: unknown) {
  try { const url=new URL(String(value)); return url.protocol === "https:" && !/^explorer(?:-sepolia)?\.inkonchain\.com$/.test(url.hostname) ? url.href : undefined; }
  catch { return undefined; }
}
