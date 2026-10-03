import {
  FormEvent,
  ReactNode,
  useEffect,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import {
  Activity,
  ArrowDownUp,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Blocks,
  Box,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Code2,
  Copy,
  Database,
  ExternalLink,
  FileCode2,
  Fuel,
  Gauge,
  Hash,
  Menu,
  Network,
  Search,
  SlidersHorizontal,
  ShieldCheck,
  Timer,
  TrendingUp,
  WalletCards,
  X,
  Zap,
  Layers3,
  TerminalSquare,
  Download,
  RefreshCw,
  Table2,
  Droplets,
  Languages,
  Image as ImageIcon,
} from "lucide-react";
import { formatMessage, isLocale, localeNames, locales, message, type Locale } from "./i18n";
import { EntityMark } from "./EntityMark";
import { mediaUrl } from "./media";
import { blockFinality, cursorQuery, executionFee, transactionState, stateChangeText, formatWei } from "./explorer-data";
import { API, apiOrigin, basePath, network, networkPath, isTestnet, liveWebSocketUrl, externalDestination } from "./network";
import { requestJson } from "./api-request";
import "./explorer-pages.css";
const ContractInteraction = lazy(() => import("./ContractInteraction"));
const FilteredActivity = lazy(() => import("./FilteredActivity"));
const ExplorerPages = lazy(() => import("./ExplorerPages"));
const ExplorerDirectory = lazy(() => import("./ExplorerPages").then(module => ({ default: module.ExplorerDirectory })));
const AddressHistory = lazy(() => import("./ExplorerPages").then(module => ({ default: module.AddressHistory })));
const UserOperationsList = lazy(() => import("./ExplorerPages").then(module => ({ default: module.UserOperationsList })));
const AssetFlows = lazy(() => import("./ExplorerPages").then(module => ({ default: module.AssetFlows })));
import { activityKeys, downloadCsv, activityState } from "./activity-data";
import type { ExplorerPageProps } from "./ExplorerPages";

type AnyRow = Record<string, any>;
type View = { name: string; id?: string; tokenId?: string; query?: string };
type LiveData = {
  connected: boolean;
  sequence: number;
  sentAt?: string;
  network?: AnyRow;
  block?: AnyRow;
  transactions?: AnyRow[];
  event?: string;
};

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const TX = /^0x[a-fA-F0-9]{64}$/;
let activeLocale: Locale = "en";
const t = (key: string) => message(activeLocale, key);
const tf = (key: string, values: Record<string, string | number>) => formatMessage(activeLocale, key, values);
function activityLabel(type: string) {
  const keys: Record<string, string> = {
    "token-transfers": "transfers", "token transfer": "token transfer",
    "internal-transactions": "internal", internal: "internal", logs: "logs",
    state: "stateChanges", trace: "rawTrace", nft: "nfts", tokens: "assets",
    transactions: "transactions", "NFT transfer": "NFT transfer",
    contract_interaction: "contractCall", contract_creation: "contractCreation", coin_transfer: "nativeTransfer",
  };
  return t(keys[type] || type.replaceAll("-", " "));
}

// Chain values arrive as strings to preserve integer precision. Formatting is
// centralized so every surface follows the selected locale consistently.
function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
function finiteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function num(value: unknown, digits = 0) {
  const n = finiteNumber(value);
  return n !== null
    ? new Intl.NumberFormat(activeLocale, {
        maximumFractionDigits: digits,
      }).format(n)
    : "—";
}
function compact(value: unknown) {
  const n = finiteNumber(value);
  return n !== null
    ? new Intl.NumberFormat(activeLocale, {
        notation: "compact",
        maximumFractionDigits: 2,
      }).format(n)
    : "—";
}
function money(value: unknown) {
  const n = finiteNumber(value);
  return n !== null
    ? new Intl.NumberFormat(activeLocale, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: n < 1 ? 4 : 0,
      }).format(n)
    : "—";
}
function eth(wei: unknown, digits = 5) {
  if (wei === null || wei === undefined || wei === "") return "—";
  try {
    return `${(Number(BigInt(String(wei))) / 1e18).toLocaleString(activeLocale, { maximumFractionDigits: digits })} ETH`;
  } catch {
    return "—";
  }
}
function exactEth(value: unknown) {
  const formatted=formatWei(value,activeLocale);
  return formatted === "—" ? formatted : `${formatted} ETH`;
}
function gasPrice(value: any) {
  if (value?.wei != null) {
    try {
      const amount = formatWei(BigInt(value.wei) * 1000000000n, activeLocale);
      return amount === "—" ? amount : `${amount} Gwei`;
    } catch { return "—"; }
  }
  return unit(value?.price ?? value, " Gwei");
}
function unit(value: unknown, suffix: string, digits = 2) {
  const formatted = num(value, digits);
  return formatted === "—" ? formatted : `${formatted}${suffix}`;
}
function scaled(value: unknown, decimals: unknown) {
  const amount = finiteNumber(value);
  const precision = finiteNumber(decimals);
  return amount === null ? undefined : amount / 10 ** (precision ?? 0);
}
function age(date: string, style: "narrow" | "short" = "narrow") {
  if (!date || !Number.isFinite(new Date(date).getTime())) return "—";
  const s = Math.max(
    0,
    Math.floor((Date.now() - new Date(date).getTime()) / 1000),
  );
  const unit =
    s < 60 ? "second" : s < 3600 ? "minute" : s < 86400 ? "hour" : "day";
  const value =
    unit === "second"
      ? s
      : unit === "minute"
        ? Math.floor(s / 60)
        : unit === "hour"
          ? Math.floor(s / 3600)
          : Math.floor(s / 86400);
  return new Intl.RelativeTimeFormat(activeLocale, {
    numeric: "always",
    style,
  }).format(-value, unit);
}
function short(value?: string, left = 7, right = 5) {
  if (!value) return "—";
  return value.length <= left + right + 2
    ? value
    : `${value.slice(0, left)}…${value.slice(-right)}`;
}
function bytes(value: unknown) {
  const n = finiteNumber(value);
  if (n === null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0,
    v = n;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return `${v.toFixed(i > 2 ? 1 : 0)} ${units[i]}`;
}
function addressOf(value: any) {
  return typeof value === "string" ? value : value?.hash || "";
}
function labelOf(value: any) {
  return typeof value === "object"
    ? value?.name || value?.ens_domain_name
    : null;
}
async function get<T = any>(path: string, signal?: AbortSignal): Promise<T> {
  try {
    const body = await requestJson<T>(`${API}${path}`, { signal });
    if (body == null && !path.endsWith("/check")) throw new Error("invalidApiResponse");
    return body;
  } catch (error) {
    if (signal?.aborted) throw error;
    const key = error instanceof Error ? error.message : "Data source unavailable";
    if (apiOrigin && ["apiConnectionFailed", "requestTimeout"].includes(key))
      throw new Error(t("Private API unavailable. Connect to Tailscale, allow local network access in your browser, and retry."));
    throw new Error(t(key));
  }
}

function useLiveStream(): LiveData {
  const [live, setLive] = useState<LiveData>({ connected: false, sequence: 0 });
  useEffect(() => {
    let stopped = false,
      socket: WebSocket | undefined,
      retry = 0,
      timer: number | undefined;
    const connect = () => {
      if (stopped) return;
      socket = new WebSocket(liveWebSocketUrl);
      socket.onopen = () => {
        retry = 0;
        setLive((v) => ({ ...v, connected: true }));
      };
      socket.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (["welcome", "network", "block"].includes(msg.type))
            setLive({
              connected: true,
              sequence: msg.sequence || 0,
              sentAt: msg.sentAt,
              network: msg.network,
              block: msg.block,
              transactions: msg.transactions || [],
              event: msg.type,
            });
        } catch {
          /* ignore malformed frames */
        }
      };
      socket.onclose = () => {
        setLive((v) => ({ ...v, connected: false }));
        if (!stopped)
          timer = window.setTimeout(
            connect,
            Math.min(1000 * 2 ** retry++, 10000),
          );
      };
      socket.onerror = () => socket?.close();
    };
    connect();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      socket?.close();
    };
  }, []);
  return live;
}

// The app uses the History API rather than a routing dependency. The server
// serves the same shell with route-specific crawl metadata for every route.
function route(): View {
  try {
  const p = location.pathname.slice(basePath.length).split("/").filter(Boolean);
  if (!p.length) return { name: "home" };
  if (p[0] === "search")
    return {
      name: "search",
      query: new URLSearchParams(location.search).get("q") || "",
    };
  if (p[0] === "token" && p[2] === "instance" && p[1] && p[3])
    return {
      name: "nft",
      id: decodeURIComponent(p[1]),
      tokenId: decodeURIComponent(p.slice(3).join("/")),
    };
  if (p[0] === "pools" && p[1])
    return { name: "pool", id: decodeURIComponent(p[1]) };
  const names: Record<string, string> = {
    tx: "transaction",
    txs: "transactions",
    "verified-contracts": "contracts",
  };
  return {
    name: names[p[0]] || p[0],
    id: p[1] ? decodeURIComponent(p.slice(1).join("/")) : undefined,
  };
  } catch {
    return { name: "not-found" };
  }
}
function localizedPath(path: string) {
  const url = new URL(path, location.origin);
  if (basePath && !url.pathname.startsWith(`${basePath}/`)) url.pathname = networkPath(url.pathname);
  if (activeLocale !== "en") url.searchParams.set("lang", activeLocale);
  else url.searchParams.delete("lang");
  return `${url.pathname}${url.search}${url.hash}`;
}
function go(path: string) {
  history.pushState({}, "", localizedPath(path));
  dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
}

function sectionChoice(fallback: string, allowed: string[], aliases: Record<string,string> = {}) {
  const value = new URLSearchParams(location.search).get("tab") || fallback;
  const selected = aliases[value] || value;
  return allowed.includes(selected) ? selected : fallback;
}
function addressSection() {
  return sectionChoice("transactions", ["overview", "transactions", "history", "userops", "tokens", "nft", "token-transfers", "internal-transactions", "logs", "contract", "read", "write"], {details:"overview",txs:"transactions",account_history:"history",coin_balance_history:"history",user_ops:"userops",token_transfers:"token-transfers",internal_txns:"internal-transactions"});
}
function explorerProps(page: string, id?: string): ExplorerPageProps {
  return { page, id, t, go, get,
    identity: (value, link, label) => <Copyable value={value} link={link} display={label || value} />,
    transaction: item => <TxRow tx={item} />, block: item => <BlockRow block={item} />,
    activity: (item,type) => <GenericActivity item={item} type={type} />,
    chart: (metric, title, unit) => {
      const ratio = metric === "txnsSuccessRate" || metric === "networkUtilization";
      const suffix = ratio ? "%" : unit || "";
      return <StatChart metric={metric} title={title} note={suffix} refresh={0} enableData formatValue={value => `${num(ratio ? value * 100 : value, 9)}${suffix ? ` ${suffix}` : ""}`} />;
    },
    historyChart: items => <Sparkline points={items.map(item => scaled(item.value, 18) || 0)} labels={items.map(item => item.date)} height={160} ariaLabel={t("Historical ETH balance")} formatValue={value => `${num(value, 9)} ETH`} />,
  };
}

function Brand() {
  return (
    <button
      className="brand"
      onClick={() => go("/")}
      aria-label={t("explorerHome")}
    >
      <img src="/brand/ink-wordmark.svg" width="100" height="33" alt="" aria-hidden="true" />
      <span>EXPLORER</span>
    </button>
  );
}

function Header({
  current,
  live,
  locale,
  onLocale,
}: {
  current: string;
  live: LiveData;
  locale: Locale;
  onLocale: (locale: Locale) => void;
}) {
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const links = [
    ["/blocks", "blocks", "blocks"],
    ["/txs", "transactions", "transactions"],
    ["/tokens", "tokens", "tokens"],
    ["/pools", "pools", "pools"],
    ["/contracts", "contracts", "contracts"],
    ["/analytics", "analytics", "analytics"],
    ["/advanced", "advanced", "advanced"],
    ["/network", "network", "network"],
  ];
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.key === "/" &&
        !document.querySelector(".global-search input") &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          document.activeElement?.tagName || "",
        )
      ) {
        event.preventDefault();
        go("/search");
        setTimeout(() => dispatchEvent(new Event("focus-global-search")), 50);
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!open) return;
    const closeAndRestoreFocus = () => {
      setOpen(false);
      requestAnimationFrame(() => menuRef.current?.focus());
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAndRestoreFocus();
    };
    const pointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !headerRef.current?.contains(event.target)
      )
        setOpen(false);
    };
    const resize = () => {
      if (innerWidth > 1160) setOpen(false);
    };
    const focus = (event: FocusEvent) => {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target))
        setOpen(false);
    };
    addEventListener("keydown", key);
    addEventListener("pointerdown", pointer);
    addEventListener("resize", resize);
    document.addEventListener("focusin", focus);
    return () => {
      removeEventListener("keydown", key);
      removeEventListener("pointerdown", pointer);
      removeEventListener("resize", resize);
      document.removeEventListener("focusin", focus);
    };
  }, [open]);
  return (
    <>
      <div className="network-ribbon" role="region" aria-label={t("networkStatus")}>
        <div>
          <label className="network-picker">
            <span className="sr-only">{t("network")}</span>
            <select aria-label={t("network")} value={isTestnet ? "sepolia" : "mainnet"}
              onChange={event => { location.href = `${event.target.value === "sepolia" ? "/testnet" : ""}/${activeLocale === "en" ? "" : `?lang=${activeLocale}`}`; }}>
              <option value="mainnet">Ink Mainnet</option>
              <option value="sepolia">Ink Sepolia · {t("testnetLabel")}</option>
            </select>
          </label>
          <span>CHAIN ID {network.chainId}</span>
          <span className={live.connected ? "ribbon-live" : "ribbon-offline"}>
            <i /> {live.connected ? t("websocketLive") : t("reconnecting")}
          </span>
        </div>
        <div>
          {live.block?.height
            ? `${t("chainHead")} #${num(live.block.height)}`
            : t("waitingChainHead")}
        </div>
      </div>
      <header ref={headerRef}>
        <Brand />
        <nav
          id="primary-navigation"
          className={open ? "open" : ""}
          aria-label={t("primaryNavigation")}
        >
          {links.map(([href, label, key]) => (
            <button
              key={href}
              className={
                current === key ||
                (key === "pools" && current === "pool") ||
                (key === "tokens" && current === "nft")
                  ? "active"
                  : ""
              }
              onClick={() => {
                go(href);
                setOpen(false);
              }}
            >
              {t(label)}
            </button>
          ))}
        </nav>
        <label className="language-picker">
          <Languages aria-hidden="true" />
          <span className="sr-only">{t("language")}</span>
          <select
            aria-label={t("language")}
            value={locale}
            onChange={(event) => onLocale(event.target.value as Locale)}
          >
            {locales.map((code) => (
              <option key={code} value={code}>
                {localeNames[code]}
              </option>
            ))}
          </select>
        </label>
        <button
          className="header-search"
          aria-label={t("search")}
          onClick={() => {
            setOpen(false);
            if (!document.querySelector(".global-search input")) {
              go("/search");
              setTimeout(
                () => dispatchEvent(new Event("focus-global-search")),
                50,
              );
            } else dispatchEvent(new Event("focus-global-search"));
          }}
        >
          <Search size={15} />
          <span>{t("search")}</span>
          <kbd>/</kbd>
        </button>
        <button
          ref={menuRef}
          className="menu"
          aria-label={t("menu")}
          aria-controls="primary-navigation"
          aria-expanded={open}
          onClick={(event) => {
            setOpen(!open);
            if (!open && event.detail === 0)
              requestAnimationFrame(() => headerRef.current?.querySelector<HTMLButtonElement>("nav button")?.focus());
          }}
        >
          {open ? <X /> : <Menu />}
        </button>
      </header>
    </>
  );
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    /* HTTP LAN origins may not expose Clipboard. */
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

function Copyable({
  value,
  display,
  link,
}: {
  value: string;
  display?: string;
  link?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <span className="copyable">
      {link ? (
        <button className="text-link mono" title={value} onClick={() => go(link)}>
          {display || short(value)}
        </button>
      ) : (
        <span className="mono">{display || short(value)}</span>
      )}
      <button
        className={cx("copy-button", done && "copied")}
        aria-label={done ? t("copied") : t("copy")}
        title={done ? t("copied") : t("copy")}
        onClick={async () => {
          await copyText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1000);
        }}
      >
        {done ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </span>
  );
}

function SearchBox({ compact = false }: { compact?: boolean }) {
  const [q, setQ] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const f = () => ref.current?.focus();
    addEventListener("focus-global-search", f);
    const key = (e: KeyboardEvent) => {
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName || "")) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    addEventListener("keydown", key);
    return () => {
      removeEventListener("focus-global-search", f);
      removeEventListener("keydown", key);
    };
  }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = q.trim();
    if (!value) return;
    if (ADDRESS.test(value)) return go(`/address/${value}`);
    if (TX.test(value)) return go(`/tx/${value}`);
    if (/^\d+$/.test(value)) return go(`/block/${value}`);
    go(`/search?q=${encodeURIComponent(value)}`);
  };
  return (
    <form
      className={cx("global-search", compact && "compact")}
      onSubmit={submit}
    >
      <Search size={compact ? 17 : 20} />
      <input
        ref={ref}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("searchPlaceholder")}
        aria-label={t("search")}
      />
      <button
        className="search-submit"
        type="submit"
        aria-label={t("search")}
        title={t("search")}
      >
        <span>{t("search")}</span>
        <ArrowRight aria-hidden="true" size={16} strokeWidth={2.5} />
      </button>
    </form>
  );
}

// Shared states and data primitives keep loading, failure and empty behaviour
// identical across ledgers and entity pages.
function Loading({ label }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <i />
      <span>{label || t("readingChain")}</span>
    </div>
  );
}
function ErrorState({ error, onRetry = () => location.reload() }: { error: string; onRetry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <CircleDot />
      <div>
        <strong>{t("unavailable")}</strong>
        <p>{error}</p>
        <button onClick={onRetry}>
          <RefreshCw aria-hidden="true" /> {t("retry")}
        </button>
      </div>
    </div>
  );
}
function Empty({ children }: { children?: ReactNode }) {
  return <div className="empty">{children || t("noRecords")}</div>;
}

