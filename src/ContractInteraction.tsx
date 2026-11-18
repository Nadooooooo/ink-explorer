import { useEffect, useMemo, useRef, useState } from "react";
import {
  Fragment,
  FunctionFragment,
  Interface,
  parseEther,
  toQuantity,
} from "ethers";
import { API, network, networkPath } from "./network";
import { requestJson } from "./api-request";
import { exactJson, parseArgument } from "./contract-abi";
import { formatMessage, message, type Locale } from "./i18n";
import { Info } from "./Info";
import { CopyableValue } from "./CopyableValue";
import { ChevronRight } from "lucide-react";

import WalletConnection from "./WalletConnection";
import { useWallet, type Wallet } from "./wallet";

type RpcResult = { result: any; source: string };

function revealMobileFormField(target: HTMLElement) {
  if (!window.matchMedia("(max-width: 760px), (pointer: coarse)").matches) return;
  const reveal = () => {
    if (document.activeElement !== target || !target.isConnected) return;
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop ?? 0;
    const bottom = top + (viewport?.height ?? window.innerHeight);
    const headerBottom = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
    const visibleTop = Math.max(top + 16, headerBottom + 16);
    const visibleBottom = bottom - 20;
    const field = target.getBoundingClientRect();
    if (field.bottom > visibleBottom)
      window.scrollBy({ top: field.bottom - visibleBottom, behavior: "auto" });
    else if (field.top < visibleTop)
      window.scrollBy({ top: field.top - visibleTop, behavior: "auto" });
  };
  requestAnimationFrame(reveal);
  // The software keyboard can resize the visual viewport after focus fires.
  window.setTimeout(reveal, 350);
}

async function rpc(method: string, params: unknown[]): Promise<RpcResult> {
  const response = await fetch(`${API}/contract-rpc`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ method, params }),
    signal: AbortSignal.timeout(25000),
  });
  const value = await response.json();
  if (!response.ok || value.error) {
    const error = new Error(
      typeof value.error === "string"
        ? value.error
        : value.error?.message || "Contract query failed",
    );
    Object.assign(error, { data: value.error?.data });
    throw error;
  }
  if (value.chainId !== network.chainId)
    throw new Error("Response belongs to another network");
  return value;
}
function errorText(error: any, abi?: Interface, locale: Locale = "en") {
  if (error.message === "Contract query failed" || error.message === "Response belongs to another network")
    return message(locale, error.message);
  if (error.code === 4001 || error.code === "ACTION_REJECTED")
    return message(locale, "walletRejected");
  if (typeof error.data === "string" && abi) {
    try {
      const decoded = abi.parseError(error.data);
      if (decoded) return `${decoded.name}: ${exactJson(decoded.args)}`;
    } catch {
      /* use RPC message */
    }
  }
  return (
    error.shortMessage ||
    error.message ||
    message(locale, "requestFailed")
  );
}

