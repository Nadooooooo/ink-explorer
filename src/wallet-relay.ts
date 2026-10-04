type Events = {
  on(event: string, listener: (...args: any[]) => void): void;
  removeListener(event: string, listener: (...args: any[]) => void): void;
};
type Relay = Events & { provider?: Events; transportClose(): Promise<void> };

// Bound relay preparation separately from the time allowed to scan the QR.
// Observe the SDK's own connection: never intercept other wallets or sockets.
export async function guardWalletRelay<T>(relay: Relay, operation: () => Promise<T>, signal?: AbortSignal, pairing?: Events) {
  let stopped = false;
  let failed!: (error: Error) => void;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const failure = new Promise<never>((_, reject) => { failed = reject; });
  const stop = (error: Error) => {
    if (stopped) return;
    stopped = true;
    failed(error);
    relay.transportClose().catch(() => {});
  };
  const cancel = () => stop(new Error("walletConnectExpired"));
  const relayError = (error: { code?: number; message?: string }) => stop(new Error(
    error.code === 3000 || /origin not allowed/i.test(error.message || "") ? "walletConnectOriginDenied" : "walletConnectUnavailable"
  ));
  const payload = (value: { error?: { code?: number; message?: string } }) => {
    if (value.error && [3000, 401, 403].includes(value.error.code || 0)) relayError(value.error);
  };
  const providers = new Set<Events>();
  const watch = () => {
    const provider = relay.provider;
    if (!provider?.on || providers.has(provider)) return;
    providers.add(provider);
    provider.on("payload", payload);
  };
  const prepared = () => { if (timeout) clearTimeout(timeout); };
  relay.on("relayer_error", relayError);
  relay.on("relayer_connect", watch);
  signal?.addEventListener("abort", cancel, { once: true });
  pairing?.on("display_uri", prepared);
  watch();
  timeout = setTimeout(() => stop(new Error("walletConnectUnavailable")), 30000);
  const pending = Promise.resolve().then(() => {
    if (stopped) throw new Error("walletConnectExpired");
    return operation();
  });
  pending.then(() => { if (stopped) relay.transportClose().catch(() => {}); }, () => {});
  if (signal?.aborted) cancel();
  try { return await Promise.race([pending, failure]); }
  catch (error) { stop(error instanceof Error ? error : new Error("walletConnectUnavailable")); throw error; }
  finally {
    prepared();
    relay.removeListener("relayer_error", relayError);
    relay.removeListener("relayer_connect", watch);
    for (const provider of providers) provider.removeListener("payload", payload);
    signal?.removeEventListener("abort", cancel);
    pairing?.removeListener("display_uri", prepared);
  }
}
