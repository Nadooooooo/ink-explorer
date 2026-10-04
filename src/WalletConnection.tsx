import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { message, formatMessage, type Locale } from "./i18n";
import { API, network } from "./network";
import { requestJson } from "./api-request";
import { type Provider, type useWallet } from "./wallet";
import { expireWalletPairing, pairingTopic } from "./wallet-pairing";
import { discoverInjectedWallets, injectedWalletName, subscribeInjectedWallets, type InjectedWallet } from "./wallet-discovery";

type Connection = ReturnType<typeof useWallet>;
export default function WalletConnection({ connection, locale }: { connection: Connection; locale: Locale }) {
  const t = (key: string) => message(locale, key);
  const [busy, setBusy] = useState(false);
  const [uri, setUri] = useState("");
  const [choices, setChoices] = useState<InjectedWallet[]>();
  const [qrEnabled, setQrEnabled] = useState(/^[\da-f]{32}$/i.test(import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || ""));
  const dialog = useRef<HTMLDialogElement>(null);
  const walletDialog = useRef<HTMLDialogElement>(null);
  const cancelPairing = useRef<() => void>(() => {});
  const attempt = useRef(0);
  useEffect(() => () => { attempt.current++; cancelPairing.current(); }, []);
  useEffect(() => {
    if (/^[\da-f]{32}$/i.test(import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "")) return;
    const controller = new AbortController();
    requestJson<{ projectId: string; chainId: number }>(`${API}/wallet/config`, { signal: controller.signal }, 10000)
      .then(config => { if (!controller.signal.aborted) setQrEnabled(config.chainId === network.chainId && /^[\da-f]{32}$/i.test(config.projectId)); })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (uri) dialog.current?.showModal();
    else dialog.current?.close();
  }, [uri]);
  useEffect(() => {
    if (choices) walletDialog.current?.showModal();
    else walletDialog.current?.close();
  }, [choices]);
  const choosing = choices !== undefined;
  useEffect(() => choosing ? subscribeInjectedWallets(setChoices) : undefined, [choosing]);
  const cancel = () => { attempt.current++; cancelPairing.current(); setUri(""); setChoices(undefined); setBusy(false); };
  const connect = async (kind: "browser" | "walletconnect", chosen?: Provider) => {
    if (busy) return;
    const request = ++attempt.current;
    setBusy(true); connection.setError("");
    let cleanup = () => {};
    let provider: Provider | undefined;
    let remember = () => {};
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const initialization = new AbortController();
    let abandon = () => initialization.abort();
    cancelPairing.current = abandon;
    try {
      if (kind === "browser") {
        if (!chosen) {
          const wallets = await discoverInjectedWallets();
          if (request !== attempt.current) return;
          if (wallets.length !== 1) { setChoices(wallets); return; }
          chosen = wallets[0].provider;
        }
        provider = chosen;
      } else {
        let projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "";
        if (!projectId) {
          const config = await requestJson<{ projectId: string; chainId: number }>(`${API}/wallet/config`, {}, 10000);
          if (config.chainId !== network.chainId) throw new Error("invalidApiResponse");
          projectId = config.projectId;
        }
        if (request !== attempt.current) return;
        if (!/^[\da-f]{32}$/i.test(projectId)) throw new Error("walletConnectUnconfigured");
        const { walletConnectProvider, connectWalletConnectProvider, cancelWalletConnectProvider, rememberWalletConnectProvider } = await import("./WalletConnectProvider");
        const wc = await walletConnectProvider(projectId, initialization.signal);
        if (request !== attempt.current) { cancelWalletConnectProvider(wc); return; }
        provider = wc;
        let topic = "";
        const expire = () => {
          initialization.abort();
          if (topic) expireWalletPairing(wc.signer.client, topic);
          cancelWalletConnectProvider(wc);
        };
        const display = (value: string) => {
          topic = pairingTopic(value) || "";
          if (request !== attempt.current) { expire(); return; }
          if (topic) setUri(value);
        };
        wc.on("display_uri", display);
        cleanup = () => wc.removeListener("display_uri", display);
        abandon = expire; cancelPairing.current = expire;
        remember = () => rememberWalletConnectProvider(wc);
        timeout = setTimeout(() => {
          if (request !== attempt.current) return;
          cancel(); connection.setError("walletConnectExpired");
        }, 180000);
        if (!wc.session) await connectWalletConnectProvider(wc, initialization.signal);
        if (request !== attempt.current) { if (wc.session) await wc.disconnect(); cancelWalletConnectProvider(wc); return; }
      }
      if (request === attempt.current) await connection.connect(provider!, kind, () => request === attempt.current);
      if (request === attempt.current) remember();
    } catch (error: any) {
      if (kind === "walletconnect") abandon();
      if (request === attempt.current) connection.setError(error.code === 4001 || error.code === "ACTION_REJECTED" ? "walletRejected" : error.message || "requestFailed");
    } finally {
      cleanup(); if (timeout) clearTimeout(timeout);
      if (request === attempt.current) { cancelPairing.current = () => {}; setUri(""); setBusy(false); }
    }
  };
  return <div className="wallet-connection">
    <div className="contract-wallet">
      {connection.wallet ? <><span>{connection.wallet.kind === "walletconnect" ? "WalletConnect" : injectedWalletName(connection.wallet.provider) || t("browserWallet")}</span><bdi>{connection.wallet.account}</bdi><button type="button" onClick={() => connection.disconnect().catch(() => connection.setError("requestFailed"))}>{t("disconnect")}</button></>
        : <><button type="button" className="primary-action" disabled={busy} onClick={() => connect("browser")}>{busy ? t("connecting") : formatMessage(locale, "connectWallet", { network: network.name })}</button>
        {qrEnabled && <button type="button" disabled={busy} onClick={() => connect("walletconnect")}>{t("walletConnectQr")}</button>}
        {busy && <button type="button" onClick={cancel}>{t("cancel")}</button>}</>}
    </div>
    {connection.error && <p role="alert" className="contract-error">{t(connection.error)}</p>}
    <dialog className="wallet-picker-dialog" ref={walletDialog} onCancel={event => { event.preventDefault(); cancel(); }} aria-labelledby="wallet-picker-title">
      <h2 id="wallet-picker-title">{t("chooseWallet")}</h2>
      <p>{network.name}</p>
      {choices?.length ? <div className="wallet-picker-options">{choices.map(wallet => <button type="button" key={wallet.id} onClick={() => { setChoices(undefined); connect("browser", wallet.provider); }}>{wallet.name || t("browserWallet")}</button>)}</div>
        : <><p>{t("noInstalledWallet")}</p><p>{t("walletBrowserHelp")}</p><button type="button" onClick={() => { setChoices(undefined); connect("browser"); }}>{t("retry")}</button></>}
      <button type="button" onClick={cancel}>{t("cancel")}</button>
    </dialog>
    <dialog className="wallet-qr-dialog" ref={dialog} onCancel={event => { event.preventDefault(); cancel(); }} aria-labelledby="wallet-qr-title">
      <h2 id="wallet-qr-title">{t("walletConnectQr")}</h2>
      <p>{t("walletScanQr")}</p>
      {uri && <QRCodeSVG value={uri} size={240} level="M" marginSize={4} title={t("walletConnectQr")} />}
      <p>{network.name}</p>
      <a href={uri || undefined}>{t("walletOpenMobile")}</a>
      <button type="button" onClick={cancel}>{t("cancel")}</button>
    </dialog>
  </div>;
}
