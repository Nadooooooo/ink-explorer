import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { message, formatMessage, type Locale } from "./i18n";
import { API, network } from "./network";
import { requestJson } from "./api-request";
import { type Provider, type useWallet } from "./wallet";
import { expireWalletPairing, pairingTopic } from "./wallet-pairing";

type Connection = ReturnType<typeof useWallet>;
export default function WalletConnection({ connection, locale }: { connection: Connection; locale: Locale }) {
  const t = (key: string) => message(locale, key);
  const [busy, setBusy] = useState(false);
  const [uri, setUri] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelPairing = useRef<() => void>(() => {});
  const attempt = useRef(0);
  useEffect(() => () => { attempt.current++; cancelPairing.current(); }, []);
  useEffect(() => {
    if (uri) dialog.current?.showModal();
    else dialog.current?.close();
  }, [uri]);
  const cancel = () => { attempt.current++; cancelPairing.current(); setUri(""); setBusy(false); };
  const connect = async (kind: "browser" | "walletconnect") => {
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
        provider = (window as unknown as { ethereum?: Provider }).ethereum;
        if (!provider) throw new Error("walletRequired");
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
      {connection.wallet ? <><bdi>{connection.wallet.account}</bdi><button type="button" onClick={() => connection.disconnect().catch(() => connection.setError("requestFailed"))}>{t("disconnect")}</button></>
        : <><button type="button" className="primary-action" disabled={busy} onClick={() => connect("browser")}>{busy ? t("connecting") : formatMessage(locale, "connectWallet", { network: network.name })}</button>
        <button type="button" disabled={busy} onClick={() => connect("walletconnect")}>{t("walletConnectQr")}</button>
        {busy && <button type="button" onClick={cancel}>{t("cancel")}</button>}</>}
    </div>
    {connection.error && <p role="alert" className="contract-error">{t(connection.error)}</p>}
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
