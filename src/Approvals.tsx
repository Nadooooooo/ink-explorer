import { useEffect, useRef, useState } from "react";
import { toQuantity } from "ethers";
import { API, network, networkPath } from "./network";
import { requestJson } from "./api-request";
import { message, formatMessage, type Locale } from "./i18n";
import { useWallet, type Wallet } from "./wallet";
import WalletConnection from "./WalletConnection";
import { approvalAmount, revokeData, type Approval } from "./approval-data";
import "./approvals.css";

async function readState(owner: string, items: Approval[], signal?: AbortSignal) {
  const response = await fetch(`${API}/approvals/${owner}/state`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items }), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(55000)]) : AbortSignal.timeout(55000) });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(body.error || "approvalStateUnavailable");
  if (body.chainId !== network.chainId || body.owner?.toLowerCase() !== owner.toLowerCase() || !Array.isArray(body.items) || body.items.length !== items.length) throw new Error("invalidApiResponse");
  // Reject a malformed state response before exposing any wallet action.
  for (let i = 0; i < items.length; i++) {
    const item = body.items[i], requested = items[i];
    if (item.key !== requested.key || item.token !== requested.token || item.spender !== requested.spender || item.kind !== requested.kind || item.tokenId !== requested.tokenId || ![true, false, null].includes(item.active) || !["erc20", "erc721", "erc1155", "unknown"].includes(item.standard) || (item.kind === "erc20" && item.active !== null && (!/^(?:0|[1-9]\d{0,77})$/.test(item.amount) || BigInt(item.amount) >= 2n ** 256n || (item.decimals !== undefined && (!Number.isInteger(item.decimals) || item.decimals < 0 || item.decimals > 255))))) throw new Error("invalidApiResponse");
  }
  return body;
}
async function rpc(method: string, params: unknown[]) {
  const response = await fetch(`${API}/contract-rpc`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ method, params }), signal: AbortSignal.timeout(25000) });
  const data = await response.json();
  if (!response.ok || data.error || data.chainId !== network.chainId) throw new Error(data.error?.message || data.error || "Contract query failed");
  return data.result;
}

function Revoke({ owner, item, wallet, locale, receiptStatus, broadcast }: { owner: string; item: Approval; wallet?: Wallet; locale: Locale; receiptStatus: (hash: string) => string; broadcast: (hash: string, owner: string, item: Approval) => void }) {
  const t = (key: string) => message(locale, key);
  const [prepared, setPrepared] = useState<Record<string, string>>();
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [hash, setHash] = useState("");
  const generation = useRef(0), signing = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
  useEffect(() => { generation.current++; setPrepared(undefined); setBusy(signing.current); }, [wallet?.account, wallet?.chain, item.active, item.amount, item.spender]);
  const eligible = wallet?.account.toLowerCase() === owner.toLowerCase() && wallet.chain === network.chainId && item.active === true && item.standard !== "unknown";
  const simulate = async () => {
    if (!eligible || signing.current) return;
    const request = ++generation.current;
    setBusy(true); setError(""); setPrepared(undefined);
    try {
      const current = (await readState(owner, [item])).items[0];
      if (request !== generation.current) return;
      const tx = { from: owner, to: item.token, data: revokeData(current), value: "0x0" };
      await rpc("eth_call", [tx, "latest"]);
      const gas = await rpc("eth_estimateGas", [tx]);
      if (request === generation.current) setPrepared({ ...tx, gas: toQuantity(BigInt(gas) * 120n / 100n), chainId: toQuantity(network.chainId) });
    } catch (e: any) { if (request === generation.current) setError(e.message || "requestFailed"); }
    finally { if (request === generation.current) setBusy(false); }
  };
  const send = async () => {
    if (!prepared || !eligible || !wallet || signing.current) return;
    signing.current = true; setBusy(true); setError("");
    const request = ++generation.current;
    try {
      const [chain, accounts] = await Promise.all([wallet.provider.request({ method: "eth_chainId" }), wallet.provider.request({ method: "eth_accounts" })]);
      if (request !== generation.current) return;
      if (Number(chain) !== network.chainId || accounts[0]?.toLowerCase() !== owner.toLowerCase()) throw new Error("walletChangedSimulate");
      const value = await wallet.provider.request({ method: "eth_sendTransaction", params: [prepared] });
      if (!mounted.current) return;
      if (!/^0x[\da-f]{64}$/i.test(value)) throw new Error("invalidTxHash");
      setHash(value); setPrepared(undefined); broadcast(value, owner, item);
    } catch (e: any) { if (mounted.current) setError(e.code === 4001 || e.code === "ACTION_REJECTED" ? "walletRejected" : e.message || "requestFailed"); }
    finally { signing.current = false; if (mounted.current) setBusy(false); }
  };
  return <div className="approval-action">
    {item.active === true && !prepared && <button type="button" disabled={!eligible || busy || Boolean(hash && receiptStatus(hash) !== "txReverted")} onClick={simulate}>{busy ? t("working") : t("approvalRevoke")}</button>}
    {prepared && <div className="transaction-review">
      <h3>{t("reviewTransaction")}</h3><p>{t("approvalRevokeReview")}</p>
      <p>{network.name} · {t("plusNetworkFee")} · {t("Gas")}: {BigInt(prepared.gas).toLocaleString(locale)}</p>
      <p>{t("target")}: <bdi>{item.token}</bdi></p><p>{t("approvalSpender")}: <bdi>{item.spender}</bdi></p>
      <details><summary>{t("encodedCallData")}</summary><pre>{prepared.data}</pre></details>
      <button type="button" disabled={busy || !eligible} onClick={send}>{busy ? t("waitingWallet") : t("confirmInWallet")}</button>
      <button type="button" disabled={busy} onClick={() => setPrepared(undefined)}>{t("cancel")}</button>
    </div>}
    {error && <p role="alert" className="contract-error">{t(error)}</p>}
  </div>;
}

