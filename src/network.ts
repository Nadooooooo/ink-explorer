export const isTestnet = /^\/testnet(?:\/|$)/.test(location.pathname);
export const basePath = isTestnet ? "/testnet" : "";
export const network = isTestnet
  ? {
      name: "Ink Sepolia",
      chainId: 763373,
      rpc: "https://rpc-gel-sepolia.inkonchain.com",
      explorer: "https://explorer-sepolia.inkonchain.com",
    }
  : {
      name: "Ink Mainnet",
      chainId: 57073,
      rpc: "https://rpc-gel.inkonchain.com",
      explorer: "https://explorer.inkonchain.com",
    };
// A static deployment can use the private HTTPS API exposed through Tailscale.
// The value is a public origin, never an RPC credential or a local node URL.
export const apiOrigin = (import.meta.env.VITE_API_ORIGIN || "").replace(/\/$/, "");
export const API = `${apiOrigin}${basePath}/api`;
export const liveWebSocketUrl = (() => {
  const url = new URL(`${API}/live`, location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
})();
export function networkPath(path: string) {
  return `${basePath}${path.startsWith("/") ? path : `/${path}`}`;
}