function Method({
  fragment,
  abi,
  address,
  wallet,
  mode,
  hidden,
  locale,
}: {
  fragment: FunctionFragment;
  abi: Interface;
  address: string;
  wallet?: Wallet;
  mode: "read" | "write";
  hidden: boolean;
  locale: Locale;
}) {
  const ct = (key: string) => message(locale, key);
  const cf = (key: string, values: Record<string, string | number>) => formatMessage(locale, key, values);
  const [inputs, setInputs] = useState<string[]>(fragment.inputs.map(() => ""));
  const [value, setValue] = useState("0");
  const [sender, setSender] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [awaitingWallet, setAwaitingWallet] = useState(false);
  const signing = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [prepared, setPrepared] = useState<Record<string, string>>();
  const [txHash, setTxHash] = useState("");
  const [receiptStatus, setReceiptStatus] = useState("");
  const generation = useRef(0);
  const signature = fragment.format("sighash");
  useEffect(() => {
    generation.current++;
    setPrepared(undefined);
    setError("");
    setBusy(false);
    return () => {
      generation.current++;
    };
  }, [wallet?.account, wallet?.chain]);
  useEffect(() => {
    const invalidateCachedPreparation = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      // A cached document retains React state and pending RPC callbacks. A
      // pre-navigation simulation must never authorize a restored submission.
      generation.current++;
      setPrepared(undefined);
      setResult("");
      setSource("");
      setError("");
      setBusy(signing.current);
    };
    window.addEventListener("pagehide", invalidateCachedPreparation);
    window.addEventListener("pageshow", invalidateCachedPreparation);
    return () => {
      window.removeEventListener("pagehide", invalidateCachedPreparation);
      window.removeEventListener("pageshow", invalidateCachedPreparation);
    };
  }, []);
  const invalidate = () => {
    generation.current++;
    setPrepared(undefined);
    setResult("");
    setError("");
    setBusy(false);
  };
  useEffect(() => {
    if (!txHash) return;
    let active = true;
    let timer: ReturnType<typeof setInterval>;
    const check = async () => {
      try {
        const response = await rpc("eth_getTransactionReceipt", [txHash]);
        if (response.result) clearInterval(timer);
        if (active)
          setReceiptStatus(
            response.result
              ? Number(response.result.status) === 1
                ? ct("txConfirmed")
                : ct("txReverted")
              : ct("txAwaiting"),
          );
      } catch {
        if (active)
          setReceiptStatus(
            ct("confirmationUnavailable"),
          );
      }
    };
    timer = setInterval(check, 10000);
    check();
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [txHash]);

  const run = async () => {
    if (signing.current) return;
    const request = ++generation.current;
    setBusy(true);
    setError("");
    setPrepared(undefined);
    setResult("");
    try {
      const args = fragment.inputs.map((input, index) => {
        try {
          return parseArgument(input, inputs[index]);
        } catch (error: any) {
          throw new Error(
            `${input.name || cf("argumentNumber", { number: index + 1 })}: ${error.message}`,
          );
        }
      });
      const tx: Record<string, string> = {
        to: address,
        data: abi.encodeFunctionData(fragment, args),
      };
      if (mode === "write") {
        if (!wallet || wallet.chain !== network.chainId)
          throw new Error(cf("connectWalletOn", { network: network.name }));
        tx.from = wallet.account;
        if (fragment.payable) {
          if (!/^\d+(?:\.\d{1,18})?$/.test(value))
            throw new Error(
              ct("invalidEthValue"),
            );
          tx.value = toQuantity(parseEther(value));
        }
      } else if (sender) {
        if (!/^0x[\da-f]{40}$/i.test(sender))
          throw new Error(ct("invalidCaller"));
        tx.from = sender;
      }
      const response = await rpc("eth_call", [tx, "latest"]);
      if (request !== generation.current) return;
      setSource(response.source);
      if (mode === "read") {
        const decoded = abi.decodeFunctionResult(fragment, response.result);
        setResult(
          fragment.outputs.length
            ? fragment.outputs
                .map(
                  (output, index) =>
                    `${output.name || cf("outputNumber", { number: index + 1 })} (${output.type}): ${exactJson(decoded[index])}`,
                )
                .join("\n")
            : ct("callNoReturn"),
        );
      } else {
        const estimate = await rpc("eth_estimateGas", [tx]);
        if (request !== generation.current) return;
        setPrepared({
          ...tx,
          gas: toQuantity((BigInt(estimate.result) * 120n) / 100n),
          chainId: toQuantity(network.chainId),
        });
        setResult(
          cf("simulationSucceeded", { gas: BigInt(estimate.result).toString() }),
        );
      }
    } catch (error) {
      if (request === generation.current) setError(errorText(error, abi, locale));
    } finally {
      if (request === generation.current) setBusy(false);
    }
  };
  const send = async () => {
    if (!wallet || !prepared || signing.current) return;
    signing.current = true;
    setAwaitingWallet(true);
    const request = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const [chain, accounts] = await Promise.all([
        wallet.provider.request({ method: "eth_chainId" }),
        wallet.provider.request({ method: "eth_accounts" }),
      ]);
      if (request !== generation.current) return;
      if (
        Number(chain) !== network.chainId ||
        accounts[0]?.toLowerCase() !== prepared.from.toLowerCase()
      )
        throw new Error(ct("walletChangedSimulate"));
      const hash = await wallet.provider.request({
        method: "eth_sendTransaction",
        params: [prepared],
      });
      // After broadcast a wallet/account event cannot undo the transaction.
      // Keep its hash visible even when the prepared form was invalidated.
      if (!mounted.current) return;
      if (!/^0x[\da-f]{64}$/i.test(hash))
        throw new Error(ct("invalidTxHash"));
      setTxHash(hash);
      setPrepared(undefined);
      setReceiptStatus(ct("txAwaiting"));
    } catch (error) {
      if (mounted.current) setError(errorText(error, abi, locale));
    } finally {
      signing.current = false;
      if (mounted.current) {
        setAwaitingWallet(false);
        setBusy(false);
      }
    }
  };
  return (
    <details className="contract-method" hidden={hidden}>
      <summary>
        <ChevronRight className="contract-method-chevron" size={18} aria-hidden="true"/>
        <span dir="ltr">{signature}</span>
        <small>{fragment.stateMutability}</small>
      </summary>
      <form
        onFocusCapture={(event) => {
          if (event.target instanceof HTMLInputElement)
            revealMobileFormField(event.target);
        }}
        onSubmit={(event) => {
          event.preventDefault();
          run();
        }}
      >
        {fragment.inputs.map((input, index) => (
          <label key={index}>
            {input.name || cf("argumentNumber", { number: index + 1 })}{" "}
            <code dir="ltr">{input.format("full")}</code>
            <input
              dir={input.baseType === "string" ? "auto" : "ltr"}
              value={inputs[index]}
              disabled={awaitingWallet}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                invalidate();
                setInputs((old) =>
                  old.map((entry, i) =>
                    i === index ? event.target.value : entry,
                  ),
                );
              }}
              placeholder={
                input.baseType === "tuple" || input.baseType === "array"
                  ? '["value", "value"]'
                  : input.type
              }
            />
          </label>
        ))}
        {mode === "read" && (
          <label>
            {ct("callerOptional")}
            <input
              dir="ltr"
              value={sender}
              placeholder="0x…"
              onChange={(event) => {
                invalidate();
                setSender(event.target.value);
              }}
            />
          </label>
        )}
        {mode === "write" && fragment.payable && (
          <label>
            {ct("ethToSend")}
            <input
              dir="ltr"
              value={value}
              disabled={awaitingWallet}
              inputMode="decimal"
              onChange={(event) => {
                invalidate();
                setValue(event.target.value);
              }}
            />
          </label>
        )}
        <button
          className="primary-action"
          disabled={
            busy ||
            awaitingWallet ||
            (mode === "write" && (!wallet || wallet.chain !== network.chainId))
          }
        >
          {busy
            ? ct("working")
            : mode === "read"
              ? ct("query")
              : ct("simulateTransaction")}
        </button>
      </form>
      {awaitingWallet && <p role="status">{ct("waitingWallet")}</p>}
      {error && (
        <p role="alert" className="contract-error">
          {error}
        </p>
      )}
      {result && (
        <pre className="contract-result" role="status">
          {result}
        </pre>
      )}
      {source && (
        <small>
          {ct("readFrom")}{" "}
          {source === "local"
            ? ct("localNode")
            : ct("publicRpcFallback")}{" "}
          · {network.name}
        </small>
      )}
      {prepared && (
        <div className="transaction-review">
          <h3>{ct("reviewTransaction")}</h3>
          <p>
            {network.name} · {ct("chain")} {network.chainId}
          </p>
          <p>{ct("to")}: {prepared.to}</p>
          <p>{ct("from")}: {prepared.from}</p>
          <p>{ct("value")}: {fragment.payable ? value : "0"} ETH · {ct("plusNetworkFee")}</p>
          <details>
            <summary>{ct("encodedCallData")}</summary>
            <pre>{prepared.data}</pre>
          </details>
          <button
            className="primary-action"
            type="button"
            disabled={busy || awaitingWallet}
            onClick={send}
          >
            {ct("confirmInWallet")}
          </button>
        </div>
      )}
      {txHash && (
        <div role="status">
          <p>{receiptStatus}</p>
          <a href={networkPath(`/tx/${txHash}`)}>{txHash}</a>
        </div>
      )}
    </details>
  );
}

