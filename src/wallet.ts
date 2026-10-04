import { useEffect, useRef, useState } from "react";
import { toQuantity } from "ethers";
import { network, networkPath } from "./network";

export type Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<any>;
  on?: (name: "accountsChanged" | "chainChanged" | "disconnect", listener: (...args: any[]) => void) => void;
  removeListener?: (name: "accountsChanged" | "chainChanged" | "disconnect", listener: (...args: any[]) => void) => void;
  disconnect?: () => Promise<void>;
};
export type Wallet = { provider: Provider; account: string; chain: number; kind?: "browser" | "walletconnect" };

export async function selectWallet(provider: Provider, kind: Wallet["kind"] = "browser"): Promise<Wallet> {
  await provider.request({ method: "eth_requestAccounts" });
  if (Number(await provider.request({ method: "eth_chainId" })) !== network.chainId) {
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: toQuantity(network.chainId) }] });
    } catch (error: any) {
      if (error.code !== 4902) throw error;
      await provider.request({ method: "wallet_addEthereumChain", params: [{
        chainId: toQuantity(network.chainId), chainName: network.name,
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: [network.rpc], blockExplorerUrls: [new URL(networkPath("/"), location.origin).href],
      }] });
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: toQuantity(network.chainId) }] });
    }
  }
  const chain = Number(await provider.request({ method: "eth_chainId" }));
  const accounts = await provider.request({ method: "eth_accounts" });
  if (chain !== network.chainId || !Array.isArray(accounts) || !/^0x[\da-f]{40}$/i.test(accounts[0]))
    throw new Error("walletWrongNetwork");
  return { provider, account: accounts[0], chain, kind };
}

export function useWallet() {
  const [wallet, setWallet] = useState<Wallet>();
  const [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    if (!wallet) return;
    const changed = () => { generation.current++; setWallet(undefined); setError("walletChangedReconnect"); };
    for (const event of ["accountsChanged", "chainChanged", "disconnect"] as const) wallet.provider.on?.(event, changed);
    return () => { for (const event of ["accountsChanged", "chainChanged", "disconnect"] as const) wallet.provider.removeListener?.(event, changed); };
  }, [wallet]);
  useEffect(() => () => { generation.current++; }, []);
  return { wallet, error, setError,
    connect: async (provider: Provider, kind: Wallet["kind"], active = () => true) => {
      const request = ++generation.current;
      setError("");
      const next = await selectWallet(provider, kind);
      if (request === generation.current && active()) setWallet(next);
    },
    disconnect: async () => {
      generation.current++;
      const previous = wallet;
      setWallet(undefined); setError("");
      if (previous?.kind === "walletconnect") await previous.provider.disconnect?.();
    },
  };
}