// A native section picker exposes every destination on narrow screens, without
// requiring users to discover a horizontally scrolled row of hidden tabs.
function SectionTabs({ value, items, onChange }: {
  value: string;
  items: [string, string][];
  onChange: (value: string) => void;
}) {
  const choose = (next: string) => {
    const url = new URL(location.href); url.searchParams.set("tab", next);
    history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`); onChange(next);
  };
  return <div className="section-navigation">
    <label className="section-picker">
      <span>{t("pageSection")}</span>
      <select value={value} onChange={event => choose(event.target.value)}>
        {items.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </label>
    <div className="tabs" role="group" aria-label={t("pageSection")}>
      {items.map(([key, label]) => <button key={key} className={value === key ? "active" : ""}
        aria-pressed={value === key} onClick={() => choose(key)}>{label}</button>)}
    </div>
  </div>;
}

function Metric({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="metric">
      <div className="metric-top">
        <span>{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}

function dateText(value?: string) {
  if (!value) return t("Observation");
  const d = new Date(`${value.length === 10 ? `${value}T00:00:00` : value}`);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString(activeLocale, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}
const chartRanges = [[7, "7D"], [30, "30D"], [90, "90D"], [180, "6M"], [365, "1Y"]] as const;
function ChartRange({ title, value, onChange, options = chartRanges }: {
  title: string;
  value: number;
  onChange: (value: number) => void;
  options?: readonly (readonly [number, string])[];
}) {
  return <label className="chart-range">
    <span className="sr-only">{title} · {t("chartTimeframe")}</span>
    <select value={value} onChange={event => onChange(Number(event.target.value))}>
      {options.map(([days, label]) => <option key={days} value={days}>{label}</option>)}
    </select>
    <ChevronDown size={14} aria-hidden="true" />
  </label>;
}
function chartQuery(days: number) {
  if (days === 0) return "?resolution=WEEK";
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  return `?from=${from}&to=${to}&resolution=${days >= 365 ? "WEEK" : "DAY"}`;
}

function Sparkline({
  points,
  labels = [],
  color = "#6f32ff",
  height = 90,
  formatValue = compact,
  ariaLabel =t("Trend chart"),
  approximateLast = false,
}: {
  points: number[];
  labels?: string[];
  color?: string;
  height?: number;
  formatValue?: (value: number) => string;
  ariaLabel?: string;
  approximateLast?: boolean;
}) {
  const [plotSize, setPlotSize] = useState({ width: 600, height });
  const { width, height: plotHeight } = plotSize;
  const clean = points
    .map(Number)
    .map((value) => (Number.isFinite(value) ? value : 0));
  const [local, setLocal] = useState<number | null>(null);
  const owner = useId();
  const chartRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipLeft, setTooltipLeft] = useState(0);
  const seriesKey = `${labels[0]}|${labels.at(-1)}|${labels.length}`;
  useEffect(() => setLocal(null), [seriesKey]);
  useEffect(() => {
    const element = chartRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setPlotSize({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [clean.length < 2]);
  useEffect(() => {
    const inspect = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== owner) setLocal(null);
    };
    document.addEventListener("ink:chart-inspect", inspect);
    return () => document.removeEventListener("ink:chart-inspect", inspect);
  }, [owner]);
  useEffect(() => {
    if (local === null) return;
    const dismiss = () => setLocal(null);
    const outside = (event: PointerEvent) => {
      if (!chartRef.current?.contains(event.target as Node)) dismiss();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") dismiss(); };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [local]);
  useLayoutEffect(() => {
    if (local === null || !chartRef.current || !tooltipRef.current) return;
    const plotWidth = chartRef.current.clientWidth;
    const tipWidth = tooltipRef.current.offsetWidth;
    const anchor = (local / Math.max(1, clean.length - 1)) * plotWidth;
    setTooltipLeft(Math.max(0, Math.min(plotWidth - tipWidth, anchor - tipWidth / 2)));
  }, [local, seriesKey, clean.length, formatValue, width]);
  const select = (index: number) => {
    document.dispatchEvent(new CustomEvent("ink:chart-inspect", { detail: owner }));
    setLocal(index);
  };
  if (clean.length < 2)
    return (
      <div className="chart-empty" role="status" style={{ minHeight: height }}>{t("Not enough data")}
      </div>
    );
  const min = Math.min(...clean),
    max = Math.max(...clean),
    range = max - min || 1;
  const x = (i: number) => (i / (clean.length - 1)) * width;
  const y = (p: number) => plotHeight - 10 - ((p - min) / range) * (plotHeight - 22);
  const d = clean.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p)}`).join(" ");
  const active = local !== null && local < clean.length ? local : null;
  const pick = (clientX: number, target: Element) => {
    const rect = target.getBoundingClientRect();
    const index = Math.max(
      0,
      Math.min(
        clean.length - 1,
        Math.round(((clientX - rect.left) / rect.width) * (clean.length - 1)),
      ),
    );
    select(index);
  };
  const key = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let index = active ?? clean.length - 1;
    if (e.key === "ArrowLeft") index = Math.max(0, index - 1);
    else if (e.key === "ArrowRight")
      index = Math.min(clean.length - 1, index + 1);
    else if (e.key === "Home") index = 0;
    else if (e.key === "End") index = clean.length - 1;
    else if (e.key === "Escape") {
      setLocal(null);
      return;
    } else return;
    e.preventDefault();
    select(index);
  };
  return (
    <div
      ref={chartRef}
      className="interactive-chart"
      data-points={clean.length}
      style={{ height: `clamp(${height}px, 10vw, ${height * 1.25}px)` }}
      tabIndex={0}
      role="group"
      aria-label={tf("{label}. Tap or drag to inspect values; use arrow keys when focused.", { label: ariaLabel })}
      onKeyDown={key}
      onBlur={() => setLocal(null)}
      onPointerCancel={() => setLocal(null)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        pick(e.clientX, e.currentTarget);
      }}
      onPointerMove={(e) => {
        if (
          e.pointerType === "mouse" ||
          e.currentTarget.hasPointerCapture(e.pointerId)
        )
          pick(e.clientX, e.currentTarget);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") {
          setLocal(null);
        }
      }}
    >
      <svg
        className="sparkline"
        viewBox={`0 0 ${width} ${plotHeight}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          className="gridline"
          d={`M0 ${plotHeight * 0.33}H${width}M0 ${plotHeight * 0.66}H${width}`}
        />
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
        />
        {approximateLast && (
          <circle
            className="chart-provisional"
            cx={x(clean.length - 1)}
            cy={y(clean.at(-1) || 0)}
            r="4"
            stroke={color}
          />
        )}{" "}
        {active != null && (
          <>
            <line
              className="chart-crosshair"
              x1={x(active)}
              x2={x(active)}
              y1="0"
              y2={plotHeight}
            />
            <circle
              className="chart-point"
              cx={x(active)}
              cy={y(clean[active])}
              r="5"
              fill={color}
            />
          </>
        )}
      </svg>
      {active != null && (
        <div
          ref={tooltipRef}
          className="chart-tooltip"
          style={{ left: tooltipLeft }}
          role="tooltip"
          aria-live="polite"
        >
          <span>{dateText(labels[active])}{labels[active]?.length > 10 && ` · ${new Date(labels[active]).toLocaleTimeString(activeLocale, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`} · {age(labels[active])}</span>
          <strong>{approximateLast && active === clean.length - 1 ? "≈ " : ""}{formatValue(clean[active])}</strong>
        </div>
      )}
    </div>
  );
}

function StatusPill({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span className={cx("status", ok ? "ok" : "bad")}>
      <i />
      {children}
    </span>
  );
}

function Method({ tx }: { tx: AnyRow }) {
  const type = tx.method || tx.transaction_types?.[0] || "transfer";
  return <span className="method" title={String(type).replaceAll("_", " ")}>{String(type).replaceAll("_", " ")}</span>;
}

function TxRow({ tx }: { tx: AnyRow }) {
  const from = addressOf(tx.from),
    to = addressOf(tx.to || tx.created_contract);
  const state = transactionState(tx);
  return (
    <div className={cx("tx-row", tx._live && "live-arrival")}>
      <div className="tx-primary">
        <StatusPill
          ok={state === "success" || state === "confirmed"}
        >
          {t(state === "pending" ? "Pending" : state)}
        </StatusPill>
        <div>
          <Copyable value={tx.hash} link={`/tx/${tx.hash}`} />
          <small>
            {age(tx.timestamp)} {tx.block_number != null && <>· {t("block")}{" "}
            <button onClick={() => go(`/block/${tx.block_number}`)}>
              {num(tx.block_number)}
            </button></>}
          </small>
        </div>
      </div>
      <Method tx={tx} />
      <div className="flow">
        <span className="flow-party">
          <EntityMark address={from} label={labelOf(tx.from)} />
          <Copyable value={from} link={`/address/${from}`} />
        </span>
        <ArrowRight size={14} />
        <span className="flow-party">
          <EntityMark address={to} label={labelOf(tx.to)} />
          <Copyable
            value={to}
            display={labelOf(tx.to) || short(to)}
            link={to ? `/address/${to}` : undefined}
          />
        </span>
      </div>
      <div className="tx-value">
        <strong>{eth(tx.value)}</strong>
        <small>
          {tx.fee?.value != null
            ? `${t("fee")} ${eth(tx.fee.value, 7)}`
            : tx._live
              ? t("feeIndexing")
              : `${t("fee")} —`}
        </small>
      </div>
    </div>
  );
}

function LedgerColumns({ blocks = false }: { blocks?: boolean }) {
  return (
    <div className={cx("ledger-columns", blocks ? "block-columns" : "tx-columns")} aria-hidden="true">
      {blocks ? <><span>{t("block")}</span><span>{t("transactions")}</span><span>{t("gasUsed")}</span><span>{t("size")}</span><span>{t("fees")}</span></>
        : <><span>{t("transactionHash")}</span><span>{t("method")}</span><span>{t("from")} / {t("to")}</span><span>{t("value")} / {t("fee")}</span></>}
    </div>
  );
}

function BlockRow({ block }: { block: AnyRow }) {
  return (
    <div className="block-row">
      <div className="block-height">
        <Box size={17} />
        <div>
          <button onClick={() => go(`/block/${block.height}`)}>
            {num(block.height)}
          </button>
          <small>{age(block.timestamp)}</small>
        </div>
      </div>
      <div>
        <small>{t("transactions")}</small>
        <strong>{num(block.transactions_count)}</strong>
      </div>
      <div>
        <small>{t("gasUsed")}</small>
        <strong>{unit(block.gas_used_percentage, "%")}</strong>
      </div>
      <div>
        <small>{t("size")}</small>
        <strong>{bytes(block.size)}</strong>
      </div>
      <div className="block-fee">
        <small>{t("fees")}</small>
        <strong>{eth(block.transaction_fees, 7)}</strong>
      </div>
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        {eyebrow && <span>{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

function Home({ live }: { live: LiveData }) {
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const load = () =>
      get("/overview")
        .then((d) => live && (setData(d), setError("")))
        .catch((e) => live && setError(e.message));
    load();
    const timer = setInterval(load, 10000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!live.network) return;
    setData((current: any) => {
      if (!current) return current;
      const blocks =
        live.block && current.blocks?.[0]?.height !== live.block.height
          ? [live.block, ...current.blocks].slice(0, 8)
          : current.blocks;
      return { ...current, network: live.network, blocks };
    });
  }, [live.sequence]);
  const nodeStatus = live.network || data?.network;
  return (
    <>
      <section className="home-intro">
        <div className="home-title">
          <span className="kicker">{network.name.toUpperCase()}{isTestnet ? ` · ${t("testnetLabel")}` : ""}</span>
          <h1>
            {network.name} <small>{t("liveIndex")}</small>
          </h1>
          <p>{t("homeDescription")}</p>
        </div>
        <div className="head-console">
          <div>
            <span>{t(nodeStatus?.synced ? "latestNodeBlock" : nodeStatus?.stale ? "nodeBehind" : nodeStatus?.online ? "nodeSyncing" : "nodeWaiting")}</span>
            <strong>#{num(live.block?.height ?? nodeStatus?.head)}</strong>
          </div>
          <dl>
            <div>
              <dt>{t("safe")}</dt>
              <dd>#{num(nodeStatus?.safeBlock)}</dd>
            </div>
            <div>
              <dt>{t("finalized")}</dt>
              <dd>#{num(nodeStatus?.finalizedBlock)}</dd>
            </div>
            <div>
              <dt>WebSocket</dt>
              <dd className={live.connected ? "positive" : "negative"}>
                {live.connected ? t("live") : t("retryShort")}
              </dd>
            </div>
          </dl>
        </div>
      </section>
      <section className="home-command">
        <SearchBox />
      </section>
      {data ? <HomeData data={data} /> : error ? <ErrorState error={error} /> : <Loading />}
    </>
  );
}

// The title and search stay usable while the independent data sources load.
function HomeData({ data }: { data: any }) {
  const [period, setPeriod] = useState(30);
  const s = data.stats,
    history = [...data.chart].sort((a, b) => String(a.date).localeCompare(String(b.date))),
    chart = history.slice(-period);
  const last7 = history.slice(-7).reduce((a: number, v: any) => a + Number(v.transactions_count), 0);
  const prev7 = history.slice(-14, -7).reduce((a: number, v: any) => a + Number(v.transactions_count), 0);
  const delta = prev7 ? ((last7 - prev7) / prev7) * 100 : 0;
  return (
    <>
      <div className="home-overview">
        <section className="metric-grid">
          <Metric
            label={t("latestBlock")}
            value={num(data.network.head || s.total_blocks)}
            note={tf("blocksToFinality", { count: num(data.network.finalityLag) })}
            icon={<Blocks />}
          />
          <Metric
            label={t("transactions")}
            value={compact(s.total_transactions)}
            note={tf("inLastDay", { count: compact(s.transactions_today) })}
            icon={<Zap />}
          />
          <Metric
            label={t("uniqueAddresses")}
            value={compact(s.total_addresses)}
            note={t("indexedAccounts")}
            icon={<WalletCards />}
          />
          <Metric
            label={t("networkLoad")}
            value={unit(s.network_utilization_percentage, "%")}
            note={t("gasCapacity")}
            icon={<Gauge />}
          />
          <Metric
            label={t("medianGas")}
            value={gasPrice(s.gas_prices?.average)}
            note={data.network.synced ? tf("weiReference", { count: num(data.network.gasPriceWei) }) : t("publicIndexSyncing")}
            icon={<Fuel />}
          />
        </section>
        <section className="signal-grid">
          <div className="signal-main">
            <SectionTitle
              eyebrow={tf("{count} DAY RANGE", { count: num(period) })}
              title={t("dailyTransactions")}
              action={
                <div className="chart-heading-actions">
                  <ChartRange title={t("dailyTransactions")} value={period} onChange={setPeriod} options={chartRanges.slice(0, 2)} />
                  <button className="arrow-link" aria-label={t("viewAnalytics")} onClick={() => go("/analytics")}>
                    <ArrowUpRight />
                  </button>
                </div>
              }
            />
            <div className="chart-head">
              <div>
                <strong>{compact(chart.at(-1)?.transactions_count)}</strong>
                <span>{t("transactionsPerDay")}</span>
              </div>
              <div className={delta >= 0 ? "positive" : "negative"}>
                {delta >= 0 ? "+" : ""}
                {delta.toFixed(1)}% <small>{t("previous7Days")}</small>
              </div>
            </div>
            <Sparkline
              points={chart.map((d: any) => Number(d.transactions_count))}
              labels={chart.map((d: any) => d.date)}
              height={160}
              ariaLabel={t("dailyTransactionsChart")}
            />
            <div className="chart-axis">
              <span>{chart[0]?.date}</span>
              <span>{chart.at(-1)?.date}</span>
            </div>
          </div>
        </section>
      </div>
      <section className="live-section">
        <SectionTitle
          eyebrow={t("live")}
          title={t("latestBlocksTransactions")}
          action={
            <span className="live-refresh">
              <i /> {t("refreshEvery10s")}
            </span>
          }
        />
        <div className="live-columns">
          <div className="panel">
            <div className="panel-head">
              <h3>{t("blocks")}</h3>
              <button onClick={() => go("/blocks")}>{t("viewAll")}</button>
            </div>
            {data.blocks.slice(0, 6).map((b: any) => (
              <BlockRow key={b.hash} block={b} />
            ))}
          </div>
          <div className="panel">
            <div className="panel-head">
              <h3>{t("transactions")}</h3>
              <button onClick={() => go("/txs")}>{t("viewAll")}</button>
            </div>
            {data.transactions.slice(0, 6).map((t: any) => (
              <TxRow key={t.hash} tx={t} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

// Cursor values are opaque Blockscout parameters. They are copied into the
// next request without interpreting or reordering them.
function Pagination({
  next,
  onNext,
  onReset,
}: {
  next?: AnyRow | null;
  onNext: () => void;
  onReset: () => void;
}) {
  return (
    <div className="pagination">
      <button onClick={onReset}>
        <ChevronLeft /> {t("newest")}
      </button>
      <button disabled={!next} onClick={onNext}>
        {t("older")} <ChevronRight />
      </button>
    </div>
  );
}

function PageIntro({
  eyebrow,
  title,
  text,
  children,
}: {
  eyebrow: string;
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <section className="page-intro">
      <div>
        <span>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      {children}
    </section>
  );
}

function SearchResults({ query }: { query: string }) {
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  const dataRequest = useRef(0);
  useEffect(() => {
    const request = ++dataRequest.current;
    setData(undefined);
    setError("");
    if (!query) {
      setData({ items: [] });
      return;
    }
    get(`/search?q=${encodeURIComponent(query)}`)
      .then((value) => request === dataRequest.current && setData(value))
      .catch(
        (e) => request === dataRequest.current && setError(e.message),
      );
  }, [query]);
  const destination = (item: any) =>
    item.type === "token" && item.address_hash
      ? `/token/${item.address_hash}`
      : item.type === "block"
        ? item.block_number
          ? `/block/${item.block_number}`
          : item.block_hash
            ? `/block/${item.block_hash}`
            : ""
        : item.type === "transaction" || item.transaction_hash
          ? `/tx/${item.transaction_hash || item.hash}`
          : item.address_hash
            ? `/address/${item.address_hash}`
            : "";
  return (
    <>
      <PageIntro
        eyebrow={t("search").toUpperCase()}
        title={query ? tf("resultsFor", { query }) : t("search")}
        text={t("searchDescription")}
      >
        <SearchBox compact />
      </PageIntro>
      <div className="table-shell search-results">
        {!data && !error ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} />
        ) : data.items?.length ? (
          data.items.map((item: any, index: number) => {
            const href = destination(item);
            return (
              <button
                key={`${item.type}-${item.address_hash || item.transaction_hash || item.block_hash || index}`}
                disabled={!href}
                onClick={() => href && go(href)}
              >
                <span className="method">
                  {item.token_type || item.type || "result"}
                </span>
                <div>
                  <strong>
                    {item.name ||
                      item.symbol ||
                      item.address?.name ||
                      item.type ||
                      t("searchResult")}
                  </strong>
                  <small className="mono">
                    {item.address_hash ||
                      item.transaction_hash ||
                      item.block_hash ||
                      item.block_number ||
                      "—"}
                  </small>
                </div>
                <ArrowRight />
              </button>
            );
          })
        ) : (
          <Empty>{t("noSearchResults")}</Empty>
        )}
      </div>
    </>
  );
}

function LedgerList({
  type,
  live,
  initialMode = "all",
}: {
  type: "blocks" | "transactions";
  live?: LiveData;
  initialMode?: string;
}) {
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  const [params, setParams] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [mode, setMode] = useState(() => new URLSearchParams(location.search).get("activity") === "filtered" ? "filtered" : initialMode);
  const dataRequest = useRef(0);
  const endpoint =
    type === "transactions" && mode === "tokens"
      ? "token-transfers"
      : type === "transactions" && mode === "internal"
        ? "internal-transactions"
        : type;
  useEffect(() => {
    const request = ++dataRequest.current;
    if (mode === "filtered") return;
    setData(undefined);
    setError("");
    get(`/explorer/${endpoint}${params}`)
      .then((value) => request === dataRequest.current && setData(value))
      .catch(
        (e) => request === dataRequest.current && setError(e.message),
      );
  }, [endpoint, params, mode]);
  // Newest ledgers follow the local WebSocket head immediately. Periodic index
  // refreshes fill missed blocks and enrich live RPC transactions afterward.
  useEffect(() => {
    if (type !== "blocks" || params) return;
    const request = dataRequest.current;
    let stopped = false;
    const timer = setInterval(
      () =>
        get("/explorer/blocks")
          .then((value) => {
            if (stopped || request !== dataRequest.current) return;
            setData((current: any) => {
              if (!current?.items?.length || !value?.items?.length)
                return value;
              const limit = Math.max(current.items.length, value.items.length);
              const seen = new Set<string>();
              const items = [...current.items, ...value.items]
                .sort((a: any, b: any) => Number(b.height) - Number(a.height))
                .filter((item: any) => {
                  const key = String(item.hash || item.height);
                  if (seen.has(key)) return false;
                  seen.add(key);
                  return true;
                })
                .slice(0, limit);
              return { ...value, items };
            });
            setError("");
          })
          .catch(() => {}),
      10000,
    );
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [type, params]);
  useEffect(() => {
    const block = live?.block;
    if (type !== "blocks" || params || !block?.height) return;
    setData((current: any) => {
      if (!current?.items?.length) return current;
      const first = Number(current.items[0]?.height || 0),
        height = Number(block.height);
      if (
        height < first ||
        (height === first && current.items[0]?.hash === block.hash)
      )
        return current;
      const items = [
        block,
        ...current.items.filter(
          (item: any) =>
            item.hash !== block.hash && Number(item.height) !== height,
        ),
      ]
        .sort((a: any, b: any) => Number(b.height) - Number(a.height))
        .slice(0, current.items.length);
      return { ...current, items };
    });
  }, [type, params, live?.sequence]);
  useEffect(() => {
    if (type !== "transactions" || mode !== "all" || params) return;
    const request = dataRequest.current;
    let stopped = false;
    const timer = setInterval(
      () =>
        get("/explorer/transactions")
          .then((value) => {
            if (stopped || request !== dataRequest.current) return;
            setData((current: any) => {
              if (!current?.items?.length || !value?.items?.length)
                return value;
              const limit = Math.max(current.items.length, value.items.length);
              const seen = new Set<string>();
              const items = [...value.items, ...current.items]
                .sort(
                  (a: any, b: any) =>
                    Number(b.block_number) - Number(a.block_number),
                )
                .filter((item: any) => {
                  if (!item.hash || seen.has(item.hash)) return false;
                  seen.add(item.hash);
                  return true;
                })
                .slice(0, limit);
              return { ...value, items };
            });
            setError("");
          })
          .catch(() => {}),
      10000,
    );
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [type, mode, params]);
  useEffect(() => {
    const incoming = live?.transactions || [];
    if (type !== "transactions" || mode !== "all" || params || !incoming.length)
      return;
    setData((current: any) => {
      if (
        !current?.items?.length ||
        incoming.every((item) =>
          current.items.some((existing: any) => existing.hash === item.hash),
        )
      )
        return current;
      const limit = Math.max(current.items.length, incoming.length);
      const seen = new Set<string>();
      const items = [...current.items, ...incoming]
        .sort(
          (a: any, b: any) => Number(b.block_number) - Number(a.block_number),
        )
        .filter((item: any) => {
          if (!item.hash || seen.has(item.hash)) return false;
          seen.add(item.hash);
          return true;
        })
        .slice(0, limit);
      return { ...current, items };
    });
  }, [type, mode, params, live?.sequence]);
  const next = data?.next_page_params;
  const nextQuery = next
    ? `?${new URLSearchParams(
        Object.entries(next)
          .filter(([, v]) => v != null)
          .map(([k, v]) => [k, String(v)]),
      ).toString()}`
    : "";
  const changeMode = (value: string) => {
    setMode(value);setParams("");setHistory([]);
    const url = new URL(location.href);
    if(value === "filtered")url.searchParams.set("activity","filtered");
    else {url.searchParams.delete("activity");for(const key of activityKeys)url.searchParams.delete(key);}
    window.history.replaceState({}, "", url.pathname + url.search);
  };
  return (
    <>
      <PageIntro
        eyebrow={t(type === "blocks" ? "inkBlocks" : "inkTransactions")}
        title={t(type)}
        text={type === "blocks" ? t("blocksIntro") : t("txIntro")}
      >
        <SearchBox compact />
      </PageIntro>
      {type === "transactions" && (
        <div className="ledger-filters">
          <button
            className={mode === "all" ? "active" : ""}
            onClick={() => {
              changeMode("all");
            }}
          >
            {t("allTransactions")}
          </button>
          <button
            className={mode === "tokens" ? "active" : ""}
            onClick={() => {
              changeMode("tokens");
            }}
          >
            {t("transfers")}
          </button>
          <button
            className={mode === "internal" ? "active" : ""}
            onClick={() => {
              changeMode("internal");
            }}
          >
            {t("internal")}
          </button>
          <button className={mode === "filtered" ? "active" : ""} onClick={() => changeMode("filtered")}>{t("advancedFilters")}</button>
        </div>
      )}
      {type === "transactions" && mode === "filtered" ? <Suspense fallback={<Loading />}><FilteredActivity locale={activeLocale} renderRow={item => <article className="activity-record">
        <div className="activity-record-meta"><StatusPill ok={activityState(item) === "success"}>{t(activityState(item))}</StatusPill>{item.block_number != null && <button className="text-link" onClick={() => go(`/block/${item.block_number}`)}>{t("block")} {num(item.block_number)}</button>}<span>{item.method || "—"}</span><span>{t("fee")} {eth(item.fee, 10)}</span></div>
        <GenericActivity item={item} type={item.type || "transactions"} />
      </article>} /></Suspense> : <>
      <div className="table-shell">
        <div className="table-toolbar">
          <span>
            {data ? tf("shown", { count: num(data.items?.length || 0) }) : t("loadingRecords")}
          </span>
          <button className="text-link" disabled={!data?.items?.length || Boolean(error)} onClick={() => downloadCsv(`ink-${network.chainId}-${endpoint}.csv`, type === "blocks" ? ["height","hash","timestamp","transactions","gas_used","gas_limit","fees_wei"] : ["transaction_hash","timestamp","block","from","to","value_base_units","asset","token_contract","fee_wei"], (data?.items || []).map((item: AnyRow) => type === "blocks" ? [item.height,item.hash,item.timestamp,item.transactions_count,item.gas_used,item.gas_limit,item.transaction_fees] : [item.hash || item.transaction_hash,item.timestamp,item.block_number,addressOf(item.from),addressOf(item.to),item.total?.value ?? item.value,item.token?.symbol || "ETH",item.token?.address_hash,item.fee?.value]))}><Download size={16} /> {t("exportPage")}</button>
          <span
            aria-live="polite"
            className={
              !params &&
              live?.connected &&
              (type === "blocks" || (type === "transactions" && mode === "all"))
                ? "positive"
                : ""
            }
          >
            {!params &&
            (type === "blocks" || (type === "transactions" && mode === "all"))
              ? live?.connected
                ? tf("liveHead", { number: num(live.block?.height) })
                : t("reconnecting")
              : t("sourceIndex")}
          </span>
        </div>
        {!data && !error ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} />
        ) : (
          <div className={type === "transactions" ? "tx-list" : "block-list"}>
            {!!data.items?.length && (type === "blocks" || mode === "all") && <LedgerColumns blocks={type === "blocks"} />}
            {data.items?.map((item: any, index: number) =>
              type === "transactions" && mode === "all" ? (
                <TxRow key={item.hash} tx={item} />
              ) : type === "transactions" ? (
                <GenericActivity
                  key={`${item.transaction_hash || item.index || "activity"}:${index}`}
                  item={item}
                  type={mode}
                />
              ) : (
                <BlockRow key={item.hash} block={item} />
              ),
            )}
          </div>
        )}
        {data && (
          <Pagination
            next={next}
            onNext={() => {
              setHistory((h) => [...h, params]);
              setParams(nextQuery);
            }}
            onReset={() => {
              setHistory([]);
              setParams("");
            }}
          />
        )}
      </div>
      </>}
    </>
  );
}

function Definition({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cx("definition", wide && "wide")}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
function DetailHeader({
  kind,
  title,
  subtitle,
  status,
  identifier = true,
}: {
  kind: string;
  title: string;
  subtitle?: string;
  status?: ReactNode;
  identifier?: boolean;
}) {
  return (
    <section className="detail-header">
      <span>{kind}</span>
      <div>
        <h1 className={identifier ? "mono" : undefined}>{title}</h1>
        {status}
      </div>
      {subtitle && <p>{ADDRESS.test(subtitle) || TX.test(subtitle) ? <Copyable value={subtitle} display={subtitle} /> : subtitle}</p>}
    </section>
  );
}

function BlockDetail({ id, live }: { id: string; live: LiveData }) {
  const [block, setBlock] = useState<any>();
  const [txs, setTxs] = useState<any>();
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState("");
  const dataRequest = useRef(0);
  useEffect(() => {
    const request = ++dataRequest.current;
    setBlock(undefined);
    setTxs(undefined);
    setLoadingMore(false);
    setPageError("");
    setError("");
    Promise.all([
      get(`/explorer/blocks/${id}`),
      get(`/explorer/blocks/${id}/transactions`),
    ])
      .then(([a, b]) => {
        if (request !== dataRequest.current) return;
        setBlock(a);
        setTxs(b);
      })
      .catch(
        (e) => request === dataRequest.current && setError(e.message),
      );
  }, [id]);
  if (!block && !error) return <Loading />;
  if (error) return <ErrorState error={error} />;
  const finality = blockFinality(block, live.network);
  const loadMore = async () => {
    if (loadingMore || !txs?.next_page_params) return;
    const request = dataRequest.current;
    setLoadingMore(true);
    setPageError("");
    try {
      const next = await get(`/explorer/blocks/${id}/transactions${cursorQuery(txs.next_page_params)}`);
      if (request === dataRequest.current) setTxs((current: any) => ({ ...next, items: [...current.items, ...next.items] }));
    } catch (e) {
      if (request === dataRequest.current) setPageError(e instanceof Error ? e.message : String(e));
    } finally {
      if (request === dataRequest.current) setLoadingMore(false);
    }
  };
  return (
    <>
      <DetailHeader
        kind={t("blockKind")}
        title={`#${num(block.height)}`}
        subtitle={tf("produced", { age: age(block.timestamp), date: new Date(block.timestamp).toLocaleString(activeLocale) })}
        status={<StatusPill ok>{t(finality)}</StatusPill>}
      />
      <section className="detail-layout">
        <dl className="definitions">
          <Definition label={t("blockHash")} wide>
            <Copyable value={block.hash} display={block.hash} />
          </Definition>
          <Definition label={t("transactions")}>
            {num(block.transactions_count)}
          </Definition>
          <Definition label={t("gasUsed")}>
            {num(block.gas_used)}{" "}
            <small>({unit(block.gas_used_percentage, "%")})</small>
          </Definition>
          <Definition label={t("gasLimit")}>{num(block.gas_limit)}</Definition>
          <Definition label={t("baseFee")}>
            {num(block.base_fee_per_gas)} wei
          </Definition>
          <Definition label={t("totalFees")}>
            {exactEth(block.transaction_fees)}
          </Definition>
          <Definition label={t("size")}>{bytes(block.size)}</Definition>
          <Definition label={t("parentBlock")} wide>
            <Copyable
              value={block.parent_hash}
              display={block.parent_hash}
              link={`/block/${Number(block.height) - 1}`}
            />
          </Definition>
        </dl>
        <div className="detail-feed">
          <div className="panel-head">
            <h3>{t("transactionsInBlock")}</h3>
            <span>{tf("total", { count: num(block.transactions_count) })}</span>
          </div>
          {txs?.items?.length ? (
            txs.items.map((t: any) => <TxRow key={t.hash} tx={t} />)
          ) : (
            <Empty>{t("blockEmpty")}</Empty>
          )}
          {pageError && <p role="alert">{pageError}</p>}
          {txs?.next_page_params && <div className="pagination">
            <button disabled={loadingMore} onClick={loadMore}>{loadingMore ? t("loadingRecords") : t("loadMore")} <ChevronRight /></button>
          </div>}
        </div>
      </section>
    </>
  );
}

function TxDetail({ id }: { id: string }) {
  const [tx, setTx] = useState<any>();
  const [related, setRelated] = useState<any>();
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview");
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState("");
  const [relatedRetry, setRelatedRetry] = useState(0);
  const transactionRequest = useRef(0);
  const relatedRequest = useRef(0);
  useEffect(() => {
    const request = ++transactionRequest.current;
    setTx(undefined);
    setTab(sectionChoice("overview", ["overview", "flows", "userops", "transfers", "internal", "logs", "state", "trace", "input", "l2"], {details:"overview",asset_flows:"flows",user_ops:"userops",token_transfers:"transfers",raw_trace:"trace"}));
    setError("");
    get(`/explorer/transactions/${id}`)
      .then((value) => request === transactionRequest.current && setTx(value))
      .catch(
        (e) => request === transactionRequest.current && setError(e.message),
      );
  }, [id]);
  useEffect(() => {
    const request = ++relatedRequest.current;
    setRelated(undefined);
    setLoadingMore(false);
    setPageError("");
    if (!["transfers", "internal", "logs", "state", "trace"].includes(tab))
      return;
    const endpoint =
      tab === "transfers"
        ? "token-transfers"
        : tab === "internal"
          ? "internal-transactions"
          : tab === "state"
            ? "state-changes"
            : tab === "trace"
              ? "raw-trace"
              : "logs";
    get(`/explorer/transactions/${id}/${endpoint}`)
      .then(
        (v) =>
          request === relatedRequest.current &&
          setRelated(Array.isArray(v) ? { items: v } : tab === "trace" && !Array.isArray(v?.items) ? {items:v && Object.keys(v).length ? [v] : []} : v),
      )
      .catch(
        (e) =>
          request === relatedRequest.current &&
          setRelated({ items: [], error: e.message }),
      );
  }, [id, tab, relatedRetry]);
  if (!tx && !error) return <Loading />;
  if (error) return <ErrorState error={error} />;
  const state = transactionState(tx);
  const loadMore = async () => {
    if (loadingMore || !related?.next_page_params) return;
    const request = relatedRequest.current;
    const endpoint = tab === "transfers" ? "token-transfers" : tab === "internal" ? "internal-transactions" : tab === "state" ? "state-changes" : "logs";
    setLoadingMore(true);
    setPageError("");
    try {
      const next = await get(`/explorer/transactions/${id}/${endpoint}${cursorQuery(related.next_page_params)}`);
      if (request === relatedRequest.current) setRelated((current: any) => ({ ...next, items: [...current.items, ...next.items] }));
    } catch (e) {
      if (request === relatedRequest.current) setPageError(e instanceof Error ? e.message : String(e));
    } finally {
      if (request === relatedRequest.current) setLoadingMore(false);
    }
  };
  const from = addressOf(tx.from),
    to = addressOf(tx.to || tx.created_contract);
  return (
    <>
      <DetailHeader
        kind={t("transactionKind")}
        title={short(tx.hash, 14, 12)}
        subtitle={tx.hash}
        status={
          <StatusPill ok={state === "success" || state === "confirmed"}>
            {t(state === "pending" ? "Pending" : state)}
          </StatusPill>
        }
      />
      <SectionTabs value={tab} onChange={setTab} items={[
        ["overview", t("overview")], ["transfers", t("transfers")],
        ["flows", t("Asset flows")], ["userops", t("User operations")],
        ["internal", t("internal")], ["logs", t("logs")],
        ["state", t("stateChanges")], ["trace", t("rawTrace")],
        ["input", t("inputData")], ["l2", t("l2Fees")],
      ]} />
      {tab === "userops" && <Suspense fallback={<Loading />}><UserOperationsList {...explorerProps("userops", id)} transactionHash={id} /></Suspense>}
      {tab === "flows" && <Suspense fallback={<Loading />}><AssetFlows {...explorerProps("flows", id)} tx={tx} /></Suspense>}
      {tab === "overview" && (
        <dl className="definitions standalone">
          <Definition label={t("transactionHash")} wide>
            <Copyable value={tx.hash} display={tx.hash} />
          </Definition>
          <Definition label={t("block")}>
            {tx.block_number != null ? <><button
              className="text-link"
              onClick={() => go(`/block/${tx.block_number}`)}
            >
              {num(tx.block_number)}
            </button>{" "}
            · {tf("confirmations", { count: num(tx.confirmations) })}</> : t("Pending")}
          </Definition>
          <Definition label={t("timestamp")}>
            {tx.timestamp ? <>{new Date(tx.timestamp).toLocaleString(activeLocale)} ({age(tx.timestamp)})</> : "—"}
          </Definition>
          <Definition label={t("from")} wide>
            <span className="flow-party">
              <EntityMark address={from} label={labelOf(tx.from)} />
              <Copyable value={from} display={from} link={`/address/${from}`} />
            </span>
          </Definition>
          <Definition label={t("to")} wide>
            <span className="flow-party">
              <EntityMark address={to} label={labelOf(tx.to)} />
              <Copyable
                value={to}
                display={labelOf(tx.to) || to}
                link={to ? `/address/${to}` : undefined}
              />
            </span>
          </Definition>
          <Definition label={t("value")}>{exactEth(tx.value)}</Definition>
          <Definition label={t("transactionFee")}>
            {exactEth(tx.fee?.value)}
          </Definition>
          <Definition label={t("gasUsed")}>
            {num(tx.gas_used)} / {num(tx.gas_limit)}
          </Definition>
          <Definition label={t("gasPrice")}>{num(tx.gas_price)} wei</Definition>
          <Definition label={t("method")}>
            <Method tx={tx} />
          </Definition>
          <Definition label={t("nonce")}>{num(tx.nonce)}</Definition>
        </dl>
      )}
      {tab === "input" && (
        <div className="code-panel">
          <div>
            <span>{t("METHOD")}</span>
            <strong>{tx.method || "—"}</strong>
          </div>
          <pre>{tx.raw_input || "0x"}</pre>
          {tx.decoded_input && <pre>{JSON.stringify(tx.decoded_input, null, 2)}</pre>}
          {tx.revert_reason && <pre>{typeof tx.revert_reason === "string" ? tx.revert_reason : JSON.stringify(tx.revert_reason, null, 2)}</pre>}
        </div>
      )}
      {tab === "l2" && (
        <dl className="definitions standalone">
          <Definition label={t("L1 data fee")}>{exactEth(tx.l1_fee)}</Definition>
          <Definition label={t("L1 gas used")}>{num(tx.l1_gas_used)}</Definition>
          <Definition label={t("L1 gas price")}>
            {num(tx.l1_gas_price)} wei
          </Definition>
          <Definition label={t("L2 execution fee")}>
            {exactEth(executionFee(tx))}
          </Definition>
        </dl>
      )}
      {["transfers", "internal", "logs"].includes(tab) && (
        <div className="table-shell address-activity">
          {!related ? (
            <Loading />
          ) : related.error ? (
            <ErrorState error={related.error} onRetry={() => setRelatedRetry(value => value + 1)} />
          ) : related.items?.length ? (
            related.items.map((item: any, i: number) => (
              <GenericActivity
                key={`${item.transaction_hash || item.index || "activity"}:${i}`}
                item={item}
                type={tab}
              />
            ))
          ) : (
            <Empty>
              {related.error || tf("No {type} recorded for this transaction.", { type: activityLabel(tab) })}
            </Empty>
          )}
        </div>
      )}
      {tab === "state" && (
        <div className="table-shell address-activity">
          <div className="table-toolbar"><span>{t("stateBalanceUnits")}</span></div>
          {!related ? (
            <Loading />
          ) : related.error ? (
            <ErrorState error={related.error} onRetry={() => setRelatedRetry(value => value + 1)} />
          ) : related.items?.length ? (
            related.items.map((item: any, i: number) => (
              <StateChange key={i} item={item} />
            ))
          ) : (
            <Empty>
              {related.error || t("noIndexedBalanceChanges")}
            </Empty>
          )}
        </div>
      )}
      {tab === "trace" && (
        <div className="code-panel">
          <div>
            <span>{t("EXECUTION TRACE")}</span>
            <strong>
              {related?.items?.length
                ? tf("{count} calls", { count: num(related.items.length) })
                : t("Unavailable")}
            </strong>
          </div>
          {!related ? (
            <Loading />
          ) : related.error ? (
            <ErrorState error={related.error} onRetry={() => setRelatedRetry(value => value + 1)} />
          ) : related.items?.length ? (
            <pre>{JSON.stringify(related.items, null, 2)}</pre>
          ) : (
            <Empty>
              {related.error || t("No raw execution trace is available for this transaction.")}
            </Empty>
          )}
        </div>
      )}
      {["transfers", "internal", "logs", "state"].includes(tab) && <>
        {pageError && <p role="alert">{pageError}</p>}
        {related?.next_page_params && <div className="pagination">
          <button disabled={loadingMore} onClick={loadMore}>{loadingMore ? t("loadingRecords") : t("loadMore")} <ChevronRight /></button>
        </div>}
      </>}
    </>
  );
}

function AddressDetail({ id }: { id: string }) {
  const [address, setAddress] = useState<any>();
  const [data, setData] = useState<any>();
  const [tokens, setTokens] = useState<any[]>();
  const [counters, setCounters] = useState<any>({});
  const [summaryErrors, setSummaryErrors] = useState<string[]>([]);
  const [profileRetry, setProfileRetry] = useState(0);
  const [pool, setPool] = useState<any>();
  const [tab, setTab] = useState(() => addressSection());
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [dataRetry, setDataRetry] = useState(0);
  const profileRequest = useRef(0);
  const dataRequest = useRef(0);
  useEffect(() => {
    const request = ++profileRequest.current;
    const controller = new AbortController();
    setTab(addressSection());
    setData(undefined);
    setPool(undefined);
    setAddress(undefined);
    setError("");
    setTokens(undefined);
    setCounters({});
    setSummaryErrors([]);
    const summaryError = (e: Error) => {
      if (request === profileRequest.current && !controller.signal.aborted)
        setSummaryErrors(current => [...current, e.message]);
    };
    get(`/explorer/addresses/${id}`, controller.signal)
      .then((value: any) => {
        if (request !== profileRequest.current) return;
        if (value.hash?.toLowerCase() !== id.toLowerCase()) throw new Error(t("invalidApiResponse"));
        setAddress(value);
        if (value.is_contract)
          get(`/contract-info/pools/${id}/check`, controller.signal)
            .then(
              (next) => request === profileRequest.current && setPool(next),
            )
            .catch(
              () => request === profileRequest.current && setPool(null),
            );
        else setPool(null);
      })
      .catch(
        (e) => request === profileRequest.current && !controller.signal.aborted && setError(e.message),
      );
    get(`/explorer/addresses/${id}/token-balances`, controller.signal)
      .then((v: any) => {
        const items = Array.isArray(v) ? v : v.items;
        if (!Array.isArray(items)) throw new Error(t("invalidApiResponse"));
        if (request === profileRequest.current) setTokens(items);
      })
      .catch(summaryError);
    get(`/explorer/addresses/${id}/counters`, controller.signal)
      .then(
        (value) =>
          request === profileRequest.current && setCounters(value),
      )
      .catch(summaryError);
    return () => { ++profileRequest.current; controller.abort(); };
  }, [id, profileRetry]);
  useEffect(() => {
    const request = ++dataRequest.current;
    const controller = new AbortController();
    setLoadingMore(false);
    setData(undefined);
    if (["overview", "history", "userops"].includes(tab)) return;
    const endpoint =
      ["contract", "read", "write"].includes(tab) ? `smart-contracts/${id}` : `addresses/${id}/${tab}`;
    get(`/explorer/${endpoint}`, controller.signal)
      .then((value) => request === dataRequest.current && setData(value))
      .catch(
        (e) =>
          request === dataRequest.current && !controller.signal.aborted &&
          setData({ items: [], error: e.message }),
      );
    return () => { ++dataRequest.current; controller.abort(); };
  }, [id, tab, dataRetry, profileRetry]);
  const loadMore = async () => {
    if (
      !data?.next_page_params ||
      loadingMore ||
      tab === "overview" ||
      tab === "contract"
    )
      return;
    const request = dataRequest.current;
    const query = new URLSearchParams(
      Object.entries(data.next_page_params)
        .filter(([, value]) => value != null)
        .map(([key, value]) => [key, String(value)]),
    ).toString();
    const endpoint = `addresses/${id}/${tab}?${query}`;
    setLoadingMore(true);
    setData((current: any) => ({ ...current, error: undefined }));
    try {
      const next = await get(`/explorer/${endpoint}`);
      if (request === dataRequest.current)
        setData((current: any) => ({
          ...next,
          items: [...(current?.items || []), ...(next.items || [])],
        }));
    } catch (e) {
      if (request === dataRequest.current)
        setData((current: any) => ({
          ...current,
          error: e instanceof Error ? e.message : String(e),
        }));
    } finally {
      if (request === dataRequest.current) setLoadingMore(false);
    }
  };
  if (!address && !error) return <Loading />;
  if (error && !address) return <ErrorState error={error} onRetry={() => setProfileRetry(value => value + 1)} />;
  const balance = address?.coin_balance;
  const name = address?.ens_domain_name || address?.name || address?.token?.name;
  const implementations = Array.isArray(address?.implementations)
    ? address.implementations.filter((item: AnyRow | null) => item && ADDRESS.test(item.address_hash))
    : [];
  return (
    <div className="address-page">
      <DetailHeader
        kind={
          pool
            ? t("pool").toUpperCase()
            : address?.is_contract
              ? t("smartContract").toUpperCase()
              : t("address").toUpperCase()
        }
        title={pool ? `${pool.base_token_symbol} / ${pool.quote_token_symbol}` : name || short(id)}
        identifier={!pool && !name}
        subtitle={id}
        status={
          <>
            {address?.is_scam && <StatusPill ok={false}>{t("Flagged")}</StatusPill>}
            {address?.is_verified && <span className="verified">
              <ShieldCheck /> {t("verifiedSource")}
            </span>}
          </>
        }
      />
      <section className="address-summary">
        <Metric
          label={t("ETH balance")}
          value={eth(balance, 6)}
          note={<>{money(
            balance == null || address?.exchange_rate == null
              ? undefined
              : (Number(balance) / 1e18) * Number(address.exchange_rate),
          )}<br />{t(address?.balance_check?.source === "local" ? "balanceNodeSource" : "sourceIndex")} · {tf("updated at #{block}", { block: num(address?.block_number_balance_updated_at) })}
          {address?.balance_check?.status === "corrected" && <><br />{t("balanceIndexDifference")}</>}
          {address?.balance_check?.status === "unavailable" && <><br />{t("balanceUnverified")}</>}</>}
        />
        <Metric
          label={t("Transactions")}
          value={num(counters.transactions_count)}
          note={tf("{count} token transfers", { count: num(counters.token_transfers_count) })}
        />
        <Metric
          label={t("Token holdings")}
          value={num(tokens?.length)}
          note={t("known assets")}
        />
      </section>
      {summaryErrors.length > 0 && <ErrorState error={[...new Set(summaryErrors)].join(" · ")} onRetry={() => setProfileRetry(value => value + 1)} />}
      <SectionTabs value={tab} onChange={setTab} items={[
        ["overview", t("overview")], ["transactions", t("transactions")],
        ["history", t("Account history")], ["userops", t("User operations")],
        ["tokens", t("assets")], ["nft", t("nfts")],
        ["token-transfers", t("transfers")], ["internal-transactions", t("internal")],
        ["logs", t("logs")],
        ...(address?.is_contract ? [
          ["contract", t("contractSource")], ["read", t("readContract")],
          ["write", t("writeContract")],
        ] as [string, string][] : []),
      ]} />
      {tab === "overview" ? (
        <dl className="definitions standalone address-facts">
          <Definition label={t("address")} wide><Copyable value={id} display={id} /></Definition>
          {address?.ens_domain_name && <Definition label="ENS"><bdi>{address.ens_domain_name}</bdi></Definition>}
          <Definition label={t("transfers")}>{num(counters.token_transfers_count)}</Definition>
          <Definition label={t("Gas consumed")}>{num(counters.gas_usage_count)} <small>{t("sourceIndex")}</small></Definition>
          {address?.metadata?.tags?.length > 0 && <Definition label={t("Public labels")} wide><ul className="address-labels">{address.metadata.tags.map((tag:AnyRow,index:number)=><li key={tag.slug || index}><strong>{tag.name}</strong>{tag.meta?.tooltipDescription && <span> · {tag.meta.tooltipDescription}</span>}</li>)}</ul></Definition>}
          {address?.is_contract && <>
            {address?.name && <Definition label={t("smartContract")}>{address.name}</Definition>}
            {address?.token && <Definition label={t("tokenStandard")}>{address.token.type} {address.token.symbol && `· ${address.token.symbol}`}</Definition>}
            {address?.proxy_type && <Definition label={t("proxyType")}>{address.proxy_type}</Definition>}
            {implementations.map((implementation: AnyRow) => <Definition key={implementation.address_hash} label={t("implementation")}>
              <Copyable value={implementation.address_hash} display={implementation.name || short(implementation.address_hash)} link={`/address/${implementation.address_hash}`} />
            </Definition>)}
            {ADDRESS.test(address?.creator_address_hash) && <Definition label={t("creator")}><Copyable value={address.creator_address_hash} link={`/address/${address.creator_address_hash}`} /></Definition>}
            {TX.test(address?.creation_transaction_hash) && <Definition label={t("creationTx")}><Copyable value={address.creation_transaction_hash} link={`/tx/${address.creation_transaction_hash}`} /></Definition>}
            {!address?.is_verified && <Definition label={t("contractSource")}><button className="text-link" onClick={()=>go(`/contract-verification?address=${id}`)}>{t("Verify contract")}</button></Definition>}
            {pool && <Definition label={t("pool")}><button className="text-link" onClick={() => go(`/pools/${id}`)}><Droplets size={16} /> {pool.base_token_symbol} / {pool.quote_token_symbol}</button></Definition>}
          </>}
        </dl>
      ) : tab === "history" ? (
        <Suspense fallback={<Loading />}><AddressHistory {...explorerProps("history", id)} /></Suspense>
      ) : tab === "userops" ? (
        <Suspense fallback={<Loading />}><UserOperationsList {...explorerProps("userops", id)} sender={id} /></Suspense>
      ) : (
        <div className="table-shell address-activity">
          {!data ? (
            <Loading />
          ) : (
            <>
              {["read", "write"].includes(tab) ? (
                <Suspense fallback={<Loading />}><ContractInteraction key={`${id}-${tab}`} address={id} contract={data.error ? {} : data} mode={tab === "read" ? "read" : "write"} locale={activeLocale} /></Suspense>
              ) : data.error && !data.items?.length ? (
                <ErrorState error={data.error} onRetry={() => setDataRetry(value => value + 1)} />
              ) : tab === "contract" && !data.error ? (
                <ContractSource contract={data} />
              ) : tab === "tokens" && data.items?.length ? (
                <div className="asset-list">
                  {data.items.map((item: any, i: number) => (
                    <AssetHolding
                      key={`${item.token?.address_hash || "asset"}-${item.token_id || i}`}
                      item={item}
                    />
                  ))}
                </div>
              ) : tab === "nft" && data.items?.length ? (
                <div className="nft-grid">
                  {data.items.map((item: any, i: number) => (
                    <NftItem
                      key={`${item.token?.address_hash || "nft"}-${item.id || i}`}
                      item={item}
                    />
                  ))}
                </div>
              ) : data.items?.length ? (
                tab === "transactions" ? (
                  <><LedgerColumns />{data.items.map((tx: any) => <TxRow key={tx.hash} tx={tx} />)}</>
                ) : (
                  data.items.map((item: any, i: number) => (
                    <GenericActivity
                      key={`${item.transaction_hash || item.index || "activity"}:${i}`}
                      item={item}
                      type={tab}
                    />
                  ))
                )
              ) : (
                <Empty>
                  {data.error ||
                    tf("No {type} indexed for this address.", { type: activityLabel(tab) })}
                </Empty>
              )}
              {data.items?.length && tab !== "contract" ? (
                <div className="pagination address-pagination">
                  <span aria-live="polite">
                    {num(data.items.length)}{" "}
                    {tab === "nft" ? t("nfts") : t("recordsLoaded")}
                  </span>
                  <button
                    disabled={!data.next_page_params || loadingMore}
                    onClick={loadMore}
                  >
                    {loadingMore
                      ? `${t("loadingMedia")}…`
                      : data.next_page_params
                        ? t("loadMore")
                        : t("allLoaded")}{" "}
                    <ChevronRight />
                  </button>
                </div>
              ) : null}
              {data.error && data.items?.length > 0 && <p role="alert">{data.error}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// All third-party artwork is routed through the same-origin, SSRF-protected
// media cache. Broken or unsafe assets fall back to deterministic placeholders.
function AssetHolding({ item }: { item: AnyRow }) {
  const token = item.token || {},
    amount = scaled(item.value, token.decimals);
  return (
    <button
      className="asset-row"
      disabled={!token.address_hash}
      onClick={() => token.address_hash && go(`/token/${token.address_hash}`)}
    >
      <span className="token-name">
        {token.icon_url ? (
          <img src={mediaUrl(token.icon_url)} alt="" />
        ) : (
          <i>{token.symbol?.[0] || "?"}</i>
        )}
        <span>
          <strong>{token.name || t("Unknown asset")}</strong>
          <small>
            {token.symbol} · {token.type}
          </small>
        </span>
      </span>
      <span>
        <strong>{num(amount, 6)}</strong>
        <small>
          {token.exchange_rate && amount !== undefined
            ? money(amount * Number(token.exchange_rate))
            : t("No price data")}
        </small>
      </span>
      <ArrowUpRight />
    </button>
  );
}
function NftItem({ item }: { item: AnyRow }) {
  const token = item.token || {};
  const tokenId = String(item.id ?? item.token_id ?? "");
  const owner = addressOf(item.owner);
  const source =
    item.image_url ||
    item.media_url ||
    item.metadata?.image_url ||
    item.metadata?.image ||
    token.icon_url;
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [source]);
  return (
    <button
      className="nft-item"
      onClick={() =>
        token.address_hash &&
        tokenId &&
        go(
          `/token/${token.address_hash}/instance/${encodeURIComponent(tokenId)}`,
        )
      }
    >
      <div className="nft-thumb">
        {source && !failed && (
          <img
            className={loaded ? "is-ready" : ""}
            src={mediaUrl(source)}
            alt={`${token.name || "NFT"} #${tokenId || "—"}`}
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        )}{" "}
        {(!source || failed || !loaded) && (
          <div className="nft-placeholder">
            <FileCode2 />
            <small>
              {failed || !source ? t("mediaUnavailable") : t("loadingMedia")}
            </small>
          </div>
        )}
      </div>
      <span>{item.metadata?.name || token.name || t("NFT collection")}</span>
      <strong>#{tokenId || "—"}</strong>
      {owner && <span title={owner}>{t("owner")}: {labelOf(item.owner) || short(owner)}</span>}
    </button>
  );
}
function ContractSource({ contract }: { contract: AnyRow }) {
  const sources = [
    ...(contract.source_code
      ? [
          {
            file_path: contract.file_path || t("Contract source"),
            source_code: contract.source_code,
          },
        ]
      : []),
    ...(contract.additional_sources || []),
  ];
  return (
    <div className="contract-source">
      <div className="source-head">
        <div>
          <StatusPill ok={Boolean(contract.source_code)}>
            {contract.is_fully_verified ? t("fullyVerified") : contract.source_code ? t("Partially verified") : t("Not verified")}
          </StatusPill>
          <h3>{contract.name || t("smartContract")}</h3>
          <span>{contract.file_path || t("Source code")}</span>
        </div>
        <dl>
          <div>
            <dt>{t("Compiler")}</dt>
            <dd>{contract.compiler_version || "—"}</dd>
          </div>
          <div>
            <dt>{t("Language")}</dt>
            <dd>{contract.language || "Solidity"}</dd>
          </div>
          <div>
            <dt>{t("Optimizer")}</dt>
            <dd>
              {contract.optimization_enabled
                ? tf("{count} runs", { count: num(contract.optimization_runs || contract.optimizations_runs) })
                : t("Disabled")}
            </dd>
          </div>
          <div>
            <dt>{t("License")}</dt>
            <dd>{contract.license_type || t("Not specified")}</dd>
          </div>
          <div>
            <dt>{t("ABI entries")}</dt>
            <dd>{num(contract.abi?.length)}</dd>
          </div>
          <div><dt>{t("EVM version")}</dt><dd>{contract.evm_version || "—"}</dd></div>
          <div><dt>{t("Verified at")}</dt><dd>{contract.verified_at ? new Date(contract.verified_at).toLocaleString(activeLocale) : "—"}</dd></div>
          <div>
            <dt>{t("Bytecode")}</dt>
            <dd>
              {contract.deployed_bytecode
                ? bytes(
                    Math.max(0, (contract.deployed_bytecode.length - 2) / 2),
                  )
                : "—"}
            </dd>
          </div>
        </dl>
      </div>
      {sources.length ? (
        sources.map((source: any, index: number) => (
          <details
            className="source-file"
            open={index === 0}
            key={`${source.file_path}-${index}`}
          >
            <summary>{source.file_path || tf("Source {number}", { number: index + 1 })}</summary>
            <button className="text-link" onClick={() => { const url=URL.createObjectURL(new Blob([source.source_code || ""],{type:"text/plain"}));const a=document.createElement("a");a.href=url;a.download=String(source.file_path || `source-${index}.sol`).split("/").at(-1) || "source.sol";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }}>{t("Download source")}</button>
            <pre>{source.source_code}</pre>
          </details>
        ))
      ) : (
        <Empty>{t("Source is not available.")}</Empty>
      )}
      {sources.length > 1 && (
        <footer>
          {tf("{count} source files are included in the verified build.", { count: num(sources.length) })}
        </footer>
      )}
      {[["ABI",contract.abi], [t("Compiler settings"),contract.compiler_settings], [t("Creation bytecode"),contract.creation_bytecode], [t("Deployed bytecode"),contract.deployed_bytecode]].map(([label,value]) => value != null && <details className="source-file" key={label as string}><summary>{label as string}</summary><pre>{typeof value === "string" ? value : JSON.stringify(value,null,2)}</pre></details>)}
    </div>
  );
}

function GenericActivity({ item, type }: { item: AnyRow; type: string }) {
  const hash = item.transaction_hash || item.tx_hash;
  const from = addressOf(item.from);
  const to = addressOf(item.to || item.created_contract);
  if (type === "logs") return <LogEntry item={item} />;
  return (
    <div className="generic-row">
      <span className="activity-kind">
        <EntityMark
          address={item.token?.address_hash || hash}
          src={item.token?.icon_url}
          label={item.token?.symbol || type}
        />
        <span className="activity-identity">
          <span className="activity-asset">{item.token?.name || item.token?.symbol || t("nativeTransfer")}</span>
          <span className="method">{item.token ? t("token transfer") : activityLabel(type)}</span>
        </span>
      </span>
      <div className="activity-reference">
        {hash ? (
          <Copyable value={hash} link={`/tx/${hash}`} />
        ) : (
          <span className="mono">#{item.index ?? "—"}</span>
        )}
        <small>
          {item.timestamp
            ? <time dateTime={item.timestamp} title={new Date(item.timestamp).toLocaleString(activeLocale)}>{age(item.timestamp, "short")}</time>
            : item.method || item.type || t("Chain event")}
        </small>
      </div>
      <div className="generic-address">
        <span className="activity-party">
          <small>{t("from")}</small>
          <Copyable value={from} display={labelOf(item.from) || short(from)} link={from ? `/address/${from}` : undefined} />
        </span>
        <ArrowRight aria-hidden="true" />
        <span className="activity-party">
          <small>{t("to")}</small>
          <Copyable value={to} display={labelOf(item.to || item.created_contract) || short(to)} link={to ? `/address/${to}` : undefined} />
        </span>
      </div>
      <strong className="activity-amount">
        {item.total?.value != null
          ? <>{num(scaled(item.total.value, item.total.decimals ?? item.token?.decimals), 4)} <span>{item.token?.symbol || ""}</span></>
          : eth(item.value)}
      </strong>
    </div>
  );
}

function LogEntry({ item }: { item: AnyRow }) {
  const address = addressOf(item.address);
  return <article className="code-panel event-log">
    <div>
      <span>{t("logs")} #{item.index ?? "—"}</span>
      <Copyable value={address} link={address ? `/address/${address}` : undefined} />
      {item.transaction_hash && <Copyable value={item.transaction_hash} link={`/tx/${item.transaction_hash}`} />}
    </div>
    {item.decoded && <pre>{JSON.stringify(item.decoded, null, 2)}</pre>}
    <pre>{JSON.stringify({ topics: item.topics || [], data: item.data || "0x" }, null, 2)}</pre>
  </article>;
}

function StateChange({ item }: { item: AnyRow }) {
  const addr = addressOf(item.address);
  return (
    <div className="state-row">
      <span className="method">{item.type || "state"}</span>
      <div>
        <Copyable
          value={addr}
          display={labelOf(item.address) || short(addr)}
          link={addr ? `/address/${addr}` : undefined}
        />
        <small>
          {item.token?.symbol || item.token_id
            ? tf("Token {symbol} {id}", { symbol: item.token?.symbol || "", id: item.token_id || "" })
            : t("nativeBalance")}
        </small>
      </div>
      <div>
        <small>{t("Before")}</small>
        <strong className="mono">{item.balance_before ?? "—"}</strong>
        {item.balance_after != null && <><small>{t("After")}</small><strong className="mono">{item.balance_after}</strong></>}
      </div>
      <ArrowRight />
      <div>
        <small>{t("Change")}</small>
        <strong
          className={
            typeof item.change === "object" || item.change == null ? "mono" : String(item.change).startsWith("-") ? "negative" : "positive"
          }
        >
          <code className="state-change-value">{stateChangeText(item.change)}</code>
        </strong>
      </div>
    </div>
  );
}

function Tokens() {
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  const [params, setParams] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setData(undefined); setError("");
    get(`/explorer/tokens${params}`, controller.signal)
      .then(value => !controller.signal.aborted && setData(value))
      .catch(e => !controller.signal.aborted && setError(e.message));
    return () => controller.abort();
  }, [params]);
  return (
    <>
      <PageIntro
        eyebrow={t("TOKENS & NFTS")}
        title={t("tokens")}
        text={t("tokenDirectory")}
      >
        <SearchBox compact />
      </PageIntro>
      <div className="table-shell">
        <div className="table-toolbar">
          <span>{t("Sorted by circulating market cap")}</span>
          <span>{t("Ink index")}</span>
        </div>
        {!data && !error ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} />
        ) : (
          <div className="token-table">
            <div className="token-table-head">
              <span>{t("Asset")}</span>
              <span>{t("Type")}</span>
              <span>{t("Price")}</span>
              <span>{t("Holders")}</span>
              <span>{t("Market cap")}</span>
            </div>
            {data.items?.map((token: any) => (
              <button
                className="token-row"
                key={token.address_hash}
                onClick={() => go(`/token/${token.address_hash}`)}
              >
                <span className="token-name">
                  {token.icon_url ? (
                    <img src={mediaUrl(token.icon_url)} alt="" />
                  ) : (
                    <i>{token.symbol?.slice(0, 1)}</i>
                  )}
                  <span>
                    <strong>{token.name || t("Unknown token")}</strong>
                    <small>{token.symbol}</small>
                  </span>
                </span>
                <span>{token.type}</span>
                <span>{money(token.exchange_rate)}</span>
                <span>{num(token.holders_count)}</span>
                <span>{money(token.circulating_market_cap)}</span>
              </button>
            ))}
          </div>
        )}
        {data && <Pagination next={data.next_page_params} onNext={() => setParams(cursorQuery(data.next_page_params))} onReset={() => setParams("")} />}
      </div>
    </>
  );
}

function TokenDetail({ id }: { id: string }) {
  const [token, setToken] = useState<any>();
  const [data, setData] = useState<any>();
  const [tab, setTab] = useState(()=>sectionChoice("transfers",["transfers","holders","instances","contract","read","write"],{token_transfers:"transfers"}));
  const [params, setParams] = useState("");
  const [error, setError] = useState("");
  const [retry,setRetry] = useState(0);
  const tokenRequest = useRef(0);
  const dataRequest = useRef(0);
  useEffect(() => {
    const request = ++tokenRequest.current;
    setToken(undefined);
    setError("");
    get(`/explorer/tokens/${id}`)
      .then((value) => request === tokenRequest.current && setToken(value))
      .catch((e) => request === tokenRequest.current && setError(e.message));
  }, [id]);
  useEffect(() => {
    const request = ++dataRequest.current;
    setData(undefined);
    get(["contract","read","write"].includes(tab) ? `/explorer/smart-contracts/${id}` : `/explorer/tokens/${id}/${tab}${params}`)
      .then((value) => request === dataRequest.current && setData(value))
      .catch(
        (e) =>
          request === dataRequest.current &&
          setData({ items: [], error: e.message }),
      );
  }, [id, tab, params, retry]);
  if (!token && !error) return <Loading />;
  if (error) return <ErrorState error={error} />;
  return (
    <>
      <section className="token-hero">
        <div className="token-id">
          {token.icon_url ? (
            <img src={mediaUrl(token.icon_url)} alt="" />
          ) : (
            <i>{token.symbol?.[0]}</i>
          )}
          <div>
            <span>{token.type}</span>
            <h1>
              {token.name} <small>{token.symbol}</small>
            </h1>
            <Copyable value={id} display={id} />
          </div>
        </div>
        <div className="token-price">
          <span>{t("Reference price")}</span>
          <strong>{money(token.exchange_rate)}</strong>
        </div>
      </section>
      <section className="address-summary">
        <Metric label={t("holders")} value={num(token.holders_count)} />
        <Metric
          label={t("Total supply")}
          value={compact(scaled(token.total_supply, token.decimals))}
          note={tf("{count} decimals", { count: num(token.decimals) })}
        />
        <Metric
          label={t("Market cap")}
          value={money(token.circulating_market_cap)}
        />
        <Metric label={t("volume24h")} value={money(token.volume_24h)} />
      </section>
      <SectionTabs value={tab} onChange={value => { setTab(value); setParams(""); }} items={[
        ["transfers", t("Transfers")], ["holders", t("Holders")],
        ["contract",t("contractSource")], ["read",t("readContract")], ["write",t("writeContract")],
        ...(token.type !== "ERC-20" ? [["instances", t("Token instances")]] as [string, string][] : []),
      ]} />
      <div className="table-shell address-activity">
        {!data ? (
          <Loading />
        ) : ["read","write"].includes(tab) ? (
          <Suspense fallback={<Loading />}><ContractInteraction key={`${id}-${tab}`} address={id} contract={data.error ? {} : data} mode={tab === "read" ? "read" : "write"} locale={activeLocale} /></Suspense>
        ) : data.error ? (
          <ErrorState error={data.error} onRetry={()=>setRetry(value=>value+1)} />
        ) : tab === "contract" ? (
          <ContractSource contract={data} />
        ) : data.items?.length ? (
          tab === "transfers" ? (
            data.items.map((t: any, i: number) => (
              <GenericActivity
                key={`${t.transaction_hash || "transfer"}:${i}`}
                item={t}
                type="token transfer"
              />
            ))
          ) : tab === "holders" ? (
            <div className="holder-list">
              {data.items.map((h: any, i: number) => (
                <HolderRow
                  key={addressOf(h.address) || i}
                  item={h}
                  decimals={Number(token.decimals || 0)}
                  symbol={token.symbol}
                />
              ))}
            </div>
          ) : (
            <div className="nft-grid">
              {data.items.map((item: any, i: number) => (
                <NftItem key={item.id || i} item={{ ...item, token }} />
              ))}
            </div>
          )
        ) : (
          <Empty>{data.error || tf("No {type} found.", { type: activityLabel(tab) })}</Empty>
        )}
        {data && !["contract","read","write"].includes(tab) && (
          <Pagination
            next={data.next_page_params}
            onNext={() =>
              setParams(
                `?${new URLSearchParams(
                  Object.entries(data.next_page_params)
                    .filter(([, v]) => v != null)
                    .map(([k, v]) => [k, String(v)]),
                ).toString()}`,
              )
            }
            onReset={() => setParams("")}
          />
        )}
      </div>
    </>
  );
}

function NftDetail({ id, tokenId }: { id: string; tokenId: string }) {
  const [instance, setInstance] = useState<any>();
  const [token, setToken] = useState<any>();
  const [transfers, setTransfers] = useState<any>();
  const [error, setError] = useState("");
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState("");
  const [transferRetry,setTransferRetry] = useState(0);
  const [transfersCount,setTransfersCount] = useState<any>();
  const profileRequest = useRef(0);
  const dataRequest = useRef(0);
  useEffect(() => {
    const request = ++profileRequest.current;
    const controller = new AbortController();
    setFailed(false);
    setError("");
    setInstance(undefined);
    setTransfersCount(undefined);
    Promise.all([
      get(`/explorer/tokens/${id}/instances/${encodeURIComponent(tokenId)}`,controller.signal),
      get(`/explorer/tokens/${id}`,controller.signal),
    ])
      .then(([item, collection]) => {
        if (request !== profileRequest.current || controller.signal.aborted) return;
        setInstance(item);
        setToken(collection);
      })
      .catch(
        (e) => request === profileRequest.current && !controller.signal.aborted && setError(e.message),
      );
    get(`/explorer/tokens/${id}/instances/${encodeURIComponent(tokenId)}/transfers-count`,controller.signal)
      .then(value=>{if(request===profileRequest.current && /^\d+$/.test(String(value?.transfers_count)))setTransfersCount(value.transfers_count);}).catch(()=>{});
    return ()=>{controller.abort();++profileRequest.current;};
  }, [id, tokenId]);
  useEffect(()=>{
    const request=++dataRequest.current,controller=new AbortController();setTransfers(undefined);setLoadingMore(false);setPageError("");
    get(`/explorer/tokens/${id}/instances/${encodeURIComponent(tokenId)}/transfers`,controller.signal)
      .then(value=>{if(request===dataRequest.current)setTransfers(value);})
      .catch(e=>{if(request===dataRequest.current&&!controller.signal.aborted)setTransfers({items:[],error:e.message});});
    return ()=>{controller.abort();++dataRequest.current;};
  },[id,tokenId,transferRetry]);
  if (!instance && !error) return <Loading />;
  if (error) return <ErrorState error={error} />;
  const loadMore = async () => {
    if (loadingMore || !transfers?.next_page_params) return;
    const request = dataRequest.current;
    setLoadingMore(true); setPageError("");
    try {
      const next = await get(`/explorer/tokens/${id}/instances/${encodeURIComponent(tokenId)}/transfers${cursorQuery(transfers.next_page_params)}`);
      if (request === dataRequest.current) setTransfers((current: any) => ({ ...next, items: [...current.items, ...next.items] }));
    } catch (e) {
      if (request === dataRequest.current) setPageError(e instanceof Error ? e.message : String(e));
    } finally {
      if (request === dataRequest.current) setLoadingMore(false);
    }
  };
  const source =
    instance.image_url ||
    instance.media_url ||
    instance.metadata?.image_url ||
    instance.metadata?.image;
  const owner = addressOf(instance.owner);
  const creator = addressOf(instance.creator) || instance.creator_address_hash;
  const attributes = Array.isArray(instance.metadata?.attributes)
    ? instance.metadata.attributes
    : [];
  return (
    <>
      <DetailHeader
        kind={t("nftInstance").toUpperCase()}
        identifier={false}
        title={instance.metadata?.name || `${token.name || "NFT"} #${tokenId}`}
        subtitle={`${token.name || "Collection"} · ${token.symbol || token.type}`}
        status={
          <StatusPill ok={token.reputation !== "scam"}>{token.type}</StatusPill>
        }
      />
      <section className="nft-detail">
        <div className="nft-media">
          {source && !failed ? (
            <img
              src={mediaUrl(source)}
              alt={instance.metadata?.name || `${token.name} #${tokenId}`}
              onError={() => setFailed(true)}
            />
          ) : (
            <div className="nft-placeholder">
              <ImageIcon />
              <span>{t("mediaUnavailable")}</span>
            </div>
          )}
        </div>
        <div className="nft-facts">
          <span>{t("metadata").toUpperCase()}</span>
          <h2>{instance.metadata?.name || `${token.name} #${tokenId}`}</h2>
          {instance.metadata?.description && (
            <p>{instance.metadata.description}</p>
          )}
          <dl>
            <Definition label={t("tokenId")}>
              <span className="mono">{tokenId}</span>
            </Definition>
            <Definition label={t("owner")}>
              {owner ? (
                <Copyable
                  value={owner}
                  display={labelOf(instance.owner) || short(owner, 10, 8)}
                  link={`/address/${owner}`}
                />
              ) : (
                "—"
              )}
            </Definition>
            <Definition label={t("creator")}>
              {creator ? (
                <Copyable value={creator} link={`/address/${creator}`} />
              ) : (
                "—"
              )}
            </Definition>
            <Definition label={t("Transfers")}>
              {num(instance.transfers_count ?? transfersCount ?? transfers?.items?.length)}{instance.transfers_count == null && transfersCount == null && transfers?.items && <small> · {t("recordsLoaded")}</small>}
            </Definition>
            <Definition label={t("Collection")}>
              <button className="text-link" onClick={() => go(`/token/${id}`)}>
                {token.name} ({token.symbol})
              </button>
            </Definition>
            <Definition label={t("Contract")}>
              <Copyable value={id} link={`/address/${id}`} />
            </Definition>
          </dl>
          {externalDestination(instance.external_app_url) && (
            <a
              className="external-action"
              href={externalDestination(instance.external_app_url)}
              target="_blank"
              rel="noreferrer"
            >{t("External collection")} <ExternalLink />
            </a>
          )}
        </div>
      </section>
      {attributes.length > 0 && (
        <section className="nft-attributes">
          <SectionTitle
            eyebrow={t("metadata").toUpperCase()}
            title={t("attributes")}
          />
          <div>
            {attributes.map((attribute: any, index: number) => (
              <article
                key={`${attribute.trait_type || attribute.key}-${index}`}
              >
                <span>
                  {attribute.trait_type ||
                    attribute.key ||
                    tf("Attribute {number}", { number: index + 1 })}
                </span>
                <strong>{String(attribute.value ?? "—")}</strong>
              </article>
            ))}
          </div>
        </section>
      )}
      <section className="nft-activity">
        <SectionTitle eyebrow={t("TRANSFERS")} title={t("latestActivity")} />
        <div className="table-shell">
          {transfers === undefined ? <Loading /> : transfers.error ? <ErrorState error={transfers.error} onRetry={() => setTransferRetry(value => value + 1)} /> : transfers?.items?.length ? (
            transfers.items.map((item: any, index: number) => (
              <GenericActivity
                key={`${item.transaction_hash || "transfer"}:${index}`}
                item={item}
                type="NFT transfer"
              />
            ))
          ) : (
            <Empty />
          )}
          {pageError && <p role="alert">{pageError}</p>}
          {transfers?.next_page_params && <div className="pagination">
            <button disabled={loadingMore} onClick={loadMore}>{loadingMore ? t("loadingRecords") : t("loadMore")} <ChevronRight /></button>
          </div>}
        </div>
      </section>
      <details className="raw-metadata">
        <summary>{t("metadata")} · JSON</summary>
        <pre>{JSON.stringify(instance.metadata || {}, null, 2)}</pre>
      </details>
      <section className="methodology">
        <span>{t("CHECK BEFORE USE")}</span>
        <p>{t("Confirm the contract address before interacting. Collection owners may be able to change NFT metadata or media.")}
        </p>
      </section>
    </>
  );
}

function PoolPair({ pool, large = false }: { pool: AnyRow; large?: boolean }) {
  const name = (
    <>
      {pool.base_token_symbol || "?"} / {pool.quote_token_symbol || "?"}
    </>
  );
  return (
    <span className={cx("pool-pair", large && "large")}>
      <span className="pool-icons">
        {pool.base_token_icon_url ? (
          <img src={mediaUrl(pool.base_token_icon_url)} alt="" />
        ) : (
          <i>{pool.base_token_symbol?.[0]}</i>
        )}
        {pool.quote_token_icon_url ? (
          <img src={mediaUrl(pool.quote_token_icon_url)} alt="" />
        ) : (
          <i>{pool.quote_token_symbol?.[0]}</i>
        )}
      </span>
      <span>
        {large ? <h1>{name}</h1> : <strong>{name}</strong>}
        {large && <small>{pool.dex?.name || t("Decentralised exchange")}</small>}
      </span>
    </span>
  );
}

async function getPoolCatalogue() {
  const items: AnyRow[] = [];
  const seenCursors = new Set<string>();
  let query = "page_size=100";
  let latest: AnyRow = {};
  for (let page = 0; page < 100; page += 1) {
    latest = await get(`/contract-info/pools?${query}`);
    items.push(...(latest.items || []));
    if (!latest.next_page_params)
      return { ...latest, items, next_page_params: null };
    query = new URLSearchParams(
      Object.entries(latest.next_page_params).map(([key, value]) => [
        key,
        String(value),
      ]),
    ).toString();
    if (seenCursors.has(query))
      throw new Error(t("Pool catalogue returned a repeated cursor"));
    seenCursors.add(query);
  }
  throw new Error(t("Pool catalogue exceeded the safe pagination limit"));
}

function Pools() {
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  const initial = useMemo(() => new URLSearchParams(location.search), []);
  const initialOption = (key: string, allowed: string[], fallback: string) => {
    const value = initial.get(key);
    return value && allowed.includes(value) ? value : fallback;
  };
  const [query, setQuery] = useState(initial.get("q") || "");
  const [sortBy, setSortBy] = useState(
    initialOption(
      "sort",
      ["volume", "liquidity", "fee", "pair", "dex"],
      "volume",
    ),
  );
  const [order, setOrder] = useState(
    initialOption("order", ["asc", "desc"], "desc"),
  );
  const [minLiquidity, setMinLiquidity] = useState(
    initialOption("min_liquidity", ["0", "10000", "100000", "1000000"], "0"),
  );
  const [minVolume, setMinVolume] = useState(
    initialOption("min_volume", ["0", "1000", "10000", "100000"], "0"),
  );
  const [fee, setFee] = useState(initial.get("fee") || "all");
  const [dex, setDex] = useState(initial.get("dex") || "all");
  const [filtersOpen, setFiltersOpen] = useState(() =>
    minLiquidity !== "0" || minVolume !== "0" || fee !== "all" || dex !== "all",
  );
  const [pageSize, setPageSize] = useState(
    Number(initial.get("per_page")) === 50 ? 50 : 25,
  );
  const [page, setPage] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<number>();

  useEffect(() => {
    let stopped = false;
    let hasData = false;
    // Ink currently fits within the service's maximum page. Loading the full
    // catalogue keeps every client-side sort and threshold globally correct.
    const load = () => {
      if (document.visibilityState === "hidden") return;
      getPoolCatalogue()
        .then((next) => {
          if (stopped) return;
          hasData = true;
          setData(next);
          setUpdatedAt(Date.now());
          setError("");
        })
        .catch((e) => {
          // A transient refresh failure must not replace a valid market table.
          if (!stopped && !hasData) setError(e.message);
        });
    };
    setError("");
    load();
    const timer = window.setInterval(load, 10_000);
    const resume = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", resume);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);

  const pools: AnyRow[] = data?.items || [];
  const dexes = useMemo(
    () =>
      Array.from(
        new Set(
          pools.map((pool) => pool.dex?.name).filter(Boolean) as string[],
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [pools],
  );
  const fees = useMemo(
    () =>
      Array.from(
        new Set(
          pools
            .map((pool) => pool.fee)
            .filter((value) => value != null)
            .map(String),
        ),
      ).sort((a, b) => Number(a) - Number(b)),
    [pools],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const number = (value: unknown) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };
    const visible = pools.filter((pool) => {
      const text = [
        pool.base_token_symbol,
        pool.quote_token_symbol,
        pool.base_token_address,
        pool.quote_token_address,
        pool.pool_id,
        pool.dex?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      return (
        (!needle || text.includes(needle)) &&
        (dex === "all" || pool.dex?.name === dex) &&
        (fee === "all" || String(pool.fee) === fee) &&
        (number(pool.liquidity) || 0) >= Number(minLiquidity) &&
        (number(pool.volume_usd_24h) || 0) >= Number(minVolume)
      );
    });
    const textValue = (pool: AnyRow) =>
      sortBy === "pair"
        ? `${pool.base_token_symbol || ""}/${pool.quote_token_symbol || ""}`
        : pool.dex?.name || "";
    visible.sort((a, b) => {
      let result = 0;
      if (sortBy === "pair" || sortBy === "dex") {
        result = textValue(a).localeCompare(textValue(b), activeLocale, {
          sensitivity: "base",
        });
      } else {
        const key =
          sortBy === "liquidity"
            ? "liquidity"
            : sortBy === "fee"
              ? "fee"
              : "volume_usd_24h";
        const aValue = number(a[key]);
        const bValue = number(b[key]);
        if (aValue == null && bValue != null) return 1;
        if (aValue != null && bValue == null) return -1;
        result = (aValue || 0) - (bValue || 0);
      }
      if (!result) result = String(a.pool_id).localeCompare(String(b.pool_id));
      return order === "asc" ? result : -result;
    });
    return visible;
  }, [pools, query, dex, fee, minLiquidity, minVolume, sortBy, order]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visiblePools = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const activeFilters =
    Number(Boolean(query.trim())) +
    Number(dex !== "all") +
    Number(fee !== "all") +
    Number(minLiquidity !== "0") +
    Number(minVolume !== "0");
  const updateFilter = (update: () => void) => {
    update();
    setPage(0);
  };
  const resetFilters = () => {
    setQuery("");
    setSortBy("volume");
    setOrder("desc");
    setMinLiquidity("0");
    setMinVolume("0");
    setFee("all");
    setDex("all");
    setPage(0);
  };

  useEffect(() => {
    const url = new URL(location.href);
    const values: Record<string, string> = {
      q: query.trim(),
      sort: sortBy === "volume" ? "" : sortBy,
      order: order === "desc" ? "" : order,
      min_liquidity: minLiquidity === "0" ? "" : minLiquidity,
      min_volume: minVolume === "0" ? "" : minVolume,
      fee: fee === "all" ? "" : fee,
      dex: dex === "all" ? "" : dex,
      per_page: pageSize === 25 ? "" : String(pageSize),
    };
    Object.entries(values).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    });
    history.replaceState({}, "", `${url.pathname}${url.search}`);
  }, [query, sortBy, order, minLiquidity, minVolume, fee, dex, pageSize]);

  const sortLabel =
    sortBy === "liquidity"
      ? t("liquidity")
      : sortBy === "fee"
        ? t("feeTier")
        : sortBy === "pair"
          ? t("pair")
          : sortBy === "dex"
            ? t("dex")
            : t("volume24h");
  const toggleSort = (field: string) => {
    updateFilter(() => {
      if (sortBy === field) setOrder(order === "desc" ? "asc" : "desc");
      else {
        setSortBy(field);
        setOrder(field === "pair" || field === "dex" ? "asc" : "desc");
      }
    });
  };

  return (
    <>
      <PageIntro
        eyebrow={t("DEX POOLS")}
        title={t("poolDirectory")}
        text={t("poolIntro")}
      />
      <section className="pool-workbench" aria-label={t("poolFilters")}>
        <div className="pool-filter-top">
          <label className="pool-search">
            <Search />
            <input
              value={query}
              onChange={(event) =>
                updateFilter(() => setQuery(event.target.value))
              }
              placeholder={t("poolSearch")}
              aria-label={t("poolSearch")}
            />
          </label>
          <div className="pool-filter-status" aria-live="polite">
            <SlidersHorizontal />
            <span>
              {activeFilters
                ? `${activeFilters} ${t("filtersActive")}`
                : t("allMarkets")}
            </span>
            <button disabled={!activeFilters} onClick={resetFilters}>
              <RefreshCw /> {t("reset")}
            </button>
          </div>
        </div>
        <div id="pool-filter-options" className={cx("pool-filter-grid", filtersOpen && "expanded")}>
          <label>
            <span>{t("sortBy")}</span>
            <select
              value={sortBy}
              onChange={(event) =>
                updateFilter(() => setSortBy(event.target.value))
              }
            >
              <option value="volume">{t("volume24h")}</option>
              <option value="liquidity">{t("liquidity")}</option>
              <option value="fee">{t("feeTier")}</option>
              <option value="pair">{t("pair")}</option>
              <option value="dex">{t("dex")}</option>
            </select>
          </label>
          <label>
            <span>{t("order")}</span>
            <select
              value={order}
              onChange={(event) =>
                updateFilter(() => setOrder(event.target.value))
              }
            >
              <option value="desc">{t("highToLow")}</option>
              <option value="asc">{t("lowToHigh")}</option>
            </select>
          </label>
          <label>
            <span>{t("minLiquidity")}</span>
            <select
              value={minLiquidity}
              onChange={(event) =>
                updateFilter(() => setMinLiquidity(event.target.value))
              }
            >
              <option value="0">{t("anyAmount")}</option>
              <option value="10000">$10K+</option>
              <option value="100000">$100K+</option>
              <option value="1000000">$1M+</option>
            </select>
          </label>
          <label>
            <span>{t("minVolume")}</span>
            <select
              value={minVolume}
              onChange={(event) =>
                updateFilter(() => setMinVolume(event.target.value))
              }
            >
              <option value="0">{t("anyVolume")}</option>
              <option value="1000">$1K+</option>
              <option value="10000">$10K+</option>
              <option value="100000">$100K+</option>
            </select>
          </label>
          <label>
            <span>{t("feeTier")}</span>
            <select
              value={fee}
              onChange={(event) =>
                updateFilter(() => setFee(event.target.value))
              }
            >
              <option value="all">{t("anyFee")}</option>
              {fees.map((value) => (
                <option key={value} value={value}>
                  {value}%
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("dex")}</span>
            <select
              value={dex}
              onChange={(event) =>
                updateFilter(() => setDex(event.target.value))
              }
            >
              <option value="all">{t("allExchanges")}</option>
              {dexes.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className="pool-filter-toggle" aria-expanded={filtersOpen} aria-controls="pool-filter-options"
          onClick={() => setFiltersOpen(value => !value)}>
          <SlidersHorizontal aria-hidden="true" /> {t("poolFilters")} <ChevronDown aria-hidden="true" />
        </button>
        <div className="pool-result-bar">
          <strong>
            {filtered.length} {t("pools").toLocaleLowerCase()}
          </strong>
          <span>
            {t("sortedBy")} {sortLabel.toLocaleLowerCase()} ·{" "}
            {order === "desc" ? t("highToLow") : t("lowToHigh")}
          </span>
          <span
            className="pool-live-refresh"
            title={
              updatedAt
                ? new Date(updatedAt).toLocaleTimeString(activeLocale)
                : undefined
            }
          >
            <i /> {t("refresh10s")}
          </span>
        </div>
      </section>
      <div className="table-shell pool-shell">
        <div className="pool-table-head">
          <button onClick={() => toggleSort("pair")}>
            {t("pair")} {sortBy === "pair" && <ArrowDownUp />}
          </button>
          <button onClick={() => toggleSort("dex")}>
            {t("dex")} {sortBy === "dex" && <ArrowDownUp />}
          </button>
          <button onClick={() => toggleSort("fee")}>
            {t("feeTier")} {sortBy === "fee" && <ArrowDownUp />}
          </button>
          <button onClick={() => toggleSort("liquidity")}>
            {t("liquidity")} {sortBy === "liquidity" && <ArrowDownUp />}
          </button>
          <button onClick={() => toggleSort("volume")}>
            {t("volume24h")} {sortBy === "volume" && <ArrowDownUp />}
          </button>
        </div>
        {!data && !error ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} />
        ) : visiblePools.length ? (
          <div className="pool-list">
            {visiblePools.map((pool: any) => (
              <button
                className="pool-row"
                key={pool.pool_id}
                data-pool-id={pool.pool_id}
                data-liquidity={pool.liquidity ?? ""}
                data-volume={pool.volume_usd_24h ?? ""}
                data-fee={pool.fee ?? ""}
                onClick={() => go(`/pools/${pool.pool_id}`)}
              >
                <PoolPair pool={pool} />
                <span>{pool.dex?.name || "—"}</span>
                <span>{pool.fee == null ? "—" : `${pool.fee}%`}</span>
                <strong data-label={t("liquidity")}>
                  {money(pool.liquidity)}
                </strong>
                <strong data-label={t("volume24h")}>
                  {money(pool.volume_usd_24h)}
                </strong>
                <ArrowRight />
              </button>
            ))}
          </div>
        ) : (
          <Empty />
        )}
        {!!filtered.length && (
          <div className="pool-pagination">
            <label>
              <span>{t("rows")}</span>
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(0);
                }}
              >
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
            </label>
            <span>
              {page * pageSize + 1}–
              {Math.min((page + 1) * pageSize, filtered.length)} {t("of")}{" "}
              {filtered.length}
            </span>
            <button
              aria-label={t("previousPoolPage")}
              disabled={page === 0}
              onClick={() => setPage((value) => Math.max(0, value - 1))}
            >
              <ChevronLeft />
            </button>
            <button
              aria-label={t("nextPoolPage")}
              disabled={page + 1 >= pageCount}
              onClick={() =>
                setPage((value) => Math.min(pageCount - 1, value + 1))
              }
            >
              <ChevronRight />
            </button>
          </div>
        )}
      </div>
      <section className="methodology">
        <span>{t("MARKET DATA")}</span>
        <p>{t("Pool and price data comes from Blockscout Contract Info and GeckoTerminal. Thin markets can show delayed or misleading values.")}
        </p>
      </section>
    </>
  );
}

// Pool market fields come from Contract Info/GeckoTerminal; contract identity,
// verification and activity still come from the canonical Ink index.
function PoolDetail({ id }: { id: string }) {
  const [pool, setPool] = useState<any>();
  const [address, setAddress] = useState<any>();
  const [counters, setCounters] = useState<any>({});
  const [transactions, setTransactions] = useState<any>();
  const [error, setError] = useState("");
  const dataRequest = useRef(0);
  useEffect(() => {
    const request = ++dataRequest.current;
    setError("");
    setPool(undefined);
    Promise.all([
      get(`/contract-info/pools/${id}`),
      get(`/explorer/addresses/${id}`),
      get(`/explorer/addresses/${id}/counters`),
      get(`/explorer/addresses/${id}/transactions`),
    ])
      .then(([market, account, count, activity]) => {
        if (request !== dataRequest.current) return;
        setPool(market);
        setAddress(account);
        setCounters(count);
        setTransactions(activity);
      })
      .catch(
        (e) => request === dataRequest.current && setError(e.message),
      );
  }, [id]);
  if (!pool && !error) return <Loading />;
  if (error) return <ErrorState error={error} />;
  return (
    <>
      <section className="pool-hero">
        <div>
          <span>{t("pool").toUpperCase()} · {network.name.toUpperCase()}</span>
          <PoolPair pool={pool} large />
          <Copyable value={id} display={id} />
        </div>
        <div className="pool-actions">
          <button onClick={() => go(`/address/${id}`)}>
            {t("openAddress")} <ArrowRight />
          </button>
          {externalDestination(pool.coin_gecko_terminal_url) && (
            <a
              href={externalDestination(pool.coin_gecko_terminal_url)}
              target="_blank"
              rel="noreferrer"
            >
              {t("openTerminal")} <ExternalLink />
            </a>
          )}
        </div>
      </section>
      <section className="address-summary">
        <Metric
          label={t("liquidity")}
          value={money(pool.liquidity)}
          note={t("USD value reported by market index")}
        />
        <Metric
          label={t("volume24h")}
          value={money(pool.volume_usd_24h)}
          note={t("Reported 24-hour volume")}
        />
        <Metric
          label={t("feeTier")}
          value={pool.fee == null ? "—" : `${pool.fee}%`}
          note={pool.dex?.name}
        />
        <Metric
          label={t("transactions")}
          value={compact(counters.transactions_count)}
          note={tf("{count} token transfers", { count: compact(counters.token_transfers_count) })}
        />
      </section>
      <section className="pool-detail-grid">
        <article>
          <span>{t("baseToken").toUpperCase()}</span>
          <h2>{pool.base_token_symbol}</h2>
          <Copyable
            value={pool.base_token_address}
            display={pool.base_token_address}
            link={`/token/${pool.base_token_address}`}
          />
          <dl>
            <div>
              <dt>{t("Market cap")}</dt>
              <dd>{money(pool.base_token_market_cap_usd)}</dd>
            </div>
            <div>
              <dt>{t("Fully diluted value")}</dt>
              <dd>{money(pool.base_token_fully_diluted_valuation_usd)}</dd>
            </div>
          </dl>
        </article>
        <article>
          <span>{t("quoteToken").toUpperCase()}</span>
          <h2>{pool.quote_token_symbol}</h2>
          <Copyable
            value={pool.quote_token_address}
            display={pool.quote_token_address}
            link={`/token/${pool.quote_token_address}`}
          />
          <dl>
            <div>
              <dt>{t("Market cap")}</dt>
              <dd>{money(pool.quote_token_market_cap_usd)}</dd>
            </div>
            <div>
              <dt>{t("Fully diluted value")}</dt>
              <dd>{money(pool.quote_token_fully_diluted_valuation_usd)}</dd>
            </div>
          </dl>
        </article>
        <article className="pool-contract">
          <span>{t("POOL CONTRACT")}</span>
          <h2>
            {address?.implementations?.[0]?.name ||
              address?.name || t("Automated market maker")}
          </h2>
          <dl>
            <div>
              <dt>{t("verified")}</dt>
              <dd>{address?.is_verified ? t("Yes") : t("No")}</dd>
            </div>
            <div>
              <dt>{t("proxyType")}</dt>
              <dd>{address?.proxy_type || t("None")}</dd>
            </div>
            <div>
              <dt>{t("reputation")}</dt>
              <dd>{address?.reputation || "—"}</dd>
            </div>
            <div>
              <dt>{t("dex")}</dt>
              <dd>{pool.dex?.name || "—"}</dd>
            </div>
          </dl>
        </article>
      </section>
      <section className="live-section pool-activity">
        <SectionTitle eyebrow={t("POOL TRANSACTIONS")} title={t("latestActivity")} />
        <div className="panel">
          {transactions?.items?.length ? (
            transactions.items
              .slice(0, 10)
              .map((tx: any) => <TxRow key={tx.hash} tx={tx} />)
          ) : (
            <Empty />
          )}
        </div>
      </section>
      <section className="methodology">
        <span>{t("CHECK BEFORE USE")}</span>
        <p>{t("Confirm both token addresses. Liquidity and volume come from third-party market data and can change quickly.")}
        </p>
      </section>
    </>
  );
}

function HolderRow({
  item,
  decimals,
  symbol,
}: {
  item: AnyRow;
  decimals: number;
  symbol: string;
}) {
  const addr = addressOf(item.address),
    value = scaled(item.value, decimals);
  return (
    <div className="holder-row">
      <div>
        <Copyable
          value={addr}
          display={labelOf(item.address) || short(addr, 10, 8)}
          link={`/address/${addr}`}
        />
        <small>{item.address?.is_contract ? t("Contract") : t("Account")}</small>
      </div>
      <strong>
        {num(value, 6)} <small>{symbol}</small>
      </strong>
    </div>
  );
}

function AdvancedPage({ initialMode = "deposits" }: { initialMode?: string }) {
  const [mode, setMode] = useState(initialMode);
  const [data, setData] = useState<any>();
  const [params, setParams] = useState("");
  const [error, setError] = useState("");
  const dataRequest = useRef(0);
  const paths: AnyRow = {
    deposits: "optimism/deposits",
    withdrawals: "optimism/withdrawals",
    userops: "proxy/account-abstraction/operations",
  };
  useEffect(() => {
    const request = ++dataRequest.current;
    setData(undefined);
    setError("");
    get(`/explorer/${paths[mode]}${params}`)
      .then((value) => request === dataRequest.current && setData(value))
      .catch(
        (e) => request === dataRequest.current && setError(e.message),
      );
  }, [mode, params]);
  return (
    <>
      <PageIntro
        eyebrow={t("BRIDGE & AA")}
        title={t("Advanced activity")}
        text={t("Ink deposits, withdrawals and ERC‑4337 user operations.")}
      >
        <div className="advanced-mark">
          <Layers3 />
          <span>
            OP STACK
            <br />
            ERC‑4337
          </span>
        </div>
      </PageIntro>
      <details className="explorer-tools"><summary>{t("Explorer tools")}</summary><Suspense fallback={<Loading />}><ExplorerDirectory t={t} go={go} /></Suspense></details>
      <SectionTabs value={mode} onChange={value => { setMode(value); setParams(""); }} items={[
        ["deposits", t("L1 → L2 deposits")], ["withdrawals", t("L2 → L1 withdrawals")],
        ["userops", t("User operations")],
      ]} />
      <section className="protocol-note">
        <TerminalSquare />
        <div>
          <strong>
            {mode === "deposits"
              ? t("Messages entering Ink")
              : mode === "withdrawals"
                ? t("Messages exiting Ink")
                : t("ERC‑4337 smart accounts")}
          </strong>
          <p>
            {mode === "deposits"
              ? t("Deposits originate on Ethereum and are executed as transactions on Ink.")
              : mode === "withdrawals"
                ? t("Withdrawals pass through the Optimism proving and challenge lifecycle before finalization.")
                : t("Bundled operations executed through an EntryPoint contract, with their fee and inclusion transaction.")}
          </p>
        </div>
      </section>
      <div className="table-shell advanced-list">
        <div className="table-toolbar">
          <span>
            {data ? tf("shown", { count: num(data.items?.length || 0) }) : t("Loading records")}
          </span>
          <span>{t("Ink index")}</span>
        </div>
        {!data && !error ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} />
        ) : data.items?.length ? (
          data.items.map((item: any, i: number) => (
            <ProtocolRow
              key={item.hash || item.l2_transaction_hash || i}
              item={item}
              mode={mode}
            />
          ))
        ) : (
          <Empty>{t("No records found.")}</Empty>
        )}
        {data && (
          <Pagination
            next={data.next_page_params}
            onNext={() =>
              setParams(
                `?${new URLSearchParams(
                  Object.entries(data.next_page_params)
                    .filter(([, v]) => v != null)
                    .map(([k, v]) => [k, String(v)]),
                ).toString()}`,
              )
            }
            onReset={() => setParams("")}
          />
        )}
      </div>
    </>
  );
}

function ProtocolRow({ item, mode }: { item: AnyRow; mode: string }) {
  if (mode === "userops") {
    const addr = addressOf(item.address);
    return (
      <div className="protocol-row">
        <StatusPill ok={Boolean(item.status)}>
          {item.status ? t("Success") : t("Failed")}
        </StatusPill>
        <div>
          <Copyable value={item.hash} display={short(item.hash, 10, 8)} link={`/op/${item.hash}`} />
          <small>
            {age(item.timestamp)} · EntryPoint {item.entry_point_version}
          </small>
        </div>
        <div>
          <small>{t("Smart account")}</small>
          <Copyable value={addr} link={`/address/${addr}`} />
        </div>
        <div>
          <small>{t("Included in")}</small>
          <Copyable
            value={item.transaction_hash}
            link={`/tx/${item.transaction_hash}`}
          />
        </div>
        <strong>{eth(item.fee, 9)}</strong>
      </div>
    );
  }
  const withdrawal = mode === "withdrawals",
    hash = item.l2_transaction_hash;
  return (
    <div className="protocol-row">
      <span className="method">{withdrawal ? "withdrawal" : "deposit"}</span>
      <div>
        <Copyable value={hash} link={`/tx/${hash}`} />
        <small>
          {age(withdrawal ? item.l2_timestamp : item.l1_block_timestamp)}
        </small>
      </div>
      <div>
        <small>{withdrawal ? t("From") : t("L1 origin")}</small>
        <Copyable
          value={withdrawal ? addressOf(item.from) : item.l1_transaction_origin}
          link={withdrawal ? `/address/${addressOf(item.from)}` : undefined}
        />
      </div>
      <div>
        <small>{t("L1 transaction")}</small>
        {item.l1_transaction_hash ? (
          <Copyable value={item.l1_transaction_hash} />
        ) : (
          <span>{item.status || t("Pending")}</span>
        )}
      </div>
      <strong>
        {withdrawal
          ? eth(item.msg_value)
          : `${num(item.l2_transaction_gas_limit)} gas`}
      </strong>
    </div>
  );
}

function DevelopersPage() {
  return (
    <>
      <PageIntro
        eyebrow={t("API & STREAM")}
        title={t("Developer API")}
        text={t("Read-only explorer routes, live WebSocket events and local node status.")}
      />
      <section className="developer-grid">
        <article>
          <TerminalSquare />
          <span>{t("EXPLORER API")}</span>
          <h2>{t("Chain data")}</h2>
          <code>{API}/explorer/blocks</code>
          <code>{API}/explorer/transactions</code>
          <code>{API}/explorer/tokens</code>
          <p>{t("Blockscout API v2 data. Responses are cached locally; the last valid response is used during rate limits.")}
          </p>
        </article>
        <article>
          <Activity />
          <span>{t("LIVE STREAM")}</span>
          <h2>WebSocket</h2>
          <code>{liveWebSocketUrl}</code>
          <code>ink-observer.live.v1</code>
          <code>{API}/live/status</code>
          <p>{t("New block and node-status messages every two seconds. Frames include sequence IDs and timestamps; clients reconnect automatically.")}
          </p>
        </article>
        <article>
          <BarChart3 />
          <span>{t("NODE & STATS")}</span>
          <h2>{t("Node and charts")}</h2>
          <code>{API}/network</code>
          <code>{API}/stats/counters</code>
          <code>{API}/stats/lines/activeAccounts</code>
          <p>{t("Current OP-Reth status, Blockscout counters and the time series used on the analytics page.")}
          </p>
        </article>
      </section>
      <section className="methodology">
        <span>{t("SECURITY")}</span>
        <p>
          {t("Indexed data uses GET and WebSocket. POST /contract-rpc only allows reads and simulations; the server cannot sign or broadcast.").replace("/contract-rpc", `${API}/contract-rpc`)}
        </p>
        <p>{t("Your wallet submits a contract transaction only after you confirm it. Keep local node credentials on the server.")}
        </p>
      </section>
    </>
  );
}

function Contracts() {
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  const [params, setParams] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setData(undefined); setError("");
    get(`/explorer/smart-contracts${params}`, controller.signal)
      .then(value => !controller.signal.aborted && setData(value))
      .catch(e => !controller.signal.aborted && setError(e.message));
    return () => controller.abort();
  }, [params]);
  return (
    <>
      <PageIntro
        eyebrow={t("VERIFIED SOURCE")}
        title={`${t("verified")} ${t("contracts").toLowerCase()}`}
        text={t("contractDirectory")}
      >
        <SearchBox compact />
      </PageIntro>
      <div className="contract-grid">
        {!data && !error ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} />
        ) : (
          data.items?.map((contract: any) => (
            <button
              className="contract-card"
              key={contract.address?.hash || contract.address_hash}
              onClick={() =>
                go(
                  `/address/${contract.address?.hash || contract.address_hash}`,
                )
              }
            >
              <div>
                <FileCode2 />
                <StatusPill ok>{t("verified")}</StatusPill>
              </div>
              <h2>
                {contract.name || contract.address?.name || t("smartContract")}
              </h2>
              <span className="mono">
                {short(contract.address?.hash || contract.address_hash, 10, 8)}
              </span>
              <footer>
                <span>{contract.language || "Solidity"}</span>
                <span>{contract.compiler_version || t("Source available")}</span>
              </footer>
            </button>
          ))
        )}
      </div>
      {data && <Pagination next={data.next_page_params} onNext={() => setParams(cursorQuery(data.next_page_params))} onReset={() => setParams("")} />}
    </>
  );
}

