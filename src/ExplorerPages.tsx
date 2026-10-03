import { useEffect, useRef, useState, type ReactNode } from "react";
import { Download, RefreshCw } from "lucide-react";
import { formatUnits, parseUnits } from "ethers";
import { API, network, externalDestination } from "./network";
import { requestJson, FILTER_TIMEOUT } from "./api-request";
import { downloadCsv } from "./activity-data";

type Row = Record<string, any>;
export type ExplorerPageProps = {
  page: string;
  id?: string;
  t: (key: string) => string;
  go: (path: string) => void;
  get: (path: string, signal?: AbortSignal) => Promise<any>;
  identity: (value: string, link?: string, label?: string) => ReactNode;
  transaction: (item: Row) => ReactNode;
  block: (item: Row) => ReactNode;
  chart: (metric: string, title: string, unit?: string) => ReactNode;
  historyChart?: (items: Row[]) => ReactNode;
  activity: (item: Row, type: string) => ReactNode;
};

export const explorerDestinations = [
  ["/accounts", "Top accounts"],
  ["/internal-txs", "Internal transactions"],
  ["/token-transfers", "Token transfers"],
  ["/deposits", "L1 → L2 deposits"],
  ["/withdrawals", "L2 → L1 withdrawals"],
  ["/batches", "Transaction batches"],
  ["/dispute-games", "Dispute games"],
  ["/ops", "User operations"],
  ["/name-services", "Name services"],
  ["/gas-tracker", "Gas tracker"],
  ["/apps", "Dapps"],
  ["/stats", "All statistics"],
  ["/contract-verification", "Verify contract"],
  ["/public-tags/submit", "Submit public tag"],
] as const;

const integer = (value: any) => {
  try {
    return value == null
      ? "—"
      : BigInt(value).toLocaleString(document.documentElement.lang);
  } catch {
    return "—";
  }
};
const units = (value: any, decimals = 18) => {
  try {
    return value == null ? "—" : formatUnits(BigInt(value), decimals);
  } catch {
    return "—";
  }
};
const date = (value: any) => {
  const d = new Date(value);
  return !value || Number.isNaN(+d)
    ? "—"
    : d.toLocaleString(document.documentElement.lang);
};
const cursorQuery = (value: Row) =>
  new URLSearchParams(
    Object.entries(value || {})
      .filter(([, v]) => v != null)
      .map(([k, v]) => [k, String(v)]),
  ).toString();
const addressHash = (value: any) =>
  typeof value === "string" ? value : value?.hash;
const externalUrl = externalDestination;

function Amount({ value, decimals = 18 }: { value: any; decimals?: number }) {
  const raw = units(value, decimals);
  if (raw === "—") return <>—</>;
  const [whole, fraction = ""] = raw.split("."),
    number = BigInt(whole),
    locale = document.documentElement.lang;
  const separator =
    new Intl.NumberFormat(locale)
      .formatToParts(1.1)
      .find((part) => part.type === "decimal")?.value || ".";
  const abbreviated = fraction.slice(0, 8).replace(/0+$/, "");
  const sign = raw.startsWith("-") && number === 0n ? "-" : "";
  return (
    <span title={`${raw} (${value} base units)`}>
      {sign}
      {number.toLocaleString(locale)}
      {abbreviated ? separator + abbreviated : ""}
      {/[1-9]/.test(fraction.slice(8)) ? "…" : ""}
    </span>
  );
}