export default function ContractInteraction({
  address,
  contract,
  mode,
  locale,
}: {
  address: string;
  contract: Record<string, any>;
  mode: "read" | "write";
  locale: Locale;
}) {
  const ct = (key: string) => message(locale, key);
  const cf = (key: string, values: Record<string, string | number>) => formatMessage(locale, key, values);
  const connection = useWallet();
  const { wallet } = connection;
  const [abiSource, setAbiSource] = useState("direct");
  const [custom, setCustom] = useState("");
  const [customAbi, setCustomAbi] = useState<any[]>();
  const [abiRevision, setAbiRevision] = useState(0);
  const [implementation, setImplementation] = useState<Record<string, any>>();
  const [abiError, setAbiError] = useState("");
  const [filter, setFilter] = useState("");
  const implementations = contract.implementations || [];
  useEffect(() => {
    if (abiSource === "direct" || abiSource === "custom") return;
    const controller = new AbortController();
    setImplementation(undefined);
    setAbiError("");
    requestJson(`${API}/explorer/smart-contracts/${abiSource}`, {
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) setImplementation(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setAbiError(ct(error.message));
      });
    return () => controller.abort();
  }, [abiSource]);
  const abi = useMemo(() => {
    const entries =
      abiSource === "custom"
        ? customAbi
        : abiSource === "direct"
          ? contract.abi
          : implementation?.abi;
    if (!Array.isArray(entries) || !entries.length) return undefined;
    try {
      return new Interface(entries);
    } catch {
      return undefined;
    }
  }, [abiSource, customAbi, contract.abi, implementation]);
  const functions: FunctionFragment[] = [];
  abi?.forEachFunction((fragment) => {
    if (mode === "read" ? fragment.constant : !fragment.constant)
      functions.push(fragment);
  });
  const matchesFilter = (fragment: FunctionFragment) =>
    fragment.format("sighash").toLowerCase().includes(filter.toLowerCase());
  return (
    <section className="contract-interaction">
      <div className="contract-interaction-heading">
        <h2>{ct(mode === "read" ? "readContract" : "writeContract")}</h2>
        <Info label={ct(mode === "read" ? "readContract" : "writeContract")}>
          <strong>{network.name} · {ct("chain")} {network.chainId}</strong><br/>
          {ct(mode === "read" ? "readIntro" : "writeIntro")}<br/>{ct("integerHelp")}
        </Info>
      </div>
      {mode === "write" && <p>{ct("writeIntro")}</p>}
      <p className="contract-target"><span>{ct("target")}</span><CopyableValue value={address} display={address} t={ct}/></p>
      {mode === "write" && <WalletConnection connection={connection} locale={locale} />}
      <div className="contract-controls">
      <label>
        {ct("contractInterface")}
        <select
          value={abiSource}
          onChange={(event) => setAbiSource(event.target.value)}
        >
          <option value="direct">{ct("contractAbi")}</option>
          {implementations.map((item: any) => (
            <option key={item.address_hash} value={item.address_hash}>
              {ct("asProxy")} · {item.name || item.address_hash}
            </option>
          ))}
          <option value="custom">{ct("customAbi")}</option>
        </select>
      </label>
      {abi && <label>
        {ct("filterFunctions")}
        <input type="search" dir="ltr" value={filter} onChange={(event) => setFilter(event.target.value)}/>
      </label>}
      </div>
      {abiSource !== "direct" && abiSource !== "custom" && (
        <p>
          {cf("usingImplementation", { implementation: abiSource, proxy: address })}
        </p>
      )}
      {abiSource === "custom" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            try {
              const value = JSON.parse(custom);
              if (!Array.isArray(value) || !value.length)
                throw new Error(ct("pasteAbiArray"));
              value.forEach((entry) => Fragment.from(entry));
              new Interface(value);
              setCustomAbi(value);
              setAbiRevision((revision) => revision + 1);
              setAbiError("");
            } catch (error: any) {
              setAbiError(error.message);
            }
          }}
        >
          <label>
            ABI JSON
            <textarea
              dir="ltr"
              value={custom}
              maxLength={200000}
              onChange={(event) => setCustom(event.target.value)}
              rows={6}
            />
          </label>
          <p>
            {ct("customAbiNotice")}
          </p>
          <button type="submit">{ct("useAbi")}</button>
        </form>
      )}
      {abiError && <p role="alert">{abiError}</p>}
      {!abi ? (
        <p role="status">
          {abiSource !== "direct" &&
          abiSource !== "custom" &&
          !implementation &&
          !abiError
            ? ct("loadingImplementationAbi")
            : ct("noAbiAvailable")}
        </p>
      ) : (
        <>
          {mode === "write" && <p>{ct("integerHelp")}</p>}
          {functions.map((fragment) => (
              <Method
                key={`${address}-${abiSource}-${abiRevision}-${fragment.format("sighash")}`}
                fragment={fragment}
                abi={abi}
                address={address}
                wallet={wallet}
                mode={mode}
                locale={locale}
                hidden={!matchesFilter(fragment)}
              />
            ))}
          {!functions.some(matchesFilter) && (
            <p role="status">{cf("noMatchingFunctions", { mode: ct(mode === "read" ? "readMode" : "writeMode") })}</p>
          )}
        </>
      )}
    </section>
  );
}
