import type { Provider } from "./wallet";

type InjectedProvider = Provider & {
  isRabby?: boolean; isMetaMask?: boolean; isCoinbaseWallet?: boolean;
  isRainbow?: boolean; isBraveWallet?: boolean; providers?: InjectedProvider[];
};
export type InjectedWallet = { id: string; name: string; provider: Provider };
const wallets = new Map<string, InjectedWallet>();
const listeners = new Set<(wallets: InjectedWallet[]) => void>();
let started = false;

function name(provider: InjectedProvider) {
  if (provider.isRabby) return "Rabby";
  if (provider.isRainbow) return "Rainbow";
  if (provider.isCoinbaseWallet) return "Coinbase Wallet";
  if (provider.isBraveWallet) return "Brave Wallet";
  if (provider.isMetaMask) return "MetaMask";
  return "";
}
function current() {
  return [...wallets.values()].sort((a, b) => a.name.localeCompare(b.name));
}
function notify() { const value = current(); listeners.forEach(listener => listener(value)); }
function announce(event: Event) {
  try {
    const detail = (event as CustomEvent).detail;
    if (typeof detail?.provider?.request !== "function" || typeof detail.info?.uuid !== "string" ||
      !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(detail.info.uuid) ||
      typeof detail.info.name !== "string" || !detail.info.name.trim() || detail.info.name.length > 128) return;
    const id = `eip6963:${detail.info.uuid}`;
    if (wallets.has(id) && wallets.get(id)!.provider !== detail.provider) return;
    for (const [key, wallet] of wallets) if (wallet.provider === detail.provider && key !== id) wallets.delete(key);
    wallets.set(id, { id, name: detail.info.name.trim(), provider: detail.provider });
    notify();
  } catch { /* Ignore malformed announcements without disrupting other wallets. */ }
}

export async function discoverInjectedWallets() {
  if (!started) {
    started = true;
    // Keep listening for late injection and re-announcements for this page.
    window.addEventListener("eip6963:announceProvider", announce);
  }
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise(resolve => setTimeout(resolve, 250));
  const ethereum = (window as unknown as { ethereum?: InjectedProvider }).ethereum;
  const legacy = ethereum?.providers?.length ? ethereum.providers : ethereum ? [ethereum] : [];
  for (const provider of legacy) {
    if (typeof provider?.request !== "function" || [...wallets.values()].some(wallet => wallet.provider === provider)) continue;
    const id = `injected:${wallets.size}`;
    wallets.set(id, { id, name: name(provider), provider });
  }
  notify();
  return current();
}
export function subscribeInjectedWallets(listener: (wallets: InjectedWallet[]) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function injectedWalletName(provider: Provider) {
  return [...wallets.values()].find(wallet => wallet.provider === provider)?.name || "";
}