export function ExplorerDirectory({
  t,
  go,
}: Pick<ExplorerPageProps, "t" | "go">) {
  return (
    <nav className="explorer-directory" aria-label={t("Explorer tools")}>
      {explorerDestinations.map(([path, label]) => (
        <button key={path} onClick={() => go(path)}>
          {t(label)}
        </button>
      ))}
    </nav>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="explorer-field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function useData(props: ExplorerPageProps, endpoint: string, refresh = 0) {
  const [data, setData] = useState<any>(),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(undefined);
    setError("");
    props
      .get(endpoint, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [endpoint, refresh, retry]);
  return { data, error, retry: () => setRetry((v) => v + 1) };
}

function State({
  data,
  error,
  retry,
  t,
  children,
}: {
  data: any;
  error: string;
  retry: () => void;
  t: ExplorerPageProps["t"];
  children: ReactNode;
}) {
  if (error)
    return (
      <div className="error-state" role="alert">
        <div>
          <strong>{t("unavailable")}</strong>
          <p>{error}</p>
          <button onClick={retry}>
            <RefreshCw size={16} /> {t("retry")}
          </button>
        </div>
      </div>
    );
  if (data === undefined)
    return (
      <div className="loading" role="status">
        <i />
        <span>{t("readingChain")}</span>
      </div>
    );
  return <>{children}</>;
}

function Page({
  title,
  props,
  children,
}: {
  title: string;
  props: ExplorerPageProps;
  children: ReactNode;
}) {
  return (
    <div className="explorer-page">
      <section className="page-intro">
        <div>
          <span>{network.name}</span>
          <h1>{props.t(title)}</h1>
        </div>
      </section>
      <details className="explorer-tools">
        <summary>{props.t("Explorer tools")}</summary>
        <ExplorerDirectory {...props} />
      </details>
      {children}
    </div>
  );
}

function List({
  endpoint,
  props,
  fields,
  render,
  filter,
}: {
  endpoint: string;
  props: ExplorerPageProps;
  fields: string[];
  render: (item: Row, index: number, data: Row) => ReactNode;
  filter?: (item: Row) => boolean;
}) {
  const [cursors, setCursors] = useState<string[]>([""]),
    [position, setPosition] = useState(0);
  const [offsets, setOffsets] = useState<number[]>([0]);
  const query = cursors[position];
  const state = useData(
    props,
    `${endpoint}${query ? `${endpoint.includes("?") ? "&" : "?"}${query}` : ""}`,
  );
  const items = Array.isArray(state.data?.items) ? state.data.items : [];
  const visibleItems = filter ? items.filter(filter) : items;
  const listError =
    state.error ||
    (state.data !== undefined && !Array.isArray(state.data?.items)
      ? props.t("invalidApiResponse")
      : "");
  const next = state.data?.next_page_params;
  return (
    <section
      className={`table-shell explorer-list explorer-list-${props.page}`}
      aria-busy={state.data === undefined && !state.error}
    >
      <div className="table-toolbar">
        <span>
          {props.t("Page")} {position + 1}
        </span>
        <button
          className="text-link"
          disabled={!visibleItems.length}
          onClick={() =>
            downloadCsv(
              `ink-${network.chainId}-${props.page}.csv`,
              fields,
              visibleItems.map((item: Row) =>
                fields.map((key) =>
                  Array.isArray(item[key])
                    ? item[key].join(";")
                    : (item[key] ?? ""),
                ),
              ),
            )
          }
        >
          <Download size={16} /> {props.t("exportPage")}
        </button>
      </div>
      <State {...state} error={listError} t={props.t}>
        {visibleItems.length ? (
          visibleItems.map((item: Row, index: number) => (
            <article
              className="explorer-record"
              key={item.hash || item.number || item.index || index}
            >
              {render(item, index + offsets[position], state.data)}
            </article>
          ))
        ) : (
          <div className="empty">
            {props.t(
              filter && next
                ? "No matching records on this page; continue to the next page."
                : "noRecords",
            )}
          </div>
        )}
      </State>
      <div className="pagination">
        <button
          disabled={!position || (state.data === undefined && !listError)}
          onClick={() => setPosition(0)}
        >
          {props.t("Newest")}
        </button>
        <button
          disabled={!position || (state.data === undefined && !listError)}
          onClick={() => setPosition((v) => v - 1)}
        >
          {props.t("Previous")}
        </button>
        <button
          disabled={
            !next ||
            !Object.keys(next).length ||
            state.data === undefined ||
            !!listError
          }
          onClick={() => {
            const value = cursorQuery(next);
            setCursors((old) => [...old.slice(0, position + 1), value]);
            setOffsets((old) => [
              ...old.slice(0, position + 1),
              offsets[position] + items.length,
            ]);
            setPosition((v) => v + 1);
          }}
        >
          {props.t("Next")}
        </button>
      </div>
    </section>
  );
}

function Accounts(props: ExplorerPageProps) {
  return (
    <Page title="Top accounts" props={props}>
      <List
        props={props}
        endpoint="/explorer/addresses"
        fields={["hash", "coin_balance", "transactions_count"]}
        render={(item, index, data) => {
          let share = "—";
          try {
            const supply = parseUnits(String(data.total_supply), 18);
            if (supply > 0n)
              share = `${(Number((BigInt(item.coin_balance) * 1000000000n) / supply) / 10000000).toLocaleString(document.documentElement.lang, { maximumFractionDigits: 7 })}%`;
          } catch {
            /* unknown supply */
          }
          const label =
            item.ens_domain_name ||
            item.metadata?.tags?.find((tag: Row) => tag.tagType === "name")
              ?.name ||
            item.name;
          return (
            <>
              <div className="explorer-record-heading">
                <span>#{index + 1}</span>
                {props.identity(item.hash, `/address/${item.hash}`, label)}
              </div>
              <dl className="explorer-record-facts">
                <Field label={props.t("ETH balance")}>
                  <Amount value={item.coin_balance} /> ETH
                </Field>
                <Field label={props.t("Share of supply")}>{share}</Field>
                <Field label={props.t("transactions")}>
                  {integer(item.transactions_count)}
                </Field>
                <Field label={props.t("Type")}>
                  {props.t(item.is_contract ? "Contract" : "Account")}
                </Field>
              </dl>
            </>
          );
        }}
      />
    </Page>
  );
}

function Batches(props: ExplorerPageProps) {
  const count = useData(props, "/explorer/optimism/batches/count");
  return (
    <Page title="Transaction batches" props={props}>
      <p>
        {props.t("Total batches")}: {integer(count.data)}
      </p>
      <List
        props={props}
        endpoint="/explorer/optimism/batches"
        fields={[
          "number",
          "batch_data_container",
          "l1_timestamp",
          "l1_transaction_hashes",
          "l2_start_block_number",
          "l2_end_block_number",
          "transactions_count",
        ]}
        render={(item) => (
          <>
            <div className="explorer-record-heading">
              <button
                className="text-link"
                onClick={() => props.go(`/batches/${item.number}`)}
              >
                #{integer(item.number)}
              </button>
              <time>{date(item.l1_timestamp)}</time>
            </div>
            <dl className="explorer-record-facts">
              <Field label={props.t("Storage")}>
                {item.batch_data_container === "in_blob4844"
                  ? "EIP-4844 blob"
                  : item.batch_data_container === "in_calldata"
                    ? "Calldata"
                    : item.batch_data_container || "—"}
              </Field>
              <Field label={props.t("L1 transactions")}>
                {integer(item.l1_transaction_hashes?.length)}
              </Field>
              <Field label={props.t("L2 blocks")}>
                <button
                  className="text-link"
                  onClick={() => props.go(`/batches/${item.number}?tab=blocks`)}
                >
                  {integer(
                    item.l2_end_block_number - item.l2_start_block_number + 1,
                  )}
                </button>
              </Field>
              <Field label={props.t("transactions")}>
                <button
                  className="text-link"
                  onClick={() => props.go(`/batches/${item.number}?tab=txs`)}
                >
                  {integer(item.transactions_count)}
                </button>
              </Field>
            </dl>
          </>
        )}
      />
    </Page>
  );
}

function Batch(props: ExplorerPageProps) {
  const state = useData(props, `/explorer/optimism/batches/${props.id}`);
  const [tab, setTab] = useState(() =>
    new URLSearchParams(location.search).get("tab") === "blocks"
      ? "blocks"
      : "txs",
  );
  const item = state.data;
  return (
    <Page title="Transaction batch" props={props}>
      <State {...state} t={props.t}>
        <dl className="explorer-detail">
          <Field label={props.t("Batch ID")}>{integer(props.id)}</Field>
          <Field label={props.t("Timestamp")}>{date(item?.l1_timestamp)}</Field>
          <Field label={props.t("Storage")}>
            {item?.batch_data_container === "in_blob4844"
              ? "EIP-4844 blob"
              : item?.batch_data_container || "—"}
          </Field>
          <Field label={props.t("L1 transactions")}>
            {item?.l1_transaction_hashes?.map((hash: string) => (
              <div key={hash}>{props.identity(hash)}</div>
            ))}
          </Field>
          <Field label={props.t("First L2 block")}>
            {item?.l2_start_block_number != null &&
              props.identity(
                String(item.l2_start_block_number),
                `/block/${item.l2_start_block_number}`,
              )}
          </Field>
          <Field label={props.t("Last L2 block")}>
            {item?.l2_end_block_number != null &&
              props.identity(
                String(item.l2_end_block_number),
                `/block/${item.l2_end_block_number}`,
              )}
          </Field>
          <Field label={props.t("transactions")}>
            {integer(item?.transactions_count)}
          </Field>
        </dl>
        {Array.isArray(item?.blobs) && item.blobs.length > 0 && (
          <details className="explorer-tools">
            <summary>EIP-4844 · {integer(item.blobs.length)} blobs</summary>
            <dl>
              {item.blobs.map((blob: Row) => (
                <Field
                  key={blob.hash}
                  label={`${props.t("Timestamp")}: ${date(blob.l1_timestamp)}`}
                >
                  <div>{props.identity(blob.hash)}</div>
                  <div>
                    {props.t("L1 transaction")}:{" "}
                    {props.identity(blob.l1_transaction_hash)}
                  </div>
                </Field>
              ))}
            </dl>
          </details>
        )}
        <label className="explorer-select">
          {props.t("pageSection")}
          <select
            value={tab}
            onChange={(e) => {
              setTab(e.target.value);
              const u = new URL(location.href);
              u.searchParams.set("tab", e.target.value);
              history.replaceState({}, "", u.pathname + u.search);
            }}
          >
            <option value="txs">{props.t("transactions")}</option>
            <option value="blocks">{props.t("blocks")}</option>
          </select>
        </label>
        {item && (
          <List
            key={tab}
            props={props}
            endpoint={`/explorer/${tab === "blocks" ? "blocks" : "transactions"}/optimism-batch/${props.id}`}
            fields={
              tab === "blocks"
                ? ["height", "hash", "timestamp", "transactions_count"]
                : ["hash", "timestamp", "block_number", "value"]
            }
            render={(value) =>
              tab === "blocks" ? props.block(value) : props.transaction(value)
            }
          />
        )}
      </State>
    </Page>
  );
}

function Games(props: ExplorerPageProps) {
  const count = useData(props, "/explorer/optimism/games/count");
  return (
    <Page title="Dispute games" props={props}>
      <p>
        {props.t(
          "Dispute games challenge L2 output claims on Ethereum. Their contract addresses belong to L1.",
        )}
      </p>
      <p>
        {props.t("Total games")}: {integer(count.data)}
      </p>
      <List
        props={props}
        endpoint="/explorer/optimism/games"
        fields={[
          "index",
          "game_type",
          "contract_address_hash",
          "l2_block_number",
          "l2_timestamp",
          "created_at",
          "status",
          "resolved_at",
        ]}
        render={(item) => (
          <>
            <div className="explorer-record-heading">
              <strong>#{integer(item.index)}</strong>
              <span>{props.t(item.status || "Unknown")}</span>
            </div>
            <dl className="explorer-record-facts">
              <Field label={props.t("L1 contract")}>
                {props.identity(item.contract_address_hash)}
              </Field>
              <Field label={props.t("Game type")}>
                {integer(item.game_type)}
              </Field>
              <Field label={props.t("L2 timestamp")}>
                {date(item.l2_timestamp)}
              </Field>
              <Field label={props.t("Created")}>{date(item.created_at)}</Field>
              <Field label={props.t("Resolved")}>
                {date(item.resolved_at)}
              </Field>
              {item.l2_block_number != null && (
                <Field label={props.t("L2 block")}>
                  {props.identity(
                    String(item.l2_block_number),
                    `/block/${item.l2_block_number}`,
                  )}
                </Field>
              )}
            </dl>
          </>
        )}
      />
    </Page>
  );
}

function Gas(props: ExplorerPageProps) {
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setRefresh((v) => v + 1), 30000);
    return () => clearInterval(timer);
  }, []);
  const state = useData(props, "/explorer/stats?gas_oracle=updated", refresh);
  const stats = state.data;
  return (
    <Page title="Gas tracker" props={props}>
      <p>
        {props.t(
          "Gas estimates describe L2 execution. The total transaction fee also includes the L1 data fee.",
        )}
      </p>
      {state.error && (
        <State {...state} t={props.t}>
          {null}
        </State>
      )}
      <section
        className="explorer-gas-grid"
        aria-busy={state.data === undefined && !state.error}
      >
        {state.data === undefined && !state.error && (
          <span className="sr-only" role="status">
            {props.t("readingChain")}
          </span>
        )}
        {["slow", "average", "fast"].map((speed) => {
          const estimate = stats?.gas_prices?.[speed];
          return (
            <article className="metric" key={speed}>
              <h2>{props.t(speed)}</h2>
              <strong>
                {estimate?.wei != null
                  ? units(estimate.wei, 9)
                  : (estimate?.price ??
                    (typeof estimate === "number" ? estimate : "—"))}{" "}
                <small>Gwei</small>
              </strong>
              <dl>
                <Field label={props.t("Estimated inclusion")}>
                  {estimate?.time != null
                    ? `${Number(estimate.time) / 1000} s`
                    : "—"}
                </Field>
                <Field label={props.t("Priority fee")}>
                  {estimate?.priority_fee_wei != null
                    ? `${units(estimate.priority_fee_wei, 9)} Gwei`
                    : "—"}
                </Field>
              </dl>
            </article>
          );
        })}
      </section>
      <p>
        {props.t("Updated")}: {date(stats?.gas_price_updated_at)}
      </p>
      {props.chart("averageGasPrice", props.t("Gas price history"), "Gwei")}
      <details className="explorer-tools">
        <summary>{props.t("How gas fees work")}</summary>
        <p>
          {props.t(
            "Execution uses gas multiplied by the effective gas price. L1 data fees pay for publishing rollup data to Ethereum. Open a transaction to inspect both components.",
          )}
        </p>
      </details>
    </Page>
  );
}

