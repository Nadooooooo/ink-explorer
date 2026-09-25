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
function errorText(error: any, abi?: Interface) {
  if (error.code === 4001 || error.code === "ACTION_REJECTED")
    return "Request rejected in wallet. Nothing was submitted.";
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
    "The request failed. Please try again."
  );
}

function Method({
  fragment,
  abi,
  address,
  wallet,
  mode,
  hidden,
}: {
  fragment: FunctionFragment;
  abi: Interface;
  address: string;
  wallet?: Wallet;
  mode: "read" | "write";
  hidden: boolean;
}) {
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
                ? "Confirmed successfully"
                : "Transaction reverted onchain"
              : "Submitted · awaiting confirmation",
          );
      } catch {
        if (active)
          setReceiptStatus(
            "Submitted · confirmation check unavailable; use the transaction link",
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
            `${input.name || `Argument ${index + 1}`}: ${error.message}`,
          );
        }
      });
      const tx: Record<string, string> = {
        to: address,
        data: abi.encodeFunctionData(fragment, args),
      };
      if (mode === "write") {
        if (!wallet || wallet.chain !== network.chainId)
          throw new Error(`Connect a wallet on ${network.name}`);
        tx.from = wallet.account;
        if (fragment.payable) {
          if (!/^\d+(?:\.\d{1,18})?$/.test(value))
            throw new Error(
              "ETH value must be a non-negative decimal with at most 18 places",
            );
          tx.value = toQuantity(parseEther(value));
        }
      } else if (sender) {
        if (!/^0x[\da-f]{40}$/i.test(sender))
          throw new Error("Invalid caller address");
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
                    `${output.name || `Output ${index + 1}`} (${output.type}): ${exactJson(decoded[index])}`,
                )
                .join("\n")
            : "Call succeeded with no return values.",
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
          `Simulation succeeded. Estimated gas: ${BigInt(estimate.result).toString()}. Review the transaction below, then confirm in your wallet.`,
        );
      }
    } catch (error) {
      if (request === generation.current) setError(errorText(error, abi));
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
        throw new Error("Wallet account or network changed. Simulate again.");
      const hash = await wallet.provider.request({
        method: "eth_sendTransaction",
        params: [prepared],
      });
      // After broadcast a wallet/account event cannot undo the transaction.
      // Keep its hash visible even when the prepared form was invalidated.
      if (!mounted.current) return;
      if (!/^0x[\da-f]{64}$/i.test(hash))
        throw new Error("Wallet returned an invalid transaction hash");
      setTxHash(hash);
      setPrepared(undefined);
      setReceiptStatus("Submitted · awaiting confirmation");
    } catch (error) {
      if (mounted.current) setError(errorText(error, abi));
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
            {input.name || `Argument ${index + 1}`}{" "}
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
            Caller address (optional)
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
            ETH to send
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
            ? "Working…"
            : mode === "read"
              ? "Query"
              : "Simulate transaction"}
        </button>
      </form>
      {awaitingWallet && <p role="status">Waiting for the wallet response…</p>}
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
          Read from{" "}
          {source === "local"
            ? "the local node"
            : "Ink public RPC (local node not ready)"}{" "}
          · {network.name}
        </small>
      )}
      {prepared && (
        <div className="transaction-review">
          <h3>Review transaction</h3>
          <p>
            {network.name} · Chain {network.chainId}
          </p>
          <p>To: {prepared.to}</p>
          <p>From: {prepared.from}</p>
          <p>Value: {fragment.payable ? value : "0"} ETH · plus network fee</p>
          <details>
            <summary>Encoded call data</summary>
            <pre>{prepared.data}</pre>
          </details>
          <button
            className="primary-action"
            type="button"
            disabled={busy || awaitingWallet}
            onClick={send}
          >
            Confirm in wallet
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
            View on Blockscout
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
}: {
  address: string;
  contract: Record<string, any>;
  mode: "read" | "write";
}) {
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
        "Wallet changed. Reconnect to refresh the account and network.",
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
        if (!response.ok) throw new Error("Implementation ABI unavailable");
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
          "Open this page in a wallet browser or install an Ethereum wallet extension to write contracts.",
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
        throw new Error(`Select an account on ${network.name} in your wallet`);
      setWallet({ provider, account: accounts[0], chain });
    } catch (error) {
      setWalletError(errorText(error));
    } finally {
      setConnecting(false);
    }
  };
  return (
    <section className="contract-interaction">
      <h2>{mode === "read" ? "Read contract" : "Write contract"}</h2>
      <p>
        {network.name} · Chain {network.chainId} ·{" "}
        {mode === "read"
          ? "Query current state without a wallet or transaction fee."
          : "Simulate first, then review and sign in your wallet. Transactions can change state and spend ETH."}
      </p>
      <p className="contract-target">Target: {address}</p>
      {mode === "write" && (
        <div className="contract-wallet">
          {wallet ? (
            <>
              <span>{wallet.account}</span>
              <button type="button" onClick={() => setWallet(undefined)}>
                Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              className="primary-action"
              disabled={connecting}
              onClick={connect}
            >
              {connecting ? "Connecting…" : `Connect wallet · ${network.name}`}
            </button>
          )}
          {walletError && <p role="alert">{walletError}</p>}
        </div>
      )}
      <label>
        Contract interface
        <select
          value={abiSource}
          onChange={(event) => setAbiSource(event.target.value)}
        >
          <option value="direct">Contract ABI</option>
          {implementations.map((item: any) => (
            <option key={item.address_hash} value={item.address_hash}>
              As proxy · {item.name || item.address_hash}
            </option>
          ))}
          <option value="custom">Custom ABI</option>
        </select>
      </label>
      {abiSource !== "direct" && abiSource !== "custom" && (
        <p>
          Using implementation {abiSource}. Calls and transactions still target
          the proxy {address}.
        </p>
      )}
      {abiSource === "custom" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            try {
              const value = JSON.parse(custom);
              if (!Array.isArray(value) || !value.length)
                throw new Error("Paste a non-empty JSON ABI array");
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
            A custom ABI is supplied by you and is not proof of verification.
          </p>
          <button type="submit">Use ABI</button>
        </form>
      )}
      {abiError && <p role="alert">{abiError}</p>}
      {!abi ? (
        <p role="status">
          {abiSource !== "direct" &&
          abiSource !== "custom" &&
          !implementation &&
          !abiError
            ? "Loading implementation ABI…"
            : "No ABI available. You can supply a custom ABI to interact with this address."}
        </p>
      ) : (
        <>
          <label>
            Filter functions
            <input
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          </label>
          <p>
            Integers use base units. Arrays and tuples use JSON arrays; quote
            large integers to preserve precision.
          </p>
          {functions.map((fragment) => (
              <Method
                key={`${address}-${abiSource}-${abiRevision}-${fragment.format("sighash")}`}
                fragment={fragment}
                abi={abi}
                address={address}
                wallet={wallet}
                mode={mode}
                hidden={!matchesFilter(fragment)}
              />
            ))}
          {!functions.some(matchesFilter) && (
            <p role="status">No matching {mode} functions.</p>
          )}
        </>
      )}
    </section>
  );
}
