import { EthereumProvider } from "@walletconnect/ethereum-provider";
import { network } from "./network";

type WalletConnect = Awaited<ReturnType<typeof EthereumProvider.init>>;
let provider: WalletConnect | undefined;
let generation = 0;
const contexts = new WeakMap<WalletConnect, { key: string; prefix: string; cancelled: boolean }>();
const compatible = (value?: WalletConnect) => value?.session?.namespaces.eip155?.accounts.some(account => account.startsWith(`eip155:${network.chainId}:`));

export function cancelWalletConnectProvider(value: WalletConnect) {
  const context = contexts.get(value);
  if (context) context.cancelled = true;
  if (provider === value) provider = undefined;
  if (!value.session) value.signer.client.core.relayer.transportClose().catch(() => {});
}
export function rememberWalletConnectProvider(value: WalletConnect) {
  const context = contexts.get(value);
  if (!context || context.cancelled || !compatible(value)) return;
  provider = value;
  try { localStorage.setItem(context.key, context.prefix); } catch { /* Private browsing can disable storage. */ }
}
export async function walletConnectProvider(projectId: string) {
  if (!/^[\da-f]{32}$/i.test(projectId)) throw new Error("walletConnectUnconfigured");
  const key = `ink-walletconnect:${network.chainId}:${projectId}`;
  if (compatible(provider) && contexts.get(provider!)?.key === key && !contexts.get(provider!)?.cancelled) return provider!;
  const request = ++generation;
  let stored = "";
  try { stored = localStorage.getItem(key) || ""; } catch { /* Session remains usable without persistence. */ }
  const saved = /^ink-explorer:[\da-f-]{36}$/.test(stored) ? stored : "";
  let prefix = saved || `ink-explorer:${crypto.randomUUID()}`;
  const initialize = (storagePrefix: string) => EthereumProvider.init({
    projectId, optionalChains: [network.chainId], methods: [], events: [],
    optionalMethods: ["eth_sendTransaction", "wallet_switchEthereumChain", "wallet_addEthereumChain"],
    optionalEvents: ["accountsChanged", "chainChanged"],
    rpcMap: { [network.chainId]: network.rpc }, showQrModal: false,
    metadata: { name: "Ink Explorer", description: "Ink chain explorer", url: location.origin, icons: [new URL("/brand/ink-symbol.png", location.origin).href] },
    // No SDK analytics and no signing, message signing or batch permissions.
    telemetryEnabled: false,
    customStoragePrefix: storagePrefix,
  });
  let value = await initialize(prefix);
  if (saved && !compatible(value)) {
    if (!value.session) value.signer.client.core.relayer.transportClose().catch(() => {});
    try { localStorage.removeItem(key); } catch { /* No persistent session. */ }
    prefix = `ink-explorer:${crypto.randomUUID()}`;
    value = await initialize(prefix);
  }
  contexts.set(value, { key, prefix, cancelled: false });
  if (request === generation) provider = value;
  return value;
}