function StatChart({ title, note, metric, color, formatValue = compact, refresh, enableData = false }: {
  title: string;
  note: string;
  metric: string;
  color?: string;
  formatValue?: (value: number) => string;
  refresh: number;
  enableData?: boolean;
}) {
  const [period, setPeriod] = useState(30);
  const [data, setData] = useState<AnyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [showData, setShowData] = useState(false);
  const [visible, setVisible] = useState(!enableData);
  const chartRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!enableData || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "200px" });
    if (chartRef.current) observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, [enableData]);
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    get(`/stats/lines/${metric}${chartQuery(period)}`, controller.signal)
      .then(result => {
        if (!controller.signal.aborted) setData([...(result.chart || [])].sort((a, b) => String(a.date).localeCompare(String(b.date))));
      })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [metric, period, refresh, retry, visible]);
  const points = data.map(row => Number(row.value));
  return <article ref={chartRef} className="stat-chart" aria-label={title} aria-busy={loading}>
    <div className="stat-chart-heading">
      {enableData ? <h2>{title}</h2> : <h3>{title}</h3>}
      <ChartRange title={title} value={period} onChange={setPeriod} options={enableData ? [...chartRanges,[0,"All time"]] : chartRanges} />
    </div>
    <strong className="stat-chart-value">{loading || error ? "—" : points.length ? formatValue(points.at(-1)!) : "—"}</strong>
    {loading ? <div className="chart-loading" role="status">{t("loadingRecords")}</div>
      : error ? <div className="chart-error" role="status"><span>{t("Data source unavailable")}</span><button onClick={() => setRetry(value => value + 1)}>{t("retry")}</button></div>
      : <Sparkline key={period} points={points} labels={data.map(row => row.date)} color={color} height={130}
          formatValue={formatValue} ariaLabel={title} approximateLast={Boolean(data.at(-1)?.is_approximate)} />}
    <div className="chart-axis"><span>{t(period === 0 || period >= 365 ? "Weekly" : "Daily")}</span><span>{!loading && !error && data.length ? `${dateText(data[0].date)} – ${dateText(data.at(-1)?.date)}` : ""}</span></div>
    <p>{note}</p>
    {enableData && <details className="chart-data" onToggle={event => setShowData(event.currentTarget.open)}><summary>{t("Data")}</summary><button className="text-link" disabled={loading || !!error || !data.length} onClick={()=>downloadCsv(`ink-${network.chainId}-${metric}.csv`,["date","date_to","value","approximate"],data.map(item=>[item.date,item.date_to,item.value,item.is_approximate ?? false]))}><Download size={16}/>{t("exportPage")}</button>{showData && !loading && !error && <table><caption className="sr-only">{title}</caption><thead><tr><th>{t("Date")}</th><th>{t("Raw value")}</th></tr></thead><tbody>{data.map((row,index)=><tr key={`${row.date}:${index}`}><td>{dateText(row.date)}</td><td className="mono">{String(row.value)}{row.is_approximate ? ` · ${t("Incomplete interval")}` : ""}</td></tr>)}</tbody></table>}</details>}
  </article>;
}