function Operation(props: ExplorerPageProps) {
  const state = useData(
      props,
      `/explorer/proxy/account-abstraction/operations/${props.id}`,
    ),
    item = state.data;
  const [tab, setTab] = useState(() => {
    const value = new URLSearchParams(location.search).get("tab");
    return value === "token_transfers"
      ? "transfers"
      : ["transfers", "logs", "raw"].includes(value || "")
        ? value!
        : "details";
  });
  const select = (value: string) => {
    setTab(value);
    const u = new URL(location.href);
    u.searchParams.set("tab", value);
    history.replaceState({}, "", u.pathname + u.search);
  };
  const inOperation = (record: Row) => {
    const index = Number(record.log_index ?? record.index),
      start = Number(item?.user_logs_start_index),
      count = Number(item?.user_logs_count);
    return (
      item?.user_logs_start_index != null &&
      item?.user_logs_count != null &&
      Number.isFinite(index) &&
      index >= start &&
      index < start + count
    );
  };
  const address = (value: any) => {
    const hash = addressHash(value);
    return hash ? props.identity(hash, `/address/${hash}`) : "—";
  };
  return (
    <Page title="User operation" props={props}>
      <State {...state} t={props.t}>
        <label className="explorer-select">
          {props.t("pageSection")}
          <select value={tab} onChange={(e) => select(e.target.value)}>
            {[
              ["details", "overview"],
              ["transfers", "Token transfers"],
              ["logs", "logs"],
              ["raw", "Raw operation"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {props.t(label)}
              </option>
            ))}
          </select>
        </label>
        {tab === "details" && (
          <>
            <dl className="explorer-detail">
              <Field label={props.t("Hash")}>{props.identity(props.id!)}</Field>
              <Field label={props.t("Status")}>
                {item?.status == null
                  ? "—"
                  : props.t(item.status ? "Success" : "Failed")}
              </Field>
              <Field label={props.t("Sender")}>{address(item?.sender)}</Field>
              <Field label={props.t("Included in")}>
                {item?.transaction_hash &&
                  props.identity(
                    item.transaction_hash,
                    `/tx/${item.transaction_hash}`,
                  )}
              </Field>
              <Field label={props.t("block")}>
                {item?.block_number != null &&
                  props.identity(
                    String(item.block_number),
                    `/block/${item.block_number}`,
                  )}
              </Field>
              <Field label={props.t("Timestamp")}>
                {date(item?.timestamp)}
              </Field>
              <Field label="EntryPoint">
                {address(item?.entry_point)} {item?.entry_point_version}
              </Field>
              <Field label={props.t("Bundler")}>{address(item?.bundler)}</Field>
              <Field label={props.t("Paymaster")}>
                {address(item?.paymaster)}
              </Field>
              <Field label={props.t("Factory")}>{address(item?.factory)}</Field>
              <Field label={props.t("Nonce")}>{integer(item?.nonce)}</Field>
              <Field label={props.t("fee")}>{units(item?.fee)} ETH</Field>
              <Field label={props.t("Gas used")}>
                {integer(item?.gas_used)}
              </Field>
              <Field label={props.t("Gas price")}>
                {units(item?.gas_price, 9)} Gwei
              </Field>
              <Field label={props.t("Call gas limit")}>
                {integer(item?.call_gas_limit)}
              </Field>
              <Field label={props.t("Verification gas limit")}>
                {integer(item?.verification_gas_limit)}
              </Field>
              <Field label={props.t("Pre-verification gas")}>
                {integer(item?.pre_verification_gas)}
              </Field>
              <Field label={props.t("Revert reason")}>
                {item?.revert_reason || "—"}
              </Field>
            </dl>
            {[
              ["Decoded call", item?.decoded_call_data],
              ["Decoded execution", item?.decoded_execute_call_data],
            ].map(
              ([label, value]) =>
                value && (
                  <details className="raw-metadata" key={label as string}>
                    <summary>{props.t(label as string)}</summary>
                    <pre>{JSON.stringify(value, null, 2)}</pre>
                  </details>
                ),
            )}
          </>
        )}
        {tab === "raw" && (
          <div className="code-panel">
            <pre>{JSON.stringify(item?.raw || item, null, 2)}</pre>
          </div>
        )}
        {["transfers", "logs"].includes(tab) &&
          (item?.transaction_hash &&
          item?.user_logs_start_index != null &&
          item?.user_logs_count != null ? (
            <>
              <p>
                {props.t(
                  "Records are limited to this operation’s execution log range.",
                )}
              </p>
              <List
                key={tab}
                props={props}
                endpoint={`/explorer/transactions/${item.transaction_hash}/${tab === "transfers" ? "token-transfers" : "logs"}`}
                fields={
                  tab === "transfers"
                    ? ["transaction_hash", "log_index", "timestamp"]
                    : ["index", "data", "topics"]
                }
                filter={inOperation}
                render={(record) =>
                  props.activity(
                    record,
                    tab === "transfers" ? "token transfer" : "logs",
                  )
                }
              />
            </>
          ) : (
            <div role="status" className="explorer-feedback">
              <p>
                {props.t("The operation’s execution log range is unavailable.")}
              </p>
              {item?.transaction_hash && (
                <button
                  onClick={() =>
                    props.go(`/tx/${item.transaction_hash}?tab=${tab}`)
                  }
                >
                  {props.t("Included in")}
                </button>
              )}
            </div>
          ))}
      </State>
    </Page>
  );
}

