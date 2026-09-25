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
export const API = `${basePath}/api`;
export function networkPath(path: string) {
  return `${basePath}${path.startsWith("/") ? path : `/${path}`}`;
}