function AnalyticsIntro({ loading, showData = false, onData, onCsv, onRefresh }: {
  loading: boolean;
  showData?: boolean;
  onData?: () => void;
  onCsv?: () => void;
  onRefresh: () => void;
}) {
  return (
      <PageIntro
        eyebrow={t("NETWORK STATS")}
        title={t("Ink analytics")}
        text={t("Compare transactions, active accounts, fees and success rate. Select a range or inspect any chart point.")}
      >
        <div className="analytics-controls">
          <div className="analytics-actions">
            <button onClick={onData} disabled={!onData} className={showData ? "active" : ""}>
              <Table2 />{t("Data")}
            </button>
            <button onClick={onCsv} disabled={loading || !onCsv}>
              <Download /> CSV
            </button>
            <button
              aria-label={t("Refresh analytics")}
              disabled={loading}
              onClick={onRefresh}
            >
              <RefreshCw />
            </button>
          </div>
        </div>
      </PageIntro>
  );
}

function BlockUtilization({ refresh }: { refresh: number }) {
  const [blocks, setBlocks] = useState<any[]>([]);
  const [blockCount, setBlockCount] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    get("/explorer/blocks", controller.signal)
      .then(result => { if (!controller.signal.aborted) setBlocks(result.items || []); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh, retry]);
  const rows = blocks.slice(0, blockCount).reverse();
  const util = rows.map(block => Number(block.gas_used_percentage));
  return <div className="analytic-card block-utilization" aria-busy={loading}>
    <div className="analytic-label">
      <Gauge />
      <span>{t("Recent block utilization")}</span>
      <ChartRange title={t("Recent block utilization")} value={blockCount} onChange={setBlockCount}
        options={[[10, tf("chartBlocks", { count: 10 })], [25, tf("chartBlocks", { count: 25 })], [50, tf("chartBlocks", { count: 50 })]]} />
      <strong>{loading || error ? "—" : unit(util.length ? util.reduce((a, b) => a + b, 0) / util.length : undefined, "%")}</strong>
    </div>
    {loading ? <div className="chart-loading" role="status">{t("loadingRecords")}</div>
      : error ? <div className="chart-error" role="status"><span>{t("Data source unavailable")}</span><button onClick={() => setRetry(value => value + 1)}>{t("retry")}</button></div>
      : <Sparkline points={util} labels={rows.map(block => block.timestamp)} color="#0c8b68"
          formatValue={value => `${value.toFixed(2)}%`} ariaLabel={t("Gas utilization for recent blocks")} />}
    <p>{t("Gas used as a share of capacity in the latest indexed blocks.")}</p>
  </div>;
}