export function AddressHistory(props: ExplorerPageProps) {
  const chart = useData(
    props,
    `/explorer/addresses/${props.id}/coin-balance-history-by-day`,
  );
  const chartItems = Array.isArray(chart.data?.items) ? chart.data.items : [];
  return (
    <section className="balance-history">
      <h2>{props.t("Account history")}</h2>
      <State {...chart} t={props.t}>
        {chartItems.length > 0 && props.historyChart?.(chartItems)}
      </State>
      <List
        props={props}
        endpoint={`/explorer/addresses/${props.id}/coin-balance-history`}
        fields={[
          "block_number",
          "block_timestamp",
          "transaction_hash",
          "value",
          "delta",
        ]}
        render={(item) => (
          <>
            <div className="explorer-record-heading">
              <time>{date(item.block_timestamp)}</time>
              {item.transaction_hash &&
                props.identity(
                  item.transaction_hash,
                  `/tx/${item.transaction_hash}`,
                )}
            </div>
            <dl className="explorer-record-facts">
              <Field label={props.t("block")}>
                {item.block_number != null &&
                  props.identity(
                    String(item.block_number),
                    `/block/${item.block_number}`,
                  )}
              </Field>
              <Field label={props.t("Historical ETH balance")}>
                {units(item.value)} ETH
              </Field>
              <Field label={props.t("Balance change")}>
                {units(item.delta)} ETH
              </Field>
            </dl>
          </>
        )}
      />
    </section>
  );
}

export function UserOperationsList(
  props: ExplorerPageProps & { transactionHash?: string; sender?: string },
) {
  const query = new URLSearchParams();
  if (props.transactionHash)
    query.set("transaction_hash", props.transactionHash);
  if (props.sender) query.set("sender", props.sender);
  return (
    <List
      props={props}
      endpoint={`/explorer/proxy/account-abstraction/operations${query.size ? `?${query}` : ""}`}
      fields={[
        "hash",
        "transaction_hash",
        "block_number",
        "status",
        "fee",
        "timestamp",
      ]}
      render={(item) => (
        <>
          <div className="explorer-record-heading">
            {props.identity(item.hash, `/op/${item.hash}`)}
            <span>
              {item.status == null
                ? "—"
                : props.t(item.status ? "Success" : "Failed")}
            </span>
          </div>
          <dl className="explorer-record-facts">
            <Field label={props.t("Sender")}>
              {addressHash(item.address)
                ? props.identity(
                    addressHash(item.address),
                    `/address/${addressHash(item.address)}`,
                  )
                : "—"}
            </Field>
            <Field label={props.t("Included in")}>
              {item.transaction_hash &&
                props.identity(
                  item.transaction_hash,
                  `/tx/${item.transaction_hash}`,
                )}
            </Field>
            <Field label={props.t("block")}>
              {item.block_number != null &&
                props.identity(
                  String(item.block_number),
                  `/block/${item.block_number}`,
                )}
            </Field>
            <Field label={props.t("fee")}>{units(item.fee)} ETH</Field>
            <Field label={props.t("Timestamp")}>{date(item.timestamp)}</Field>
          </dl>
        </>
      )}
    />
  );
}