export default function Approvals({ address = "", locale, embedded = false }: { address?: string; locale: Locale; embedded?: boolean }) {
  const t = (key: string) => message(locale, key);
  const connection = useWallet();
  const [input, setInput] = useState(address), [owner, setOwner] = useState(address), [revision, setRevision] = useState(0);
  const [items, setItems] = useState<Approval[]>([]), [error, setError] = useState(""), [progress, setProgress] = useState(""), [complete, setComplete] = useState(false), [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("active");
  const controller = useRef<AbortController>(undefined);
  type Submission = { hash: string; owner: string; item: Approval; status: string; verified?: boolean; note?: string };
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const currentOwner = useRef(owner); currentOwner.current = owner;
  const loadingScan = useRef(busy); loadingScan.current = busy;
  const latestSubmissions = useRef(submissions); latestSubmissions.current = submissions;
  const pending = submissions.map(tx => tx.hash).join(",");
  useEffect(() => {
    if (!pending) return;
    let stopped = false; let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      for (const tx of latestSubmissions.current.filter(value => value.status !== "txReverted" && (value.status !== "txConfirmed" || !value.verified))) {
        try {
          const receipt = await rpc("eth_getTransactionReceipt", [tx.hash]);
          if (stopped) return;
          if (!receipt) continue;
          const status = Number(receipt.status) === 1 ? "txConfirmed" : "txReverted";
          setSubmissions(old => old.map(value => value.hash === tx.hash ? { ...value, status } : value));
          if (status === "txConfirmed") {
            try {
              const state = await readState(tx.owner, [tx.item]);
              if (!stopped) {
                if (currentOwner.current.toLowerCase() === tx.owner.toLowerCase()) {
                  if (loadingScan.current) {
                    // An in-flight refresh may have captured pre-revoke state.
                    // Cancel it and rescan instead of letting that late page
                    // overwrite the confirmed on-chain permission.
                    controller.current?.abort(); setRevision(value => value + 1);
                  } else setItems(old => old.map(item => item.key === tx.item.key ? state.items[0] : item));
                }
                setSubmissions(old => old.map(value => value.hash === tx.hash ? { ...value, verified: true, note: undefined } : value));
              }
            } catch { if (!stopped) {
              if (currentOwner.current.toLowerCase() === tx.owner.toLowerCase()) setItems(old => old.map(item => item.key === tx.item.key ? { ...item, active: null, error: "approvalStateUnavailable" } : item));
              setSubmissions(old => old.map(value => value.hash === tx.hash ? { ...value, note: "approvalStateUnavailable" } : value));
            } }
          }
        } catch { if (!stopped) setSubmissions(old => old.map(value => value.hash === tx.hash ? { ...value, status: "confirmationUnavailable" } : value)); }
      }
      if (!stopped && latestSubmissions.current.some(value => value.status !== "txReverted" && (value.status !== "txConfirmed" || !value.verified))) timer = setTimeout(check, 4000);
    };
    check(); return () => { stopped = true; clearTimeout(timer); };
  }, [pending]);
  useEffect(() => { setInput(address); setOwner(address); }, [address]);
  useEffect(() => {
    setItems([]); setError(""); setComplete(false); setProgress("");
    if (!owner) { setBusy(false); return; }
    if (!/^0x[\da-f]{40}$/i.test(owner)) { setError("invalidCaller"); return; }
    const abort = new AbortController(); controller.current = abort; setBusy(true);
    const load = async () => {
      try {
        const discovered = new Map<string, Approval>();
        let next: Record<string, number> | null = {};
        let pages = 0; let snapshot: number | undefined;
        while (next && !abort.signal.aborted) {
          if (++pages > 500) throw new Error("approvalHistoryIncomplete");
          const query = new URLSearchParams(Object.entries(next).map(([key, value]) => [key, String(value)]));
          const data = await requestJson<any>(`${API}/approvals/${owner}/events?${query}`, { signal: abort.signal }, 55000);
          if (data.chainId !== network.chainId || data.owner?.toLowerCase() !== owner.toLowerCase() || !Array.isArray(data.items) || !Number.isSafeInteger(data.from) || !Number.isSafeInteger(data.through) || !Number.isSafeInteger(data.snapshot) || data.from !== (next.from || 0) || data.through < data.from || data.through > data.snapshot || (snapshot !== undefined && data.snapshot !== snapshot) || data.complete !== (data.next === null) || (data.next !== null && (!data.next || data.next.from !== data.through + 1 || data.next.snapshot !== data.snapshot || data.next.to !== data.snapshot))) throw new Error("invalidApiResponse");
          snapshot = data.snapshot;
          for (const item of data.items) {
            if (!["erc20", "erc721", "operator"].includes(item.kind) || !/^0x[\da-f]{40}$/i.test(item.token) || !/^0x[\da-f]{40}$/i.test(item.spender) || !Number.isSafeInteger(item.block) || item.block < data.from || item.block > data.through || !Number.isSafeInteger(item.logIndex) || item.logIndex < 0 || (item.kind === "erc721" && (!/^(?:0|[1-9]\d{0,77})$/.test(item.tokenId) || BigInt(item.tokenId) >= 2n ** 256n)) || item.key !== `${item.kind}:${item.token}:${item.tokenId ?? item.spender}`) throw new Error("invalidApiResponse");
            const previous = discovered.get(item.key);
            if (!previous || item.block > previous.block || item.block === previous.block && item.logIndex > previous.logIndex) discovered.set(item.key, item);
          }
          setProgress(formatMessage(locale, "approvalScanned", { block: data.through.toLocaleString(locale), total: data.snapshot.toLocaleString(locale) }));
          next = data.next;
        }
        const entries = [...discovered.values()].sort((a, b) => b.block - a.block || b.logIndex - a.logIndex);
        for (let start = 0; start < entries.length && !abort.signal.aborted; start += 6) {
          const data = await readState(owner, entries.slice(start, start + 6), abort.signal);
          if (!abort.signal.aborted) setItems(old => [...old, ...data.items]);
        }
        if (!abort.signal.aborted) { setComplete(true); setProgress(""); }
      } catch (e: any) { if (!abort.signal.aborted) setError(e.message || "requestFailed"); }
      finally { if (!abort.signal.aborted) setBusy(false); }
    };
    load();
    return () => { abort.abort(); if (controller.current === abort) controller.current = undefined; };
  }, [owner, revision]);
  const visible = items.filter(item => filter === "all" || item.active !== false);
  return <section className={`approvals-page${embedded ? " approvals-embedded" : ""}`}>
    {embedded ? <h2>{t("approvalsTitle")}</h2> : <h1>{t("approvalsTitle")}</h1>}<p>{t("approvalsIntro")}</p>
    <form className="approval-owner" onSubmit={event => { event.preventDefault(); setOwner(input.trim()); setRevision(value => value + 1); }}>
      <label>{t("address")}<input autoComplete="off" spellCheck={false} value={input} onChange={event => setInput(event.target.value)} placeholder="0x…" required pattern="0x[0-9a-fA-F]{40}" /></label>
      <button type="submit">{t("query")}</button>
    </form>
    <WalletConnection connection={connection} locale={locale} />
    {connection.wallet && <button type="button" onClick={() => { setInput(connection.wallet!.account); setOwner(connection.wallet!.account); }}>{t("approvalUseWallet")}</button>}
    {owner && connection.wallet && connection.wallet.account.toLowerCase() !== owner.toLowerCase() && <p role="status">{t("approvalWrongOwner")}</p>}
    {owner && <p className="approval-note">{t("approvalScope")}</p>}
    <div className="approval-toolbar"><label>{t("approvalsTitle")}<select value={filter} onChange={event => setFilter(event.target.value)}><option value="active">{t("approvalActive")}</option><option value="all">{t("approvalAll")}</option></select></label>
      {owner && <button type="button" disabled={busy} onClick={() => setRevision(value => value + 1)}>{t("retry")}</button>}
      {busy && <button type="button" onClick={() => { controller.current?.abort(); setBusy(false); setError("approvalHistoryIncomplete"); }}>{t("cancel")}</button>}
    </div>
    {busy && <p role="status">{progress || t("fetching")}</p>}
    {error && <p role="alert" className="contract-error">{t(error)}</p>}
    {submissions.length > 0 && <div className="approval-submissions" aria-live="polite">{submissions.map(tx => <p key={tx.hash}>{t(tx.status)} · <a href={networkPath(`/tx/${tx.hash}`)}><bdi>{tx.hash.slice(0, 10)}…{tx.hash.slice(-8)}</bdi></a>{tx.note && <> · {t(tx.note)}</>}</p>)}</div>}
    {complete && !visible.length && <p role="status">{t(filter === "all" ? "noRecords" : "approvalNone")}</p>}
    <div className="approval-list">{visible.map(item => <article className="approval-card" key={item.key}>
      <div className="approval-card-heading"><strong>{item.symbol || (item.kind === "erc20" ? "ERC-20" : item.standard === "erc1155" ? "ERC-1155" : item.kind === "erc721" || item.standard === "erc721" ? "ERC-721" : "NFT")}{item.tokenId !== undefined && ` #${item.tokenId}`}</strong><span>{t(item.active === true ? "approvalActive" : item.active === false ? "approvalRevoked" : "approvalUnknown")}</span></div>
      <dl><dt>{t("target")}</dt><dd><a href={networkPath(`/token/${item.token}`)}><bdi>{item.token}</bdi></a></dd>
      <dt>{t("approvalSpender")}</dt><dd><a href={networkPath(`/address/${item.spender}`)}><bdi>{item.spender}</bdi></a></dd>
      <dt>{t(item.kind === "erc20" ? "approvalAmount" : "approvalAccess")}</dt><dd>{item.kind === "erc20" ? approvalAmount(item, t("approvalUnlimited"), t("approvalRaw")) : t(item.kind === "operator" ? "approvalCollection" : "approvalSingleNft")}</dd></dl>
      {item.error && <p role="status">{t(item.error)}</p>}
      <Revoke owner={owner} item={item} wallet={connection.wallet} locale={locale} receiptStatus={hash => submissions.find(tx => tx.hash === hash)?.status || "txAwaiting"} broadcast={(hash, account, approved) => setSubmissions(old => [...old, { hash, owner: account, item: approved, status: "txAwaiting" }])} />
    </article>)}</div>
  </section>;
}
