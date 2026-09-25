import { useEffect, useMemo, useRef, useState } from "react";
import {
  Fragment,
  FunctionFragment,
  Interface,
  parseEther,
  toQuantity,
} from "ethers";
import { API, network, networkPath } from "./network";
import { exactJson, parseArgument } from "./contract-abi";
import { formatMessage, message, type Locale } from "./i18n";

type Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<any>;
  on?: (name: string, listener: (...args: any[]) => void) => void;
  removeListener?: (name: string, listener: (...args: any[]) => void) => void;
};
type Wallet = { provider: Provider; account: string; chain: number };
type RpcResult = { result: any; source: string };
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
      if (mounted.current) setAwaitingWallet(false);
      if (request === generation.current) setBusy(false);
    }
  };
  return (
    <details className="contract-method" hidden={hidden}>
      <summary>
        <span>{signature}</span>
        <small>{fragment.stateMutability}</small>
      </summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          run();
        }}
      >
        {fragment.inputs.map((input, index) => (
          <label key={index}>
            {input.name || cf("argumentNumber", { number: index + 1 })}{" "}
            <code>{input.format("full")}</code>
            <input
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
          <a
            href={`${network.explorer}/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {ct("viewOnBlockscout")}
          </a>
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
  const [wallet, setWallet] = useState<Wallet>();
  const [walletError, setWalletError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [abiSource, setAbiSource] = useState("direct");
  const [custom, setCustom] = useState("");
  const [customAbi, setCustomAbi] = useState<any[]>();
  const [abiRevision, setAbiRevision] = useState(0);
  const [implementation, setImplementation] = useState<Record<string, any>>();
  const [abiError, setAbiError] = useState("");
  const [filter, setFilter] = useState("");
  const implementations = contract.implementations || [];
  useEffect(() => {
    if (!wallet) return;
    const changed = () => {
      setWallet(undefined);
      setWalletError(
        ct("walletChangedReconnect"),
      );
    };
    wallet.provider.on?.("accountsChanged", changed);
    wallet.provider.on?.("chainChanged", changed);
    wallet.provider.on?.("disconnect", changed);
    return () => {
      wallet.provider.removeListener?.("accountsChanged", changed);
      wallet.provider.removeListener?.("chainChanged", changed);
      wallet.provider.removeListener?.("disconnect", changed);
    };
  }, [wallet]);
  useEffect(() => {
    if (abiSource === "direct" || abiSource === "custom") return;
    const controller = new AbortController();
    setImplementation(undefined);
    setAbiError("");
    fetch(`${API}/explorer/smart-contracts/${abiSource}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(ct("implementationUnavailable"));
        return response.json();
      })
      .then((value) => {
        if (!controller.signal.aborted) setImplementation(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setAbiError(error.message);
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
  const connect = async () => {
    setConnecting(true);
    setWalletError("");
    try {
      const provider = (window as unknown as { ethereum?: Provider }).ethereum;
      if (!provider)
        throw new Error(
          ct("walletRequired"),
        );
      await provider.request({ method: "eth_requestAccounts" });
      let chain = Number(await provider.request({ method: "eth_chainId" }));
      if (chain !== network.chainId) {
        try {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: toQuantity(network.chainId) }],
          });
        } catch (error: any) {
          if (error.code !== 4902) throw error;
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: toQuantity(network.chainId),
                chainName: network.name,
                nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
                rpcUrls: [network.rpc],
                blockExplorerUrls: [network.explorer],
              },
            ],
          });
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: toQuantity(network.chainId) }],
          });
        }
      }
      chain = Number(await provider.request({ method: "eth_chainId" }));
      const accounts = await provider.request({ method: "eth_accounts" });
      if (chain !== network.chainId || !/^0x[\da-f]{40}$/i.test(accounts[0]))
        throw new Error(cf("selectAccountOn", { network: network.name }));
      setWallet({ provider, account: accounts[0], chain });
    } catch (error) {
      setWalletError(errorText(error, undefined, locale));
    } finally {
      setConnecting(false);
    }
  };
  return (
    <section className="contract-interaction">
      <h2>{ct(mode === "read" ? "readContract" : "writeContract")}</h2>
      <p>
        {network.name} · {ct("chain")} {network.chainId} ·{" "}
        {mode === "read"
          ? ct("readIntro")
          : ct("writeIntro")}
      </p>
      <p className="contract-target">{ct("target")}: {address}</p>
      {mode === "write" && (
        <div className="contract-wallet">
          {wallet ? (
            <>
              <span>{wallet.account}</span>
              <button type="button" onClick={() => setWallet(undefined)}>
                {ct("disconnect")}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="primary-action"
              disabled={connecting}
              onClick={connect}
            >
              {connecting ? ct("connecting") : cf("connectWallet", { network: network.name })}
            </button>
          )}
          {walletError && <p role="alert">{walletError}</p>}
        </div>
      )}
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
          <label>
            {ct("filterFunctions")}
            <input
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          </label>
          <p>
            {ct("integerHelp")}
          </p>
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