export function AssetFlows(props: ExplorerPageProps & { tx: Row }) {
  const from = addressHash(props.tx.from),
    to = addressHash(props.tx.to || props.tx.created_contract);
  let nativeTransfer = false;
  try {
    nativeTransfer =
      BigInt(props.tx.value || "0") > 0n && props.tx.status === "ok";
  } catch {
    /* unknown native value */
  }
  const flow = (item: Row, token = false) => {
    const sender = addressHash(item.from),
      recipient = addressHash(item.to),
      amount = item.total?.value ?? item.value;
    const tokenId = item.total?.token_id;
    const reverted =
      !token && (item.success === false || item.error || item.error_message);
    const ids = Array.isArray(item.total?.token_ids)
      ? item.total.token_ids
      : [];
    const amounts = Array.isArray(item.total?.values) ? item.total.values : [];
    return (
      <>
        <div className="asset-flow-route">
          {sender ? props.identity(sender, `/address/${sender}`) : "—"}
          <span aria-label={props.t("to")}>→</span>
          {recipient ? props.identity(recipient, `/address/${recipient}`) : "—"}
        </div>
        <dl className="explorer-record-facts">
          <Field label={props.t("Asset")}>
            {token && item.token?.address_hash
              ? props.identity(
                  item.token.address_hash,
                  `/token/${item.token.address_hash}`,
                  item.token.symbol ||
                    item.token.name ||
                    item.token.address_hash,
                )
              : "ETH"}
          </Field>
          <Field label={props.t("Amount")}>
            {ids.length
              ? ids
                  .map(
                    (id: any, index: number) =>
                      `#${id}${amounts[index] != null ? ` × ${integer(amounts[index])}` : ""}`,
                  )
                  .join(" · ")
              : tokenId != null
                ? `#${tokenId}${amount != null ? ` × ${integer(amount)}` : ""}`
                : token && item.token?.decimals == null
                  ? `${amount ?? "—"} ${props.t("base units")}`
                  : units(amount, token ? Number(item.token.decimals) : 18)}
          </Field>
          <Field label={props.t("Type")}>
            {token ? item.token?.type || "—" : item.type || "Transfer"}
          </Field>
          {reverted && (
            <Field label={props.t("Status")}>
              <strong>{props.t("Reverted — no balance movement")}</strong>
              <span>
                {" "}
                · {item.error || item.error_message || props.t("Failed")}
              </span>
            </Field>
          )}
        </dl>
      </>
    );
  };
  return (
    <section className="asset-flows">
      <h2>{props.t("Asset flows")}</h2>
      <p>
        {props.t(
          "Indexed native and token movements are shown separately. Execution fees are displayed in transaction details.",
        )}
      </p>
      {nativeTransfer && from && to && (
        <article className="explorer-record">
          {flow({ from, to, value: props.tx.value })}
        </article>
      )}
      <h3>{props.t("Token transfers")}</h3>
      <List
        props={props}
        endpoint={`/explorer/transactions/${props.id}/token-transfers`}
        fields={["transaction_hash", "timestamp", "block_number"]}
        render={(item) => flow(item, true)}
      />
      <h3>{props.t("Internal transactions")}</h3>
      <List
        props={props}
        endpoint={`/explorer/transactions/${props.id}/internal-transactions`}
        fields={["transaction_hash", "index", "value", "type"]}
        render={(item) => flow(item)}
      />
    </section>
  );
}

function Names(props: ExplorerPageProps) {
  const [name, setName] = useState(""),
    [query, setQuery] = useState(""),
    [protocol, setProtocol] = useState("");
  const protocols = useData(props, "/names/protocols");
  const addressQuery = /^0x[\da-f]{40}$/i.test(query);
  const q = new URLSearchParams({ only_active: "true" });
  if (query) {
    if (addressQuery) {
      q.set("address", query);
      q.set("resolved_to", "true");
      q.set("owned_by", "true");
    } else q.set("name", query);
  }
  q.set(
    "protocols",
    protocol ||
      protocols.data?.items?.map((item: Row) => item.id).join(",") ||
      "ens",
  );
  return (
    <Page title="Name services" props={props}>
      <p>
        {props.t(
          "Names may be registered on another chain. Address links show the selected Ink network.",
        )}
      </p>
      <form
        className="explorer-search"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(name.trim());
        }}
      >
        <label>
          {props.t("Domain name")}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="name.eth"
            maxLength={250}
          />
        </label>
        <label>
          {props.t("Protocol")}
          <select
            value={protocol}
            onChange={(e) => setProtocol(e.target.value)}
          >
            <option value="">{props.t("All protocols")}</option>
            {protocols.data?.items?.map((item: Row) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">{props.t("search")}</button>
      </form>
      {protocols.error && (
        <div role="alert">
          {protocols.error}{" "}
          <button onClick={protocols.retry}>{props.t("retry")}</button>
        </div>
      )}
      <List
        key={q.toString()}
        props={props}
        endpoint={`/names/${addressQuery ? "addresses:lookup" : "domains:lookup"}?${q}`}
        fields={["name", "registration_date", "expiry_date"]}
        render={(item) => (
          <>
            <div className="explorer-record-heading">
              <button
                className="text-link"
                onClick={() =>
                  props.go(
                    `/name-services/domains/${encodeURIComponent(item.name)}?protocol_id=${encodeURIComponent(item.protocol?.id || "")}`,
                  )
                }
              >
                {item.name}
              </button>
              <span>{item.protocol?.short_name}</span>
            </div>
            <dl className="explorer-record-facts">
              <Field label={props.t("Resolved address")}>
                {addressHash(item.resolved_address)
                  ? props.identity(
                      addressHash(item.resolved_address),
                      `/address/${addressHash(item.resolved_address)}`,
                    )
                  : "—"}
              </Field>
              <Field label={props.t("Registered")}>
                {date(item.registration_date)}
              </Field>
              <Field label={props.t("Expires")}>{date(item.expiry_date)}</Field>
            </dl>
          </>
        )}
      />
    </Page>
  );
}