function Analytics() {
  const ranges = [7, 30, 90, 180, 365];
  const queryRange = Number(new URLSearchParams(location.search).get("range"));
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  const [period, setPeriod] = useState(
    ranges.includes(queryRange) ? queryRange : 30,
  );
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showData, setShowData] = useState(false);
  const dataTableRef = useRef<HTMLElement>(null);
  const dataRequest = useRef(0);
  const displayedPeriod = data?.period ?? period;
  const grain = displayedPeriod >= 365 ? "WEEK" : "DAY";
  const choosePeriod = (days: number) => {
    setPeriod(days);
    const u = new URL(location.href);
    u.searchParams.set("range", String(days));
    history.replaceState({}, "", `${u.pathname}${u.search}`);
  };
  useEffect(() => {
    const request = ++dataRequest.current;
    const controller = new AbortController();
    const load = (path: string) => get(path, controller.signal);
    const q = chartQuery(period);
    setLoading(true);
    setError("");
    Promise.all([
      load("/explorer/stats?gas_oracle=updated"),
      load(`/stats/lines/newTxns${q}`),
      load("/stats/counters"),
      load(`/stats/lines/activeAccounts${q}`),
      load(`/stats/lines/newAccounts${q}`),
      load(`/stats/lines/averageTxnFee${q}`),
      load(`/stats/lines/txnsSuccessRate${q}`),
      load(`/stats/lines/newBlocks${q}`),
      load(`/stats/lines/activeAccounts${chartQuery(8)}`),
    ])
      .then(
        ([
          stats,
          chart,
          counters,
          active,
          newAccounts,
          fees,
          success,
          newBlocks,
          dailyActive,
        ]) => {
          if (request !== dataRequest.current) return;
          setData({
            stats,
            period,
            chart: chart.chart || [],
            counters: counters.counters || [],
            active: active.chart || [],
            dailyActive: dailyActive.chart || [],
            newAccounts: newAccounts.chart || [],
            fees: fees.chart || [],
            success: success.chart || [],
            newBlocks: newBlocks.chart || [],
            updatedAt: new Date().toISOString(),
          });
        },
      )
      .catch((e) => request === dataRequest.current && setError(e.message))
      .finally(() => { if (request === dataRequest.current) setLoading(false); });
    return () => { dataRequest.current++; controller.abort(); };
  }, [period, refresh]);
  if (!data) return <>
    <AnalyticsIntro loading={loading} onRefresh={() => setRefresh(value => value + 1)} />
    {error ? <ErrorState error={error} onRetry={() => setRefresh(value => value + 1)} /> : <Loading label={t("Calculating network signals")} />}
  </>;
  const ordered = (rows: any[]) =>
    [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const dailyActive = ordered(data.dailyActive);
  const priorActive = dailyActive.slice(-8, -1);
  const priorActiveAverage = priorActive.reduce((sum, row) => sum + Number(row.value), 0) / Math.max(1, priorActive.length);
  const c = ordered(data.chart),
    vals = c.map((x: any) => Number(x.value)),
    labels = c.map((x: any) => x.date),
    avg = vals.length
      ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length
      : undefined,
    peak = vals.length ? Math.max(...vals) : undefined,
    total = vals.length
      ? vals.reduce((a: number, b: number) => a + b, 0)
      : undefined;
  const counter = Object.fromEntries(data.counters.map((x: any) => [x.id, x]));
  const rows = (key: string) => ordered(data[key]);
  const lookup = (key: string) =>
    new Map(rows(key).map((x: any) => [x.date, Number(x.value)]));
  const maps = {
    active: lookup("active"),
    accounts: lookup("newAccounts"),
    fees: lookup("fees"),
    success: lookup("success"),
    blocks: lookup("newBlocks"),
  };
  const exportCsv = () => {
    const csv = [
      [
        "date",
        "transactions",
        "active_accounts",
        "new_accounts",
        "average_fee_eth",
        "success_rate",
        "blocks",
      ],
      ...c.map((x: any) => [
        x.date,
        x.value,
        maps.active.get(x.date) ?? "",
        maps.accounts.get(x.date) ?? "",
        maps.fees.get(x.date) ?? "",
        maps.success.get(x.date) ?? "",
        maps.blocks.get(x.date) ?? "",
      ]),
    ]
      .map((row) => row.join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `ink-analytics-${displayedPeriod}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const toggleData = () => {
    if (showData) {
      setShowData(false);
      return;
    }
    setShowData(true);
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        dataTableRef.current?.scrollIntoView({
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
          block: "start",
        }),
      ),
    );
  };
  return (
    <>
      <AnalyticsIntro loading={loading} showData={showData} onData={toggleData} onCsv={error ? undefined : exportCsv} onRefresh={() => setRefresh(value => value + 1)} />
      <section className="analytics-counters">
        <Metric
          label={t("Active accounts")}
          value={compact(dailyActive.at(-1)?.value)}
          note={tf("latest {grain}", { grain: t("Daily") })}
        />
        <Metric
          label={t("Contracts today")}
          value={compact(counter.lastNewContracts?.value)}
          note={tf("{count} verified", { count: compact(counter.lastNewVerifiedContracts?.value) })}
        />
        <Metric
          label={t("Account abstraction")}
          value={compact(counter.totalUserOps?.value)}
          note={tf("{count} AA wallets", { count: compact(counter.totalAccountAbstractionWallets?.value) })}
        />
        <Metric
          label={t("Fees · 24h")}
          value={unit(counter.txnsFee24h?.value, " ETH", 4)}
          note={tf("{value} average", { value: unit(counter.averageTxnFee24h?.value, " ETH", 8) })}
        />
        <Metric
          label={t("Token contracts")}
          value={compact(counter.totalTokens?.value)}
          note={tf("{count} verified contracts", { count: compact(counter.totalVerifiedContracts?.value) })}
        />
      </section>
      <section className="analytics-freshness">
        <span>
          {tf("{grain} granularity · {count} observations", { grain: t(grain === "DAY" ? "Daily" : "Weekly"), count: num(c.length) })}
        </span>
        <span>{tf("Updated {time} · latest interval may be partial", { time: new Date(data.updatedAt).toLocaleTimeString(activeLocale) })}</span>
      </section>
      <section className="analytics-lead" aria-busy={loading}>
        <div>
          <div className="lead-chart-heading">
          <span>
            {tf("{grain} TRANSACTIONS · {period}", { grain: t(grain === "DAY" ? "Daily" : "Weekly").toUpperCase(), period: displayedPeriod === 365 ? t("1 YEAR") : tf("{count} DAYS", { count: num(displayedPeriod) }) })}
          </span>
          <ChartRange title={t("Transactions")} value={period} onChange={choosePeriod} />
          </div>
          <strong>{compact(vals.at(-1))}</strong>
          {loading ? <div className="chart-loading lead-chart-status" role="status">{t("loadingRecords")}</div>
            : error ? <div className="chart-error lead-chart-status" role="status"><span>{t("Data source unavailable")}</span><button onClick={() => setRefresh(value => value + 1)}>{t("retry")}</button></div>
            : <Sparkline
            points={vals}
            labels={labels}
            height={220}
            ariaLabel={tf("{grain} transactions over {days} days", { grain: t(grain === "DAY" ? "Daily" : "Weekly"), days: num(period) })}
            approximateLast={Boolean(c.at(-1)?.is_approximate)}
          />}
          <div className="chart-axis">
            <span>{dateText(c[0]?.date)}</span>
            <span>{dateText(c.at(-1)?.date)}</span>
          </div>
        </div>
        <aside>
          <Metric
            label={t("Period average")}
            value={compact(avg)}
            note={tf("{grain} transactions", { grain: t(grain === "DAY" ? "Daily" : "Weekly") })}
          />
          <Metric
            label={t("Period total")}
            value={compact(total)}
            note={tf("{count} observations", { count: num(c.length) })}
          />
          <Metric
            label={t("Period high")}
            value={compact(peak)}
            note={
              peak === undefined
                ? t("Observation unavailable")
                : dateText(c[vals.indexOf(peak)]?.date)
            }
          />
        </aside>
      </section>
      {showData && (
        <section className="analytics-data" ref={dataTableRef}>
          <div className="panel-head">
            <h3>{t("Exact values")}</h3>
            <span>
              {tf("{count} DAY RANGE", { count: num(displayedPeriod) })} · {t(grain === "DAY" ? "Daily" : "Weekly")}
            </span>
          </div>
          <p className="table-scroll-hint">{t("tableScrollHint")}</p>
          <div className="data-scroll" role="region" aria-label={t("Exact values")} tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th scope="col">{t("Date")}</th>
                  <th scope="col">{t("Transactions")}</th>
                  <th scope="col">{t("Active accounts")}</th>
                  <th scope="col">{t("New accounts")}</th>
                  <th scope="col">{t("Success")}</th>
                  <th scope="col">{t("Avg. fee")}</th>
                  <th scope="col">{t("Blocks")}</th>
                </tr>
              </thead>
              <tbody>
                {c.map((item: any) => {
                  const active = maps.active.get(item.date),
                    accounts = maps.accounts.get(item.date),
                    fee = maps.fees.get(item.date),
                    rate = maps.success.get(item.date),
                    blocks = maps.blocks.get(item.date);
                  return (
                    <tr key={item.date}>
                      <th scope="row">{dateText(item.date)}</th>
                      <td>{num(item.value)}</td>
                      <td>{num(active)}</td>
                      <td>{num(accounts)}</td>
                      <td>
                        {rate == null ? "—" : `${(rate * 100).toFixed(2)}%`}
                      </td>
                      <td>{fee == null ? "—" : `${fee.toFixed(9)} ETH`}</td>
                      <td>{num(blocks)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <section className="analytics-grid">
        <BlockUtilization refresh={refresh} />
        <div className="analytic-card">
          <div className="analytic-label">
            <Fuel />
            <span>{t("Gas price")}</span>
            <strong>{gasPrice(data.stats.gas_prices?.average)}</strong>
          </div>
          <div className="gas-scale">
            <span>
              <i style={{ width: "34%" }} />
              {t("Slow")} · {gasPrice(data.stats.gas_prices?.slow)}
            </span>
            <span>
              <i style={{ width: "58%" }} />
              {t("Standard")} · {gasPrice(data.stats.gas_prices?.average)}
            </span>
            <span>
              <i style={{ width: "82%" }} />
              {t("Fast")} · {gasPrice(data.stats.gas_prices?.fast)}
            </span>
          </div>
          <p>{t("Slow, standard and fast estimates reported by Blockscout.")}</p>
        </div>
        <div className="analytic-card">
          <div className="analytic-label">
            <Timer />
            <span>{t("Block cadence")}</span>
            <strong>
              {unit(
                finiteNumber(data.stats.average_block_time) === null
                  ? undefined
                  : Number(data.stats.average_block_time) / 1000,
                "s",
                3,
              )}
            </strong>
          </div>
          <div className="cadence">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <p>{t("Average time between indexed Ink blocks.")}</p>
        </div>
        <div className="analytic-card dark">
          <div className="analytic-label">
            <TrendingUp />
            <span>{t("All-time totals")}</span>
            <strong>{compact(data.stats.total_transactions)}</strong>
          </div>
          <dl>
            <div>
              <dt>{t("Blocks indexed")}</dt>
              <dd>{compact(data.stats.total_blocks)}</dd>
            </div>
            <div>
              <dt>{t("Gas used today")}</dt>
              <dd>{compact(data.stats.gas_used_today)}</dd>
            </div>
            <div>
              <dt>{t("ETH reference")}</dt>
              <dd>{money(data.stats.coin_price)}</dd>
            </div>
          </dl>
        </div>
      </section>
      <section className="stat-library">
        <SectionTitle
          eyebrow={t("NETWORK STATS")}
          title={t("Accounts, fees and reliability")}
        />
        <div className="stat-chart-grid">
          <StatChart title={t("Active accounts")} note={t("Accounts active during each interval.")} metric="activeAccounts" color="#7136f3" refresh={refresh} />
          <StatChart title={t("New accounts")} note={t("Addresses first seen during each interval.")} metric="newAccounts" color="#d45b31" refresh={refresh} />
          <StatChart title={t("Transaction success")} note={t("Transactions completed without a revert.")} metric="txnsSuccessRate" formatValue={value => `${(value * 100).toFixed(2)}%`} color="#087d5b" refresh={refresh} />
          <StatChart title={t("Average transaction fee")} note={t("Average execution and L1 data fee.")} metric="averageTxnFee" formatValue={value => `${value.toFixed(9)} ETH`} color="#222226" refresh={refresh} />
          <StatChart title={t("Blocks produced")} note={t("Blocks added during each interval.")} metric="newBlocks" color="#2b70c9" refresh={refresh} />
          <div className="stat-chart statement">
            <span>{t("7-DAY COMPARISON")}</span>
            <strong>{dailyActive.length < 8
              ? t("The latest active-account comparison is unavailable.")
              : Number(dailyActive.at(-1)?.value) > priorActiveAverage
                ? t("Active accounts are above the previous 7-day average.")
                : t("Active accounts are below the previous 7-day average.")}</strong>
            <p>{t("chartReadingNote")}</p>
          </div>
        </div>
      </section>
      <section className="counter-library">
        <SectionTitle eyebrow={t("TOTALS")} title={t("Network totals")} />
        <div>
          {data.counters.map((item: any) => (
            <article key={item.id}>
              <span>{item.title}</span>
              <strong>
                {item.units === "ETH"
                  ? unit(item.value, " ETH", 8)
                  : compact(item.value)}
              </strong>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="methodology">
        <span>{t("DATA SOURCES")}</span>
        <p>{t("Charts and totals come from Ink’s Blockscout statistics API. Head, peers and finality come from the OP-Reth and OP Node running on this machine. The latest interval may be incomplete.")}
        </p>
      </section>
    </>
  );
}

function NetworkPage({ live }: { live: LiveData }) {
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = () =>
      get("/network")
        .then((d) => active && setData(d))
        .catch((e) => setError(e.message));
    load();
    const t = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);
  useEffect(() => {
    if (live.network) setData(live.network);
  }, [live.sequence]);
  if (!data && !error) return <Loading />;
  if (error && !data) return <ErrorState error={error} />;
  const used = data.disk ? data.disk.total - data.disk.free : 0,
    pct = data.disk ? (used / data.disk.total) * 100 : 0;
  const rpcUpstreams = data.l1Rpc?.upstreams || [],
    rpcReady = rpcUpstreams.filter((item: any) => item.available).length;
  return (
    <>
      <PageIntro
        eyebrow={t("LOCAL NODE")}
        title={t("Network health")}
        text={t("OP-Reth and OP Node status reported by this machine.")}
      />
      <section className="health-banner">
        <div>
          <Activity />
          <div>
            <span>{t("STATUS")}</span>
            <h2>{data.online ? data.synced ? data.derivation?.synced === false ? t("rollupBehind") : tf("Synced to {network}", { network: network.name }) : data.stale ? tf("{network} node behind", { network: network.name }) : tf("Syncing {network}", { network: network.name }) : tf("{network} node unavailable", { network: network.name })}</h2>
            <p>{tf("Checked {time} · refreshes every five seconds", { time: new Date(data.sampledAt).toLocaleTimeString(activeLocale) })}</p>
          </div>
        </div>
        <StatusPill ok={data.online && data.synced && data.derivation?.synced !== false}>{data.online ? data.synced ? data.derivation?.synced === false ? t("Behind") : t("Operational") : data.stale ? t("Behind") : t("Syncing") : t("Unavailable")}</StatusPill>
      </section>
      {data.derivation?.synced === false && <section className="sync-progress" aria-label={t("rollupBehind")}>
        <h2>{t("rollupBehind")}</h2>
        <p>{t("rollupBehindNote")}</p>
        <dl><div><dt>{t("L1 head observed")}</dt><dd>{num(data.derivation.l1Head)}</dd></div><div><dt>{t("l1Processed")}</dt><dd>{num(data.derivation.l1Block)}</dd></div><div><dt>{t("Behind")}</dt><dd>{num(data.derivation.lag)}</dd></div></dl>
      </section>}
      {data.online && data.sync && data.syncProgress && <section className="sync-progress" aria-label={t("Node synchronization progress")}>
        <h2>{t("Downloading and executing chain history")}</h2>
        <p>{t("The explorer index remains available while this local node synchronizes. These counters measure downloads since the node started, not overall synchronization completion.")}</p>
        <dl><div><dt>{t("Headers received")}</dt><dd>{num(data.syncProgress.headersDownloaded)}</dd></div><div><dt>{t("Block bodies received")}</dt><dd>{num(data.syncProgress.bodiesDownloaded)}</dd></div><div><dt>{t("Rollup target")}</dt><dd>{num(data.syncProgress.target)}</dd></div></dl>
      </section>}
      <section className="health-grid">
        <Metric
          label={t("Chain head")}
          value={num(data.head)}
          note={tf("safe at {block}", { block: num(data.safeBlock) })}
          icon={<Blocks />}
        />
        <Metric
          label={t("Finalized")}
          value={num(data.finalizedBlock)}
          note={tf("{count} block lag", { count: num(data.finalityLag) })}
          icon={<ShieldCheck />}
        />
        <Metric
          label={t("Rollup peers")}
          value={num(data.rollupPeers)}
          note={tf("{count} on Ink block topic", { count: num(data.topicPeers) })}
          icon={<Network />}
        />
        <Metric
          label={t("Known peers")}
          value={num(data.knownPeers)}
          note={tf("{count} in routing table", { count: num(data.routingTablePeers) })}
          icon={<Database />}
        />
      </section>
      <section className="network-detail">
        <div className="peer-visual">
          <div className="peer-core">
            <img src="/brand/ink-symbol.svg" alt="" aria-hidden="true" />
            <span>{t("THIS NODE")}</span>
          </div>
          {Array.from({ length: 12 }, (_, i) => (
            <i
              key={i}
              style={{ transform: `rotate(${i * 30}deg) translateY(-128px)` }}
            />
          ))}
          <span className="peer-count">
            {data.rollupPeers}
            <small>{t("live peers")}</small>
          </span>
        </div>
        <div className="network-facts">
          <SectionTitle eyebrow={t("NODE DETAILS")} title={t("OP-Reth full node")} />
          <dl>
            <div>
              <dt>{t("Execution client")}</dt>
              <dd>OP-Reth v2.4.1</dd>
            </div>
            <div>
              <dt>{t("Rollup client")}</dt>
              <dd>OP Node v1.19.5</dd>
            </div>
            <div>
              <dt>{t("Chain ID")}</dt>
              <dd>{data.chainId}</dd>
            </div>
            <div>
              <dt>{t("Execution peers")}</dt>
              <dd>{data.executionPeers}</dd>
            </div>
            <div>
              <dt>{t("Sync state")}</dt>
              <dd>{data.online ? data.synced ? t("At head") : data.stale ? tf("Last block {count} seconds ago", { count: num(data.blockAgeSeconds) }) : t("Synchronizing") : t("Unavailable")}</dd>
            </div>
            <div>
              <dt>{t("L1 head observed")}</dt>
              <dd>{num(data.l1Head)}</dd>
            </div>
          </dl>
        </div>
      </section>
      <section className="rpc-community">
        <div>
          <Network />
          <div>
            <span>{t("L1 FAILOVER")}</span>
            <h3>{isTestnet ? "Ethereum Sepolia RPC" : t("Ethereum RPC failover")}</h3>
            <p>
              {isTestnet ? t("The rollup node derives Ink Sepolia from Ethereum Sepolia using public execution and beacon endpoints. No failover relay is configured.") : t("Public L1 RPC endpoints sit behind a local circuit breaker. RPC keys never reach the browser.")}
            </p>
          </div>
        </div>
        <div>
          <StatusPill ok={Boolean(data.l1Rpc?.online)}>
            {isTestnet ? t("Direct connection") : data.l1Rpc?.online ? t("Available") : t("Degraded")}
          </StatusPill>
          <small>
            {isTestnet ? t("See L1 head observed above") : tf("{ready}/{total} upstreams ready", { ready: num(rpcReady), total: num(rpcUpstreams.length) })}
          </small>
        </div>
      </section>
      {data.disk && (
        <section className="storage">
          <div>
            <span>{t("NODE STORAGE")}</span>
            <strong>
              {bytes(used)} <small>{tf("used of {total}", { total: bytes(data.disk.total) })}</small>
            </strong>
          </div>
          <div className="storage-bar">
            <i style={{ width: `${pct}%` }} />
          </div>
          <div>
            <span>{tf("{percent}% used", { percent: num(pct, 1) })}</span>
            <span>{bytes(data.disk.free)} {t("available")}</span>
          </div>
        </section>
      )}
      <section className="node-note">
        <ShieldCheck />
        <div>
          <h3>{t("About this node")}</h3>
          <p>{t("This machine executes Ink blocks and keeps its RPC private. It checks the public index against local chain data. It is not the Kraken sequencer and earns no staking or mining rewards.")}
          </p>
        </div>
      </section>
    </>
  );
}

function Footer({ live }: { live: LiveData }) {
  return (
    <footer className="site-footer">
      <div>
        <Brand />
        <p>{t("independent")}</p>
      </div>
      <div>
        <span>{t("explore")}</span>
        <button onClick={() => go("/blocks")}>{t("blocks")}</button>
        <button onClick={() => go("/txs")}>{t("transactions")}</button>
        <button onClick={() => go("/pools")}>{t("pools")}</button>
        <button onClick={() => go("/analytics")}>{t("analytics")}</button>
        <button onClick={() => go("/advanced")}>{t("Explorer tools")}</button>
      </div>
      <div>
        <span>{t("build")}</span>
        <button onClick={() => go("/developers")}>
          {t("developerAccess")}
        </button>
        <a href="https://docs.inkonchain.com" target="_blank" rel="noreferrer">
          {t("documentation")} <ExternalLink />
        </a>
      </div>
      <div className="footer-status">
        <StatusPill ok={Boolean(live.connected && live.network?.online && live.network?.synced && live.network?.derivation?.synced !== false)}>{!live.connected ? t("Connecting") : !live.network?.online ? t("Node unavailable") : live.network?.stale ? t("Node behind") : !live.network?.synced ? t("Node syncing") : live.network?.derivation?.synced === false ? t("rollupBehind") : t("operational")}</StatusPill>
        <small>{t("refreshedLive")}</small>
      </div>
    </footer>
  );
}

// Ambient layers are purely decorative and shared by every route. Keeping
// them outside page content prevents the Liquid Protocol identity from
// interfering with explorer semantics, focus order or data selection.
function LiquidAtmosphere() {
  return (
    <div className="liquid-atmosphere" aria-hidden="true">
      <i />
      <i />
      <i />
    </div>
  );
}

function initialLocale(): Locale {
  const query = new URLSearchParams(location.search).get("lang");
  // Keep the original storage key so existing visitors retain their choice.
  const saved = localStorage.getItem("ink-observer-language");
  const browser = navigator.language?.split("-")[0];
  return isLocale(query)
    ? query
    : isLocale(saved)
      ? saved
      : isLocale(browser)
        ? browser
        : "en";
}

function pageMetadata(view: View) {
  const explorerTitles: Record<string,string> = {
    accounts: "Top accounts", "internal-txs": "Internal transactions", "token-transfers": "Token transfers",
    deposits: "L1 → L2 deposits", withdrawals: "L2 → L1 withdrawals", batches: "Transaction batches",
    "dispute-games": "Dispute games", ops: "User operations", op: "User operation",
    "name-services": "Name services", "gas-tracker": "Gas tracker", apps: "Dapps",
    "contract-verification": "Verify contract", "public-tags": "Submit public tag", stats: "All statistics",
  };
  if (explorerTitles[view.name]) return [`Ink · ${t(explorerTitles[view.name])}`, t("homeDescription")];
  const base: Record<string, [string, string]> = {
    home: ["Ink Explorer — Ink Mainnet", t("homeDescription")],
    blocks: [
      `Ink · ${t("blocks")}`,
      t("blocksIntro"),
    ],
    transactions: [
      `Ink · ${t("transactions")}`,
      t("txIntro"),
    ],
    tokens: [`Ink · ${t("tokens")}`, t("tokenDirectory")],
    pools: [`Ink · ${t("pools")}`, t("poolIntro")],
    contracts: [`Ink · ${t("contracts")}`, t("contractDirectory")],
    analytics: [
      `Ink · ${t("analytics")}`,
      t("Compare transactions, active accounts, fees and success rate. Select a range or inspect any chart point."),
    ],
    advanced: [
      `Ink · ${t("advanced")}`,
      t("Ink deposits, withdrawals and ERC‑4337 user operations."),
    ],
    developers: [
      `Ink Explorer · ${t("Developer API")}`,
      t("Read-only explorer routes, live WebSocket events and local node status."),
    ],
    network: [
      `Ink · ${t("network")}`,
      t("OP-Reth and OP Node status reported by this machine."),
    ],
  };
  if (view.name === "search")
    return [
      view.query ? `Ink · ${t("search")}: ${view.query}` : `Ink · ${t("search")}`,
      t("homeDescription"),
    ];
  if (view.name === "transaction")
    return [
      `Ink · ${t("transactions")} ${short(view.id, 12, 10)}`,
      t("txIntro"),
    ];
  if (view.name === "block")
    return [
      `Ink · ${t("blocks")} ${view.id}`,
      t("blocksIntro"),
    ];
  if (view.name === "address")
    return [
      `Ink · ${t("address")} ${short(view.id, 12, 10)}`,
      t("homeDescription"),
    ];
  if (view.name === "token")
    return [
      `Ink · ${t("tokens")} ${short(view.id, 12, 10)}`,
      t("tokenDirectory"),
    ];
  if (view.name === "nft")
    return [
      `Ink · ${t("nftInstance")} ${view.tokenId}`,
      t("tokenDirectory"),
    ];
  if (view.name === "pool")
    return [
      `Ink · ${t("pool")} ${short(view.id, 12, 10)}`,
      t("poolIntro"),
    ];
  return base[view.name] || [t("pageNotFound"), t("homeDescription")];
}

export default function App() {
  const live = useLiveStream();
  const [locale, setLocale] = useState<Locale>(() => {
    const value = initialLocale();
    activeLocale = value;
    return value;
  });
  const [view, setView] = useState(route());
  const navigationFocus = useRef(false);
  useEffect(() => {
    const f = () => {
      navigationFocus.current = true;
      setView(route());
    };
    addEventListener("popstate", f);
    return () => removeEventListener("popstate", f);
  }, []);
  useLayoutEffect(() => {
    if (navigationFocus.current) {
      document.getElementById("main-content")?.focus({ preventScroll: true });
      navigationFocus.current = false;
    }
  }, [view]);
  useEffect(() => {
    activeLocale = locale;
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    const [title, description] = pageMetadata(view);
    document.title = title.replaceAll("Ink Mainnet", network.name);
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute("content", description.replaceAll("Ink Mainnet", network.name));
  }, [locale, view]);
  const chooseLocale = (next: Locale) => {
    activeLocale = next;
    setLocale(next);
    localStorage.setItem("ink-observer-language", next);
    const url = new URL(location.href);
    if (next === "en") url.searchParams.delete("lang");
    else url.searchParams.set("lang", next);
    history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  };
  let content: ReactNode;
  if (view.name === "home") content = <Home live={live} />;
  else if (view.name === "search")
    content = <SearchResults query={view.query || ""} />;
  else if (view.name === "blocks")
    content = <LedgerList key="blocks" type="blocks" live={live} />;
  else if (view.name === "transactions")
    content = <LedgerList key="transactions" type="transactions" live={live} />;
  else if (["internal-txs", "token-transfers"].includes(view.name))
    content = <LedgerList key={view.name} type="transactions" initialMode={view.name === "internal-txs" ? "internal" : "tokens"} live={live} />;
  else if (view.name === "block" && view.id)
    content = <BlockDetail id={view.id} live={live} />;
  else if (view.name === "transaction" && view.id)
    content = <TxDetail id={view.id} />;
  else if (view.name === "address" && view.id)
    content = <AddressDetail id={view.id} />;
  else if (view.name === "tokens") content = <Tokens />;
  else if (view.name === "token" && view.id)
    content = <TokenDetail key={view.id} id={view.id} />;
  else if (view.name === "nft" && view.id && view.tokenId)
    content = <NftDetail id={view.id} tokenId={view.tokenId} />;
  else if (view.name === "pools") content = <Pools />;
  else if (view.name === "pool" && view.id)
    content = <PoolDetail id={view.id} />;
  else if (view.name === "contracts") content = <Contracts />;
  else if (view.name === "analytics") content = <Analytics />;
  else if (view.name === "advanced") content = <AdvancedPage />;
  else if (["deposits", "withdrawals", "ops"].includes(view.name)) content = <AdvancedPage key={view.name} initialMode={view.name === "ops" ? "userops" : view.name} />;
  else if (["accounts", "batches", "dispute-games", "gas-tracker", "name-services", "apps", "contract-verification", "public-tags", "op", "stats"].includes(view.name)) content = <Suspense fallback={<div className="explorer-route-loading"><Loading /></div>}><ExplorerPages key={`${view.name}/${view.id || ""}`} {...explorerProps(view.name, view.id)} /></Suspense>;
  else if (view.name === "developers") content = <DevelopersPage />;
  else if (view.name === "network") content = <NetworkPage live={live} />;
  else
    content = (
      <div className="not-found">
        <Hash />
        <h1>{t("pageNotFound")}</h1>
        <button onClick={() => go("/")}>{t("returnHome")}</button>
      </div>
    );
  return (
    <>
      <LiquidAtmosphere />
      <a className="skip-link" href="#main-content">{t("Skip to content")}
      </a>
      <Header
        current={view.name}
        live={live}
        locale={locale}
        onLocale={chooseLocale}
      />
      <main id="main-content" tabIndex={-1}>{content}</main>
      <Footer live={live} />
    </>
  );
}