function Domain(props: ExplorerPageProps) {
  const name = props.id!.replace(/^domains\//, "");
  const query =
    new URLSearchParams(location.search).get("protocol_id") ||
    new URLSearchParams(location.search).get("protocols") ||
    "ens";
  const endpoint = `/names/domains/${encodeURIComponent(name)}${query ? `?protocol_id=${encodeURIComponent(query)}` : ""}`;
  const state = useData(props, endpoint),
    item = state.data;
  return (
    <Page title="Domain details" props={props}>
      <p>
        {props.t(
          "Names may be registered on another chain. Address links show the selected Ink network.",
        )}
      </p>
      <State {...state} t={props.t}>
        <dl className="explorer-detail">
          <Field label={props.t("Domain name")}>{name}</Field>
          <Field label={props.t("Protocol")}>
            {item?.protocol?.title || "—"}
          </Field>
          <Field label={props.t("Resolved address")}>
            {addressHash(item?.resolved_address)
              ? props.identity(
                  addressHash(item.resolved_address),
                  `/address/${addressHash(item.resolved_address)}`,
                )
              : "—"}
          </Field>
          <Field label={props.t("Owner")}>
            {addressHash(item?.owner)
              ? props.identity(
                  addressHash(item.owner),
                  `/address/${addressHash(item.owner)}`,
                )
              : "—"}
          </Field>
          <Field label={props.t("Registered")}>
            {date(item?.registration_date)}
          </Field>
          <Field label={props.t("Expires")}>{date(item?.expiry_date)}</Field>
        </dl>
        <details className="raw-metadata">
          <summary>{props.t("Metadata")}</summary>
          <pre>{JSON.stringify(item, null, 2)}</pre>
        </details>
      </State>
      <h2>{props.t("Domain history")}</h2>
      <List
        props={props}
        endpoint={`${endpoint.split("?")[0]}/events${query ? `?protocol_id=${encodeURIComponent(query)}` : ""}`}
        fields={["action", "timestamp", "transaction_hash", "block_number"]}
        render={(event) => (
          <>
            <div className="explorer-record-heading">
              <strong>{event.action || event.type || "—"}</strong>
              <time>{date(event.timestamp)}</time>
            </div>
            <details className="raw-metadata">
              <summary>{props.t("Metadata")}</summary>
              <pre>{JSON.stringify(event, null, 2)}</pre>
            </details>
          </>
        )}
      />
    </Page>
  );
}

function Apps(props: ExplorerPageProps) {
  const state = useData(props, "/dapps"),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("");
  const apps: Row[] = Array.isArray(state.data) ? state.data : [];
  const categories = [
    ...new Set(
      apps.flatMap((item) =>
        Array.isArray(item.categories) ? item.categories : [],
      ),
    ),
  ].sort();
  const items = apps.filter(
    (item) =>
      (!props.id || item.id === props.id) &&
      (!category || item.categories?.includes(category)) &&
      `${item.title} ${item.shortDescription || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <Page title="Dapps" props={props}>
      <State {...state} t={props.t}>
        {!props.id && (
          <div className="explorer-search">
            <label>
              {props.t("search")}
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label>
              {props.t("Category")}
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">{props.t("All categories")}</option>
                {categories.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
        )}
        <div className="explorer-app-grid">
          {items.map((item) => (
            <article className="explorer-app" key={item.id}>
              <h2>
                <button
                  className="text-link"
                  onClick={() =>
                    props.go(`/apps/${encodeURIComponent(item.id)}`)
                  }
                >
                  {item.title}
                </button>
              </h2>
              <p>{props.id ? item.description : item.shortDescription}</p>
              <p>{item.categories?.join(" · ")}</p>
              {props.id && (
                <dl>
                  <Field label={props.t("Author")}>{item.author || "—"}</Field>
                  <Field label={props.t("Rating")}>
                    {item.rating == null
                      ? "—"
                      : `${item.rating}/5 (${integer(item.ratingsTotalCount)})`}
                  </Field>
                </dl>
              )}
              {externalUrl(item.url) && (
                <a
                  href={externalUrl(item.url)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {props.t("Open app")} ↗
                </a>
              )}
            </article>
          ))}
        </div>
        {!items.length && <div className="empty">{props.t("noRecords")}</div>}
      </State>
    </Page>
  );
}

function Statistics(props: ExplorerPageProps) {
  const state = useData(props, "/stats/lines"),
    counters = useData(props, "/stats/counters");
  const [category, setCategory] = useState(""),
    [search, setSearch] = useState("");
  const sections: Row[] = Array.isArray(state.data?.sections)
    ? state.data.sections
    : [];
  const charts = sections.flatMap((section) =>
    (section.charts || []).map((chart: Row) => ({
      ...chart,
      section: section.id,
    })),
  );
  const selected = charts.filter(
    (chart) =>
      (!props.id || chart.id === props.id) &&
      (!category || chart.section === category) &&
      `${chart.title} ${chart.description}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <Page title="All statistics" props={props}>
      <State {...state} t={props.t}>
        {!props.id && (
          <>
            <details className="explorer-tools">
              <summary>{props.t("Network totals")}</summary>
              <State {...counters} t={props.t}>
                <dl className="explorer-record-facts">
                  {(counters.data?.counters || []).map((counter: Row) => (
                    <Field key={counter.id} label={props.t(counter.title)}>
                      {counter.value == null
                        ? "—"
                        : counter.units
                          ? `${counter.value} ${counter.units}`
                          : integer(counter.value)}
                    </Field>
                  ))}
                </dl>
              </State>
            </details>
            <div className="explorer-search">
              <label>
                {props.t("search")}
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <label>
                {props.t("Category")}
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">{props.t("All categories")}</option>
                  {sections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {props.t(section.title)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>
        )}
        <div className="stat-chart-grid">
          {selected.map((chart) => (
            <section key={chart.id} className="explorer-chart">
              <button
                className="text-link"
                onClick={() => props.go(`/stats/${chart.id}`)}
              >
                {props.t("View chart")}
              </button>
              {props.chart(
                chart.id,
                props.t(chart.title),
                chart.units || undefined,
              )}
              <p>{props.t(chart.description)}</p>
            </section>
          ))}
        </div>
        {!selected.length && (
          <div className="empty">{props.t("noRecords")}</div>
        )}
      </State>
    </Page>
  );
}

function Verification(props: ExplorerPageProps) {
  const config = useData(
    props,
    "/explorer/smart-contracts/verification/config",
  );
  const [address, setAddress] = useState(
    new URLSearchParams(location.search).get("address") || "",
  );
  const sourceImport = useRef(0);
  useEffect(
    () => () => {
      sourceImport.current++;
    },
    [],
  );
  const [method, setMethod] = useState("standard-input"),
    [optimize, setOptimize] = useState(false),
    [runs, setRuns] = useState("200"),
    [evm, setEvm] = useState("default"),
    [libraries, setLibraries] = useState("{}");
  const [compiler, setCompiler] = useState(""),
    [license, setLicense] = useState("none"),
    [source, setSource] = useState("");
  const [contractName, setContractName] = useState(""),
    [args, setArgs] = useState(""),
    [autodetect, setAutodetect] = useState(true),
    [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [job, setJob] = useState<Row>();
  const controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => controller.current?.abort(), []);
  const isRecipe = ["solidity-hardhat", "solidity-foundry"].includes(method),
    isStandard = [
      "standard-input",
      "vyper-standard-input",
      "solidity-hardhat",
      "solidity-foundry",
    ].includes(method),
    isMulti = ["multi-part", "vyper-multi-part"].includes(method),
    isSourcify = method === "sourcify";
  const inputLanguage = method.startsWith("vyper")
    ? "Vyper"
    : (() => {
        try {
          return JSON.parse(source).language;
        } catch {
          return "Solidity";
        }
      })();
  const compilers: string[] =
    inputLanguage === "Vyper"
      ? config.data?.vyper_compiler_versions || []
      : config.data?.solidity_compiler_versions || [];
  const check = async (ticket: string, signal: AbortSignal) => {
    for (let attempt = 0; attempt < 30 && !signal.aborted; attempt++) {
      const status = await requestJson<Row>(
        `${API}/verification/status/${ticket}`,
        { signal },
      );
      if (signal.aborted) return;
      setJob(status);
      if (status.status !== "pending") return;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          signal.removeEventListener("abort", abort);
          resolve();
        }, 2000);
        const abort = () => {
          clearTimeout(timer);
          resolve();
        };
        signal.addEventListener("abort", abort, { once: true });
      });
    }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError("");
    setJob(undefined);
    let input, linkedLibraries;
    try {
      linkedLibraries = JSON.parse(libraries);
      if (isStandard || isMulti) input = JSON.parse(source);
    } catch {
      setError(props.t("Invalid standard input JSON"));
      return;
    }
    if (
      (isStandard || isMulti) &&
      (!input?.sources || !Object.keys(input.sources).length)
    ) {
      setError(props.t("Include source files in standard input"));
      return;
    }
    if (!/^0x[\da-f]{40}$/i.test(address) || !consent) {
      setError(
        props.t(
          "Confirm source publication and provide a valid contract address",
        ),
      );
      return;
    }
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    try {
      const result = await requestJson<Row>(
        `${API}/verification/submit`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: abort.signal,
          body: JSON.stringify({
            address,
            method: isRecipe ? "standard-input" : method,
            is_optimization_enabled: optimize,
            optimization_runs: runs,
            evm_version: evm,
            libraries: linkedLibraries,
            compiler_version: compiler || compilers[0],
            license_type: license,
            source,
            contract_name: contractName,
            constructor_args: args,
            autodetect_constructor_args: autodetect,
            consent,
          }),
        },
        FILTER_TIMEOUT,
      );
      if (!abort.signal.aborted) {
        setJob(result);
        if (result.status === "pending")
          await check(result.ticket, abort.signal);
      }
    } catch (e) {
      if (!abort.signal.aborted)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  };
  const field = (
    label: string,
    value: string,
    setValue: (value: string) => void,
    required = false,
  ) => (
    <label>
      {props.t(label)}
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        required={required}
        disabled={busy}
      />
    </label>
  );
  const resume = async () => {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    try {
      await check(job!.ticket, c.signal);
    } catch (e) {
      if (!c.signal.aborted)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
  };
  return (
    <Page title="Verify contract" props={props}>
      <p>
        {props.t(
          "Verify deployed bytecode against its original compiler input. Successful verification publishes the source code.",
        )}
      </p>
      <State {...config} t={props.t}>
        <form className="explorer-form" onSubmit={submit}>
          {field("Contract address", address, setAddress, true)}
          <label>
            {props.t("Verification method")}
            <select
              value={method}
              disabled={busy}
              onChange={(e) => {
                sourceImport.current++;
                setMethod(e.target.value);
                setSource("");
                setCompiler("");
                setJob(undefined);
                setError("");
              }}
            >
              {[
                ...(config.data?.verification_options || ["standard-input"]),
                ...(config.data?.verification_options?.includes(
                  "standard-input",
                )
                  ? ["solidity-hardhat", "solidity-foundry"]
                  : []),
              ].map((value: string) => (
                <option key={value} value={value}>
                  {props.t(value)}
                </option>
              ))}
            </select>
          </label>
          {isRecipe && (
            <div className="explorer-feedback">
              <p>
                {props.t(
                  "Generate build information with your project’s original compiler settings, then upload its build-info JSON here. The input is extracted without changing compilation settings.",
                )}
              </p>
              <pre>
                {method === "solidity-hardhat"
                  ? "npx hardhat compile\n# artifacts/build-info/*.json"
                  : "forge build --build-info\n# out/build-info/*.json"}
              </pre>
            </div>
          )}
          {isSourcify ? (
            <p>
              {props.t(
                "Look up existing verified compiler metadata in Sourcify. No source upload is needed.",
              )}
            </p>
          ) : (
            <>
              <label>
                {props.t(
                  isStandard
                    ? "Standard input JSON"
                    : isMulti
                      ? "Source files"
                      : "Source code",
                )}
                <input
                  type="file"
                  multiple={isMulti}
                  accept={
                    isStandard
                      ? ".json,application/json"
                      : ".sol,.vy,.vyi,.json"
                  }
                  disabled={busy}
                  onChange={async (e) => {
                    const importId = ++sourceImport.current;
                    const files = Array.from(e.target.files || []);
                    if (!files.length) return;
                    if (
                      files.reduce((sum, file) => sum + file.size, 0) >
                      (isRecipe ? 10 : 2) * 1024 * 1024
                    ) {
                      setSource("");
                      setError(props.t("Standard input exceeds 2 MiB"));
                      return;
                    }
                    let text;
                    try {
                      text = isMulti
                        ? JSON.stringify(
                            {
                              language: method.startsWith("vyper")
                                ? "Vyper"
                                : "Solidity",
                              sources: Object.fromEntries(
                                await Promise.all(
                                  files.map(async (file) => [
                                    file.webkitRelativePath || file.name,
                                    { content: await file.text() },
                                  ]),
                                ),
                              ),
                              settings: {},
                            },
                            null,
                            2,
                          )
                        : await files[0].text();
                    } catch {
                      if (importId === sourceImport.current)
                        setError(props.t("Unable to read source file"));
                      return;
                    }
                    if (importId !== sourceImport.current) return;
                    let selectedCompiler = "";
                    if (isRecipe) {
                      try {
                        const info = JSON.parse(text);
                        if (!info.input?.sources)
                          throw new Error("Missing compiler input");
                        text = JSON.stringify(info.input, null, 2);
                        selectedCompiler = info.solcLongVersion
                          ? `v${String(info.solcLongVersion).replace(/^v/, "")}`
                          : "";
                      } catch {
                        setError(props.t("Invalid standard input JSON"));
                        return;
                      }
                    }
                    if (new Blob([text]).size > 2 * 1024 * 1024) {
                      setSource("");
                      setError(props.t("Standard input exceeds 2 MiB"));
                      return;
                    }
                    setSource(text);
                    setCompiler(selectedCompiler);
                    setError("");
                  }}
                />
                <textarea
                  value={source}
                  onChange={(e) => {
                    sourceImport.current++;
                    setSource(e.target.value);
                    setCompiler("");
                  }}
                  required
                  disabled={busy}
                  rows={10}
                  spellCheck={false}
                  maxLength={2 * 1024 * 1024}
                />
              </label>
              {isMulti && (
                <p>
                  {props.t(
                    "File names in sources must preserve the paths used by imports. Edit the JSON above if needed.",
                  )}
                </p>
              )}
              <div className="explorer-form-grid">
                <label>
                  {props.t("Compiler version")}
                  <select
                    value={compiler || compilers[0] || ""}
                    onChange={(e) => setCompiler(e.target.value)}
                    required
                    disabled={busy}
                  >
                    {compilers.map((version) => (
                      <option key={version}>{version}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {props.t("License")}
                  <select
                    value={license}
                    onChange={(e) => setLicense(e.target.value)}
                    disabled={busy}
                  >
                    {Object.keys(config.data?.license_types || { none: 1 }).map(
                      (key) => (
                        <option key={key} value={key}>
                          {key}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>
              {field("Contract name (optional)", contractName, setContractName)}
              {!isStandard && (
                <>
                  <label>
                    {props.t("EVM version")}
                    <select
                      value={evm}
                      onChange={(e) => setEvm(e.target.value)}
                      disabled={busy}
                    >
                      {(inputLanguage === "Vyper"
                        ? config.data?.vyper_evm_versions
                        : config.data?.solidity_evm_versions
                      )?.map((version: string) => (
                        <option key={version}>{version}</option>
                      ))}
                    </select>
                  </label>
                  {inputLanguage !== "Vyper" && (
                    <>
                      <label className="explorer-check">
                        <input
                          type="checkbox"
                          checked={optimize}
                          onChange={(e) => setOptimize(e.target.checked)}
                          disabled={busy}
                        />
                        {props.t("Enable optimizer")}
                      </label>
                      {optimize && field("Optimizer runs", runs, setRuns)}
                      <label>
                        {props.t("Linked libraries (JSON name to address)")}
                        <textarea
                          value={libraries}
                          onChange={(e) => setLibraries(e.target.value)}
                          disabled={busy}
                          rows={3}
                        />
                      </label>
                    </>
                  )}
                </>
              )}
              <label className="explorer-check">
                <input
                  type="checkbox"
                  checked={autodetect}
                  onChange={(e) => setAutodetect(e.target.checked)}
                  disabled={busy}
                />
                {props.t("Detect constructor arguments automatically")}
              </label>
              {!autodetect &&
                field("Constructor arguments (hex)", args, setArgs)}
            </>
          )}
          <label className="explorer-check">
            <input
              type="checkbox"
              required
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              disabled={busy}
            />
            {props.t(
              "I authorize publishing these contract sources for verification.",
            )}
          </label>
          <button className="primary-action" type="submit" disabled={busy}>
            {props.t(
              busy ? "Verification in progress" : "Verify & publish source",
            )}
          </button>
        </form>
        {error && (
          <div role="alert" className="explorer-feedback">
            {error}
          </div>
        )}
        {job && (
          <div role="status" className="explorer-feedback">
            <strong>
              {props.t(
                job.status === "verified"
                  ? "Source verified"
                  : job.status === "failed"
                    ? "Verification failed"
                    : "Verification pending",
              )}
            </strong>
            <p>{job.message}</p>
            <button
              onClick={() => props.go(`/address/${job.address}?tab=contract`)}
            >
              {props.t("View contract source")}
            </button>
            {!busy && job.status === "pending" && (
              <button onClick={resume}>{props.t("Check result")}</button>
            )}
          </div>
        )}
      </State>
    </Page>
  );
}

function PublicTags(props: ExplorerPageProps) {
  const types = useData(props, "/public-tags/types");
  const [draft, setDraft] = useState({
    requester: "",
    email: "",
    company: "",
    website: "",
    address: new URLSearchParams(location.search).get("address") || "",
    label: "",
    type: "name",
    description: "",
    labelUrl: "",
    iconUrl: "",
    background: "",
    color: "",
    labelDescription: "",
  });
  const [extraLabels, setExtraLabels] = useState<Row[]>([]);
  const [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<Row>();
  const controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => controller.current?.abort(), []);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError("");
    setResult(undefined);
    setBusy(true);
    const c = new AbortController();
    controller.current = c;
    try {
      const value = await requestJson<Row>(`${API}/public-tags/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: c.signal,
        body: JSON.stringify({ ...draft, extra_labels: extraLabels, consent }),
      });
      if (!c.signal.aborted) setResult(value);
    } catch (e) {
      if (!c.signal.aborted)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
  };
  const field = (
    key: keyof typeof draft,
    label: string,
    required = false,
    maxLength = 250,
    type = "text",
  ) => (
    <label>
      {props.t(label)}
      <input
        value={draft[key]}
        onChange={(e) => setDraft((old) => ({ ...old, [key]: e.target.value }))}
        type={type}
        required={required}
        maxLength={maxLength}
        disabled={busy}
      />
    </label>
  );
  return (
    <Page title="Submit public tag" props={props}>
      <p>
        {props.t(
          "Proposals are reviewed by this explorer’s operators before public display. Contact details are kept in the private review queue.",
        )}
      </p>
      <State {...types} t={props.t}>
        <form className="explorer-form" onSubmit={submit}>
          <div className="explorer-form-grid">
            {field("requester", "Your name", true, 100)}
            {field("email", "Email", true, 254, "email")}
            {field("company", "Company name", false, 150)}
            {field("website", "Company website", false, 500, "url")}
          </div>
          {field("address", "Contract or account address", true, 42)}
          {field("label", "Label (35 characters maximum)", true, 35)}
          <label>
            {props.t("Tag type")}
            <select
              value={draft.type}
              onChange={(e) =>
                setDraft((old) => ({ ...old, type: e.target.value }))
              }
              disabled={busy}
            >
              {types.data?.items?.map((type: string) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <details className="explorer-tools">
            <summary>{props.t("Label appearance and link (optional)")}</summary>
            <div className="explorer-form-grid">
              {field("labelUrl", "Label URL", false, 500, "url")}
              {field("iconUrl", "Label icon URL", false, 500, "url")}
              {field("background", "Background (Hex)", false, 7)}
              {field("color", "Text (Hex)", false, 7)}
              {field(
                "labelDescription",
                "Label description (max 80 characters)",
                false,
                80,
              )}
            </div>
          </details>
          {extraLabels.map((label, index) => (
            <fieldset key={index}>
              <legend>
                {props.t("Additional label")} {index + 2}
              </legend>
              <div className="explorer-form-grid">
                {[
                  ["address", "Contract or account address", 42],
                  ["label", "Label (35 characters maximum)", 35],
                ].map(([key, title, max]) => (
                  <label key={key}>
                    {props.t(String(title))}
                    <input
                      required
                      disabled={busy}
                      value={label[String(key)]}
                      maxLength={Number(max)}
                      onChange={(e) =>
                        setExtraLabels((old) =>
                          old.map((item, i) =>
                            i === index
                              ? { ...item, [String(key)]: e.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
              </div>
              <label>
                {props.t("Tag type")}
                <select
                  value={label.type}
                  disabled={busy}
                  onChange={(e) =>
                    setExtraLabels((old) =>
                      old.map((item, i) =>
                        i === index ? { ...item, type: e.target.value } : item,
                      ),
                    )
                  }
                >
                  {types.data?.items?.map((type: string) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setExtraLabels((old) => old.filter((_, i) => i !== index))
                }
              >
                {props.t("Remove label")}
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            disabled={busy || extraLabels.length >= 19}
            onClick={() =>
              setExtraLabels((old) => [
                ...old,
                { address: "", label: "", type: "name" },
              ])
            }
          >
            {props.t("Add label")}
          </button>
          <label>
            {props.t("Explain the connection between the address and label")}
            <textarea
              value={draft.description}
              onChange={(e) =>
                setDraft((old) => ({ ...old, description: e.target.value }))
              }
              required
              maxLength={500}
              rows={4}
              disabled={busy}
            />
          </label>
          <label className="explorer-check">
            <input
              type="checkbox"
              required
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              disabled={busy}
            />
            {props.t(
              "I agree to the review of my contact details and public display of the approved address label.",
            )}
          </label>
          <button className="primary-action" type="submit" disabled={busy}>
            {props.t(busy ? "Submitting request" : "Send request")}
          </button>
        </form>
        {error && (
          <div className="explorer-feedback" role="alert">
            {error}
          </div>
        )}
        {result && (
          <div className="explorer-feedback" role="status">
            <strong>{props.t("Request received; awaiting review")}</strong>
            <p>
              {props.t("Reference")}: {result.id}
            </p>
            <button onClick={() => props.go(`/address/${draft.address}`)}>
              {props.t("View address")}
            </button>
          </div>
        )}
      </State>
    </Page>
  );
}

export default function ExplorerPages(props: ExplorerPageProps) {
  if (props.page === "stats") return <Statistics {...props} />;
  if (props.page === "accounts") return <Accounts {...props} />;
  if (props.page === "batches")
    return props.id ? <Batch {...props} /> : <Batches {...props} />;
  if (props.page === "dispute-games") return <Games {...props} />;
  if (props.page === "gas-tracker") return <Gas {...props} />;
  if (props.page === "op") return <Operation {...props} />;
  if (props.page === "name-services")
    return props.id ? <Domain {...props} /> : <Names {...props} />;
  if (props.page === "apps") return <Apps {...props} />;
  if (props.page === "contract-verification")
    return <Verification {...props} />;
  if (props.page === "public-tags" && props.id === "submit")
    return <PublicTags {...props} />;
  return (
    <Page title="Explorer tools" props={props}>
      <ExplorerDirectory {...props} />
    </Page>
  );
}
