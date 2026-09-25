import {
  FormEvent,
  ReactNode,
  useEffect,
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
import { isLocale, localeNames, locales, message, type Locale } from "./i18n";
import { EntityMark } from "./EntityMark";
import { mediaUrl } from "./media";
import { API, basePath, network, networkPath, isTestnet } from "./network";
const ContractInteraction = lazy(() => import("./ContractInteraction"));

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
function unit(value: unknown, suffix: string, digits = 2) {
  const formatted = num(value, digits);
  return formatted === "—" ? formatted : `${formatted}${suffix}`;
}
function scaled(value: unknown, decimals: unknown) {
  const amount = finiteNumber(value);
  const precision = finiteNumber(decimals);
  return amount === null ? undefined : amount / 10 ** (precision ?? 0);
}
function age(date: string) {
  if (!date) return "—";
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
    style: "narrow",
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
async function get<T = any>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Data source unavailable");
  return body;
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
      const scheme = location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${scheme}://${location.host}${API}/live`);
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
    stats: "analytics",
  };
  return {
    name: names[p[0]] || p[0],
    id: p[1] ? decodeURIComponent(p.slice(1).join("/")) : undefined,
  };
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
  window.scrollTo(0, 0);
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
    addEventListener("keydown", key);
    addEventListener("pointerdown", pointer);
    addEventListener("resize", resize);
    return () => {
      removeEventListener("keydown", key);
      removeEventListener("pointerdown", pointer);
      removeEventListener("resize", resize);
    };
  }, [open]);
  return (
    <>
      <div className="network-ribbon" role="region" aria-label="Network and live status">
        <div>
          <label className="network-picker">
            <span className="sr-only">Network</span>
            <select aria-label="Network" value={isTestnet ? "sepolia" : "mainnet"}
              onChange={event => { location.href = `${event.target.value === "sepolia" ? "/testnet" : ""}/${activeLocale === "en" ? "" : `?lang=${activeLocale}`}`; }}>
              <option value="mainnet">Ink Mainnet</option>
              <option value="sepolia">Ink Sepolia · Testnet</option>
            </select>
          </label>
          <span>CHAIN ID {network.chainId}</span>
          <span className={live.connected ? "ribbon-live" : "ribbon-offline"}>
            <i /> {live.connected ? t("websocketLive") : t("reconnecting")}
          </span>
        </div>
        <div>
          {live.block?.height
            ? `HEAD #${num(live.block.height)}`
            : "WAITING FOR CHAIN HEAD"}
        </div>
      </div>
      <header ref={headerRef}>
        <Brand />
        <nav
          id="primary-navigation"
          className={open ? "open" : ""}
          aria-label="Primary"
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
          onClick={() => setOpen((v) => !v)}
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
        <button className="text-link mono" onClick={() => go(link)}>
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
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
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
function ErrorState({ error }: { error: string }) {
  return (
    <div className="error-state" role="alert">
      <CircleDot />
      <div>
        <strong>{t("unavailable")}</strong>
        <p>{error}</p>
        <button onClick={() => location.reload()}>
          <RefreshCw aria-hidden="true" /> {t("retry")}
        </button>
      </div>
    </div>
  );
}
function Empty({ children }: { children?: ReactNode }) {
  return <div className="empty">{children || t("noRecords")}</div>;
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
  if (!value) return "Observation";
  const d = new Date(`${value.length === 10 ? `${value}T00:00:00` : value}`);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString(activeLocale, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}
function relativeDate(value?: string) {
  if (!value) return "";
  const days = Math.max(
    0,
    Math.floor(
      (Date.now() -
        new Date(
          `${value.length === 10 ? `${value}T00:00:00` : value}`,
        ).getTime()) /
        86400000,
    ),
  );
  return new Intl.RelativeTimeFormat(activeLocale, { numeric: "auto" }).format(
    -days,
    "day",
  );
}

function Sparkline({
  points,
  labels = [],
  color = "#6f32ff",
  height = 90,
  formatValue = compact,
  selectedLabel,
  onSelectLabel,
  ariaLabel = "Trend chart",
  approximateLast = false,
}: {
  points: number[];
  labels?: string[];
  color?: string;
  height?: number;
  formatValue?: (value: number) => string;
  selectedLabel?: string | null;
  onSelectLabel?: (label: string | null) => void;
  ariaLabel?: string;
  approximateLast?: boolean;
}) {
  const width = 600;
  const clean = points
    .map(Number)
    .map((value) => (Number.isFinite(value) ? value : 0));
  const [local, setLocal] = useState<number | null>(null);
  const seriesKey = `${labels[0]}|${labels.at(-1)}|${labels.length}`;
  useEffect(() => setLocal(null), [seriesKey]);
  if (clean.length < 2)
    return (
      <div className="chart-empty" role="status" style={{ minHeight: height }}>
        Not enough data
      </div>
    );
  const min = Math.min(...clean),
    max = Math.max(...clean),
    range = max - min || 1;
  const x = (i: number) => (i / (clean.length - 1)) * width;
  const y = (p: number) => height - 10 - ((p - min) / range) * (height - 22);
  const d = clean.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p)}`).join(" ");
  const synced = selectedLabel ? labels.indexOf(selectedLabel) : -1;
  const active = synced >= 0 ? synced : local;
  const pick = (clientX: number, target: Element) => {
    const rect = target.getBoundingClientRect();
    const index = Math.max(
      0,
      Math.min(
        clean.length - 1,
        Math.round(((clientX - rect.left) / rect.width) * (clean.length - 1)),
      ),
    );
    setLocal(index);
    onSelectLabel?.(labels[index] || String(index));
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
      onSelectLabel?.(null);
      return;
    } else return;
    e.preventDefault();
    setLocal(index);
    onSelectLabel?.(labels[index] || String(index));
  };
  const delta =
    active != null && active > 0 && clean[active - 1] !== 0
      ? ((clean[active] - clean[active - 1]) / Math.abs(clean[active - 1])) *
        100
      : null;
  return (
    <div
      className="interactive-chart"
      style={{ height: `clamp(${height}px, 10vw, ${height * 1.25}px)` }}
      tabIndex={0}
      role="group"
      aria-label={`${ariaLabel}. Tap or drag to inspect values; use arrow keys when focused.`}
      onKeyDown={key}
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
          onSelectLabel?.(null);
        }
      }}
    >
      <svg
        className="sparkline"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          className="gridline"
          d={`M0 ${height * 0.33}H${width}M0 ${height * 0.66}H${width}`}
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
              y2={height}
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
          className={cx(
            "chart-tooltip",
            active < clean.length * 0.25 && "edge-left",
            active > clean.length * 0.75 && "edge-right",
          )}
          style={{ left: `${(x(active) / width) * 100}%` }}
          aria-live="polite"
        >
          <span>{dateText(labels[active])}</span>
          <strong>{formatValue(clean[active])}</strong>
          <small>
            {relativeDate(labels[active])}
            {delta != null
              ? ` · ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% vs prior`
              : ""}
            {approximateLast && active === clean.length - 1 ? " · partial" : ""}
          </small>
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
  const type = tx.transaction_types?.[0] || tx.method || "transfer";
  return <span className="method">{String(type).replaceAll("_", " ")}</span>;
}

function TxRow({ tx }: { tx: AnyRow }) {
  const from = addressOf(tx.from),
    to = addressOf(tx.to || tx.created_contract);
  return (
    <div className={cx("tx-row", tx._live && "live-arrival")}>
      <div className="tx-primary">
        <StatusPill
          ok={
            tx.status === "ok" ||
            tx.result === "success" ||
            tx.result === "confirmed"
          }
        >
          {tx.status === "error"
            ? t("failed")
            : tx._live
              ? t("confirmed")
              : t("success")}
        </StatusPill>
        <div>
          <Copyable value={tx.hash} link={`/tx/${tx.hash}`} />
          <small>
            {age(tx.timestamp)} · block{" "}
            <button onClick={() => go(`/block/${tx.block_number}`)}>
              {num(tx.block_number)}
            </button>
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
            ? `Fee ${eth(tx.fee.value, 7)}`
            : tx._live
              ? "Fee indexing"
              : "Fee —"}
        </small>
      </div>
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
        <small>Transactions</small>
        <strong>{num(block.transactions_count)}</strong>
      </div>
      <div>
        <small>Gas used</small>
        <strong>{unit(block.gas_used_percentage, "%")}</strong>
      </div>
      <div>
        <small>Size</small>
        <strong>{bytes(block.size)}</strong>
      </div>
      <div className="block-fee">
        <small>Fees</small>
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
          <span className="kicker">{network.name.toUpperCase()}{isTestnet ? " · TESTNET" : ""}</span>
          <h1>
            {network.name} <small>{t("liveIndex")}</small>
          </h1>
          <p>{t("homeDescription")}</p>
        </div>
        <div className="head-console">
          <div>
            <span>{nodeStatus?.synced ? "LATEST BLOCK" : nodeStatus?.stale ? "LOCAL NODE HEAD · BEHIND" : nodeStatus?.online ? "LOCAL NODE HEAD · SYNCING" : "LOCAL NODE HEAD · WAITING"}</span>
            <strong>#{num(live.block?.height ?? nodeStatus?.head)}</strong>
          </div>
          <dl>
            <div>
              <dt>Safe</dt>
              <dd>#{num(nodeStatus?.safeBlock)}</dd>
            </div>
            <div>
              <dt>Finalized</dt>
              <dd>#{num(nodeStatus?.finalizedBlock)}</dd>
            </div>
            <div>
              <dt>WebSocket</dt>
              <dd className={live.connected ? "positive" : "negative"}>
                {live.connected ? "LIVE" : "RETRY"}
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
  const s = data.stats,
    chart = [...data.chart].reverse();
  const last7 = chart.slice(-7).reduce((a: number, v: any) => a + Number(v.transactions_count), 0);
  const prev7 = chart.slice(-14, -7).reduce((a: number, v: any) => a + Number(v.transactions_count), 0);
  const delta = prev7 ? ((last7 - prev7) / prev7) * 100 : 0;
  return (
    <>
      <div className="home-overview">
        <section className="metric-grid">
          <Metric
            label={t("latestBlock")}
            value={num(data.network.head || s.total_blocks)}
            note={`${num(data.network.finalityLag)} blocks to finality`}
            icon={<Blocks />}
          />
          <Metric
            label="Transactions"
            value={compact(s.total_transactions)}
            note={`${compact(s.transactions_today)} in the last day`}
            icon={<Zap />}
          />
          <Metric
            label={t("uniqueAddresses")}
            value={compact(s.total_addresses)}
            note="indexed accounts"
            icon={<WalletCards />}
          />
          <Metric
            label={t("networkLoad")}
            value={unit(s.network_utilization_percentage, "%")}
            note="of current gas capacity"
            icon={<Gauge />}
          />
          <Metric
            label={t("medianGas")}
            value={unit(s.gas_prices?.average, " Gwei")}
            note={data.network.synced ? `${num(data.network.gasPriceWei)} wei reference` : "Public index estimate · local node syncing"}
            icon={<Fuel />}
          />
        </section>
        <section className="signal-grid">
          <div className="signal-main">
            <SectionTitle
              eyebrow="LAST 30 DAYS"
              title="Daily transactions"
              action={
                <button className="arrow-link" onClick={() => go("/analytics")}>
                  View analytics <ArrowUpRight />
                </button>
              }
            />
            <div className="chart-head">
              <div>
                <strong>{compact(chart.at(-1)?.transactions_count)}</strong>
                <span>transactions / day</span>
              </div>
              <div className={delta >= 0 ? "positive" : "negative"}>
                {delta >= 0 ? "+" : ""}
                {delta.toFixed(1)}% <small>7d / prev. 7d</small>
              </div>
            </div>
            <Sparkline
              points={chart.map((d: any) => Number(d.transactions_count))}
              labels={chart.map((d: any) => d.date)}
              height={160}
              ariaLabel="Daily Ink transactions over the last 30 days"
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
          eyebrow="LIVE"
          title="Latest blocks and transactions"
          action={
            <span className="live-refresh">
              <i /> refreshes every 10 seconds
            </span>
          }
        />
        <div className="live-columns">
          <div className="panel">
            <div className="panel-head">
              <h3>Blocks</h3>
              <button onClick={() => go("/blocks")}>View all</button>
            </div>
            {data.blocks.slice(0, 6).map((b: any) => (
              <BlockRow key={b.hash} block={b} />
            ))}
          </div>
          <div className="panel">
            <div className="panel-head">
              <h3>Transactions</h3>
              <button onClick={() => go("/txs")}>View all</button>
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
        eyebrow="SEARCH"
        title={query ? `Results for “${query}”` : t("search")}
        text="Search addresses, contracts, tokens, blocks and transactions on Ink."
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
                      "Search result"}
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
          <Empty>No results for this search.</Empty>
        )}
      </div>
    </>
  );
}

function LedgerList({
  type,
  live,
}: {
  type: "blocks" | "transactions";
  live?: LiveData;
}) {
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  const [params, setParams] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [mode, setMode] = useState("all");
  const dataRequest = useRef(0);
  const endpoint =
    type === "transactions" && mode === "tokens"
      ? "token-transfers"
      : type === "transactions" && mode === "internal"
        ? "internal-transactions"
        : type;
  useEffect(() => {
    const request = ++dataRequest.current;
    setData(undefined);
    setError("");
    get(`/explorer/${endpoint}${params}`)
      .then((value) => request === dataRequest.current && setData(value))
      .catch(
        (e) => request === dataRequest.current && setError(e.message),
      );
  }, [endpoint, params]);
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
  return (
    <>
      <PageIntro
        eyebrow={type === "blocks" ? "INK BLOCKS" : "INK TRANSACTIONS"}
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
              setMode("all");
              setParams("");
            }}
          >
            All transactions
          </button>
          <button
            className={mode === "tokens" ? "active" : ""}
            onClick={() => {
              setMode("tokens");
              setParams("");
            }}
          >
            Token transfers
          </button>
          <button
            className={mode === "internal" ? "active" : ""}
            onClick={() => {
              setMode("internal");
              setParams("");
            }}
          >
            Internal calls
          </button>
        </div>
      )}
      <div className="table-shell">
        <div className="table-toolbar">
          <span>
            {data ? `${data.items?.length || 0} shown` : "Loading records"}
          </span>
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
                ? `Live · head #${num(live.block?.height)}`
                : "Reconnecting…"
              : "Ink index"}
          </span>
        </div>
        {!data && !error ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} />
        ) : (
          <div className={type === "transactions" ? "tx-list" : "block-list"}>
            {data.items?.map((item: any) =>
              type === "transactions" && mode === "all" ? (
                <TxRow key={item.hash} tx={item} />
              ) : type === "transactions" ? (
                <GenericActivity
                  key={item.transaction_hash || item.index}
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
      {subtitle && <p>{subtitle}</p>}
    </section>
  );
}

function BlockDetail({ id }: { id: string }) {
  const [block, setBlock] = useState<any>();
  const [txs, setTxs] = useState<any>();
  const [error, setError] = useState("");
  const dataRequest = useRef(0);
  useEffect(() => {
    const request = ++dataRequest.current;
    setBlock(undefined);
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
  return (
    <>
      <DetailHeader
        kind="BLOCK"
        title={`#${num(block.height)}`}
        subtitle={`Produced ${age(block.timestamp)} · ${new Date(block.timestamp).toLocaleString()}`}
        status={<StatusPill ok>Finalized</StatusPill>}
      />
      <section className="detail-layout">
        <dl className="definitions">
          <Definition label="Block hash" wide>
            <Copyable value={block.hash} display={block.hash} />
          </Definition>
          <Definition label="Transactions">
            {num(block.transactions_count)}
          </Definition>
          <Definition label="Gas used">
            {num(block.gas_used)}{" "}
            <small>({unit(block.gas_used_percentage, "%")})</small>
          </Definition>
          <Definition label="Gas limit">{num(block.gas_limit)}</Definition>
          <Definition label="Base fee">
            {num(block.base_fee_per_gas)} wei
          </Definition>
          <Definition label="Total fees">
            {eth(block.transaction_fees, 8)}
          </Definition>
          <Definition label="Size">{bytes(block.size)}</Definition>
          <Definition label="Parent block" wide>
            <Copyable
              value={block.parent_hash}
              display={block.parent_hash}
              link={`/block/${Number(block.height) - 1}`}
            />
          </Definition>
        </dl>
        <div className="detail-feed">
          <div className="panel-head">
            <h3>Transactions in this block</h3>
            <span>{num(block.transactions_count)} total</span>
          </div>
          {txs?.items?.length ? (
            txs.items.map((t: any) => <TxRow key={t.hash} tx={t} />)
          ) : (
            <Empty>This block has no transactions.</Empty>
          )}
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
  const transactionRequest = useRef(0);
  const relatedRequest = useRef(0);
  useEffect(() => {
    const request = ++transactionRequest.current;
    setTx(undefined);
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
          setRelated(Array.isArray(v) ? { items: v } : v),
      )
      .catch(
        (e) =>
          request === relatedRequest.current &&
          setRelated({ items: [], error: e.message }),
      );
  }, [id, tab]);
  if (!tx && !error) return <Loading />;
  if (error) return <ErrorState error={error} />;
  const from = addressOf(tx.from),
    to = addressOf(tx.to || tx.created_contract);
  return (
    <>
      <DetailHeader
        kind="TRANSACTION"
        title={short(tx.hash, 14, 12)}
        subtitle={tx.hash}
        status={
          <StatusPill ok={tx.status === "ok"}>
            {tx.status === "ok" ? "Confirmed" : "Failed"}
          </StatusPill>
        }
      />
      <div className="tabs">
        <button
          className={tab === "overview" ? "active" : ""}
          onClick={() => setTab("overview")}
        >
          {t("overview")}
        </button>
        <button
          className={tab === "transfers" ? "active" : ""}
          onClick={() => setTab("transfers")}
        >
          {t("transfers")}
        </button>
        <button
          className={tab === "internal" ? "active" : ""}
          onClick={() => setTab("internal")}
        >
          {t("internal")}
        </button>
        <button
          className={tab === "logs" ? "active" : ""}
          onClick={() => setTab("logs")}
        >
          {t("logs")}
        </button>
        <button
          className={tab === "state" ? "active" : ""}
          onClick={() => setTab("state")}
        >
          {t("stateChanges")}
        </button>
        <button
          className={tab === "trace" ? "active" : ""}
          onClick={() => setTab("trace")}
        >
          {t("rawTrace")}
        </button>
        <button
          className={tab === "input" ? "active" : ""}
          onClick={() => setTab("input")}
        >
          {t("inputData")}
        </button>
        <button
          className={tab === "l2" ? "active" : ""}
          onClick={() => setTab("l2")}
        >
          {t("l2Fees")}
        </button>
      </div>
      {tab === "overview" && (
        <dl className="definitions standalone">
          <Definition label="Transaction hash" wide>
            <Copyable value={tx.hash} display={tx.hash} />
          </Definition>
          <Definition label="Block">
            <button
              className="text-link"
              onClick={() => go(`/block/${tx.block_number}`)}
            >
              {num(tx.block_number)}
            </button>{" "}
            · {num(tx.confirmations)} confirmations
          </Definition>
          <Definition label="Timestamp">
            {new Date(tx.timestamp).toLocaleString()} ({age(tx.timestamp)})
          </Definition>
          <Definition label="From" wide>
            <span className="flow-party">
              <EntityMark address={from} label={labelOf(tx.from)} />
              <Copyable value={from} display={from} link={`/address/${from}`} />
            </span>
          </Definition>
          <Definition label="To" wide>
            <span className="flow-party">
              <EntityMark address={to} label={labelOf(tx.to)} />
              <Copyable
                value={to}
                display={labelOf(tx.to) || to}
                link={to ? `/address/${to}` : undefined}
              />
            </span>
          </Definition>
          <Definition label="Value">{eth(tx.value, 8)}</Definition>
          <Definition label="Transaction fee">
            {eth(tx.fee?.value, 10)}
          </Definition>
          <Definition label="Gas used">
            {num(tx.gas_used)} / {num(tx.gas_limit)}
          </Definition>
          <Definition label="Gas price">{num(tx.gas_price)} wei</Definition>
          <Definition label="Method">
            <Method tx={tx} />
          </Definition>
          <Definition label="Nonce">{num(tx.nonce)}</Definition>
        </dl>
      )}
      {tab === "input" && (
        <div className="code-panel">
          <div>
            <span>METHOD</span>
            <strong>{tx.method || "—"}</strong>
          </div>
          <pre>{tx.raw_input || "0x"}</pre>
        </div>
      )}
      {tab === "l2" && (
        <dl className="definitions standalone">
          <Definition label="L1 data fee">{eth(tx.l1_fee, 10)}</Definition>
          <Definition label="L1 gas used">{num(tx.l1_gas_used)}</Definition>
          <Definition label="L1 gas price">
            {num(tx.l1_gas_price)} wei
          </Definition>
          <Definition label="L2 execution fee">
            {eth(
              tx.fee?.value && tx.l1_fee
                ? BigInt(tx.fee.value) - BigInt(tx.l1_fee)
                : 0,
              10,
            )}
          </Definition>
        </dl>
      )}
      {["transfers", "internal", "logs"].includes(tab) && (
        <div className="table-shell address-activity">
          {!related ? (
            <Loading />
          ) : related.items?.length ? (
            related.items.map((item: any, i: number) => (
              <GenericActivity
                key={item.transaction_hash || item.index || i}
                item={item}
                type={tab}
              />
            ))
          ) : (
            <Empty>
              {related.error || `No ${tab} recorded for this transaction.`}
            </Empty>
          )}
        </div>
      )}
      {tab === "state" && (
        <div className="table-shell address-activity">
          {!related ? (
            <Loading />
          ) : related.items?.length ? (
            related.items.map((item: any, i: number) => (
              <StateChange key={i} item={item} />
            ))
          ) : (
            <Empty>
              {related.error || "No balance or storage changes indexed."}
            </Empty>
          )}
        </div>
      )}
      {tab === "trace" && (
        <div className="code-panel">
          <div>
            <span>EXECUTION TRACE</span>
            <strong>
              {related?.items?.length
                ? `${related.items.length} calls`
                : "Unavailable"}
            </strong>
          </div>
          {!related ? (
            <Loading />
          ) : related.items?.length ? (
            <pre>{JSON.stringify(related.items, null, 2)}</pre>
          ) : (
            <Empty>
              {related.error ||
                "No raw execution trace is available for this transaction."}
            </Empty>
          )}
        </div>
      )}
    </>
  );
}

function AddressDetail({ id }: { id: string }) {
  const [address, setAddress] = useState<any>();
  const [data, setData] = useState<any>();
  const [tokens, setTokens] = useState<any[]>([]);
  const [counters, setCounters] = useState<any>({});
  const [pool, setPool] = useState<any>();
  const [tab, setTab] = useState("overview");
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const profileRequest = useRef(0);
  const dataRequest = useRef(0);
  useEffect(() => {
    const request = ++profileRequest.current;
    setTab("overview");
    setData(undefined);
    setPool(undefined);
    setAddress(undefined);
    setError("");
    get(`/explorer/addresses/${id}`)
      .then((value: any) => {
        if (request !== profileRequest.current) return;
        setAddress(value);
        if (value.is_contract)
          get(`/contract-info/pools/${id}/check`)
            .then(
              (next) => request === profileRequest.current && setPool(next),
            )
            .catch(
              () => request === profileRequest.current && setPool(null),
            );
        else setPool(null);
      })
      .catch(
        (e) => request === profileRequest.current && setError(e.message),
      );
    get(`/explorer/addresses/${id}/token-balances`)
      .then(
        (v: any) =>
          request === profileRequest.current &&
          setTokens(Array.isArray(v) ? v : v.items || []),
      )
      .catch(
        () => request === profileRequest.current && setTokens([]),
      );
    get(`/explorer/addresses/${id}/counters`)
      .then(
        (value) =>
          request === profileRequest.current && setCounters(value),
      )
      .catch(() => {});
  }, [id]);
  useEffect(() => {
    const request = ++dataRequest.current;
    setLoadingMore(false);
    setData(undefined);
    if (tab === "overview") return;
    const endpoint =
      ["contract", "read", "write"].includes(tab) ? `smart-contracts/${id}` : `addresses/${id}/${tab}`;
    get(`/explorer/${endpoint}`)
      .then((value) => request === dataRequest.current && setData(value))
      .catch(
        (e) =>
          request === dataRequest.current &&
          setData({ items: [], error: e.message }),
      );
  }, [id, tab]);
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
  if (error && !address) return <ErrorState error={error} />;
  const balance = address?.coin_balance;
  const implementation = address?.implementations?.[0];
  return (
    <>
      <DetailHeader
        kind={
          pool
            ? t("pool").toUpperCase()
            : address?.is_contract
              ? t("smartContract").toUpperCase()
              : t("address").toUpperCase()
        }
        title={address?.name || short(id, 14, 12)}
        identifier={!address?.name}
        subtitle={id}
        status={
          address?.is_verified ? (
            <span className="verified">
              <ShieldCheck /> {t("verifiedSource")}
            </span>
          ) : undefined
        }
      />
      <section className="address-summary">
        <Metric
          label="ETH balance"
          value={eth(balance, 6)}
          note={money(
            balance == null || address?.exchange_rate == null
              ? undefined
              : (Number(balance) / 1e18) * Number(address.exchange_rate),
          )}
        />
        <Metric
          label="Transactions"
          value={compact(counters.transactions_count)}
          note={`${compact(counters.token_transfers_count)} token transfers`}
        />
        <Metric
          label="Token holdings"
          value={num(tokens.length)}
          note="known assets"
        />
        <Metric
          label="Gas consumed"
          value={compact(counters.gas_usage_count)}
          note={`updated at #${num(address?.block_number_balance_updated_at)}`}
        />
      </section>
      <div className="tabs">
        <button
          className={tab === "overview" ? "active" : ""}
          onClick={() => setTab("overview")}
        >
          {t("overview")}
        </button>
        <button
          className={tab === "transactions" ? "active" : ""}
          onClick={() => setTab("transactions")}
        >
          {t("transactions")}
        </button>
        <button
          className={tab === "tokens" ? "active" : ""}
          onClick={() => setTab("tokens")}
        >
          {t("assets")}
        </button>
        <button
          className={tab === "nft" ? "active" : ""}
          onClick={() => setTab("nft")}
        >
          {t("nfts")}
        </button>
        <button
          className={tab === "token-transfers" ? "active" : ""}
          onClick={() => setTab("token-transfers")}
        >
          {t("transfers")}
        </button>
        <button
          className={tab === "internal-transactions" ? "active" : ""}
          onClick={() => setTab("internal-transactions")}
        >
          {t("internal")}
        </button>
        <button
          className={tab === "logs" ? "active" : ""}
          onClick={() => setTab("logs")}
        >
          {t("logs")}
        </button>
        {address?.is_contract && (
          <>
          <button
            className={tab === "contract" ? "active" : ""}
            onClick={() => setTab("contract")}
          >
            {t("contractSource")}
          </button>
          <button className={tab === "read" ? "active" : ""} onClick={() => setTab("read")}>Read contract</button>
          <button className={tab === "write" ? "active" : ""} onClick={() => setTab("write")}>Write contract</button>
          </>
        )}
      </div>
      {tab === "overview" ? (
        <section className="entity-profile">
          <div>
            <span>{t("contractProfile").toUpperCase()}</span>
            <h2>
              {pool
                ? `${pool.base_token_symbol} / ${pool.quote_token_symbol}`
                : address?.name ||
                  address?.token?.name ||
                  (address?.is_contract ? t("smartContract") : t("account"))}
            </h2>
            <p>
              {address?.is_contract
                ? "This address contains contract bytecode. Source verification, proxy and deployment details come from Ink’s public explorer index."
                : "No contract bytecode is deployed here. Balances and activity are public; this explorer does not identify the owner."}
            </p>
            {pool && (
              <button
                className="primary-action"
                onClick={() => go(`/pools/${id}`)}
              >
                <Droplets /> {t("pool")} · {pool.base_token_symbol}/
                {pool.quote_token_symbol}
              </button>
            )}
          </div>
          <dl>
            <Definition label={t("reputation")}>
              {address?.is_scam ? "Flagged" : address?.reputation || "ok"}
            </Definition>
            <Definition label={t("tokenStandard")}>
              {address?.token
                ? `${address.token.type} · ${address.token.symbol}`
                : "—"}
            </Definition>
            <Definition label={t("proxyType")}>
              {address?.proxy_type || "Not a proxy"}
            </Definition>
            <Definition label={t("implementation")}>
              {implementation ? (
                <Copyable
                  value={implementation.address_hash}
                  display={
                    implementation.name || short(implementation.address_hash)
                  }
                  link={`/address/${implementation.address_hash}`}
                />
              ) : (
                "—"
              )}
            </Definition>
            <Definition label={t("creator")}>
              {address?.creator_address_hash ? (
                <Copyable
                  value={address.creator_address_hash}
                  link={`/address/${address.creator_address_hash}`}
                />
              ) : (
                "Genesis / unavailable"
              )}
            </Definition>
            <Definition label={t("creationTx")}>
              {address?.creation_transaction_hash ? (
                <Copyable
                  value={address.creation_transaction_hash}
                  link={`/tx/${address.creation_transaction_hash}`}
                />
              ) : (
                "Genesis / unavailable"
              )}
            </Definition>
          </dl>
          <a
            className="external-action"
            href={`${network.explorer}/address/${id}`}
            target="_blank"
            rel="noreferrer"
          >
            {t("officialExplorer")} <ExternalLink />
          </a>
        </section>
      ) : (
        <div className="table-shell address-activity">
          {!data ? (
            <Loading />
          ) : (
            <>
              {["read", "write"].includes(tab) && !data.error ? (
                <Suspense fallback={<Loading />}><ContractInteraction key={`${id}-${tab}`} address={id} contract={data} mode={tab === "read" ? "read" : "write"} /></Suspense>
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
                  data.items.map((tx: any) => <TxRow key={tx.hash} tx={tx} />)
                ) : (
                  data.items.map((item: any, i: number) => (
                    <GenericActivity
                      key={item.transaction_hash || item.index || i}
                      item={item}
                      type={tab}
                    />
                  ))
                )
              ) : (
                <Empty>
                  {data.error ||
                    `No ${tab.replace("-", " ")} indexed for this address.`}
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
            </>
          )}
        </div>
      )}
    </>
  );
}

// All third-party artwork is routed through the same-origin, SSRF-protected
// media cache. Broken or unsafe assets fall back to deterministic placeholders.
function AssetHolding({ item }: { item: AnyRow }) {
  const t = item.token || {},
    amount = scaled(item.value, t.decimals);
  return (
    <button
      className="asset-row"
      disabled={!t.address_hash}
      onClick={() => t.address_hash && go(`/token/${t.address_hash}`)}
    >
      <span className="token-name">
        {t.icon_url ? (
          <img src={mediaUrl(t.icon_url)} alt="" />
        ) : (
          <i>{t.symbol?.[0] || "?"}</i>
        )}
        <span>
          <strong>{t.name || "Unknown asset"}</strong>
          <small>
            {t.symbol} · {t.type}
          </small>
        </span>
      </span>
      <span>
        <strong>{num(amount, 6)}</strong>
        <small>
          {t.exchange_rate && amount !== undefined
            ? money(amount * Number(t.exchange_rate))
            : "No price data"}
        </small>
      </span>
      <ArrowUpRight />
    </button>
  );
}
function NftItem({ item }: { item: AnyRow }) {
  const token = item.token || {};
  const tokenId = String(item.id || item.token_id || "");
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
      <span>{item.metadata?.name || token.name || "NFT collection"}</span>
      <strong>#{tokenId || "—"}</strong>
    </button>
  );
}
function ContractSource({ contract }: { contract: AnyRow }) {
  const sources = [
    ...(contract.source_code
      ? [
          {
            file_path: contract.file_path || "Contract source",
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
            {contract.is_fully_verified ? t("fullyVerified") : contract.source_code ? t("verified") : "Not verified"}
          </StatusPill>
          <h3>{contract.name || t("smartContract")}</h3>
          <span>{contract.file_path || "Source code"}</span>
        </div>
        <dl>
          <div>
            <dt>Compiler</dt>
            <dd>{contract.compiler_version || "—"}</dd>
          </div>
          <div>
            <dt>Language</dt>
            <dd>{contract.language || "Solidity"}</dd>
          </div>
          <div>
            <dt>Optimizer</dt>
            <dd>
              {contract.optimization_enabled
                ? `${num(contract.optimization_runs || contract.optimizations_runs)} runs`
                : "Disabled"}
            </dd>
          </div>
          <div>
            <dt>License</dt>
            <dd>{contract.license_type || "Not specified"}</dd>
          </div>
          <div>
            <dt>ABI entries</dt>
            <dd>{num(contract.abi?.length)}</dd>
          </div>
          <div>
            <dt>Bytecode</dt>
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
            <summary>{source.file_path || `Source ${index + 1}`}</summary>
            <pre>{source.source_code}</pre>
          </details>
        ))
      ) : (
        <Empty>Source is not available.</Empty>
      )}
      {sources.length > 1 && (
        <footer>
          {num(sources.length)} source files are included in the verified build.
        </footer>
      )}
    </div>
  );
}

function GenericActivity({ item, type }: { item: AnyRow; type: string }) {
  const hash = item.transaction_hash || item.tx_hash;
  return (
    <div className="generic-row">
      <span className="activity-kind">
        <EntityMark
          address={item.token?.address_hash || hash}
          src={item.token?.icon_url}
          label={item.token?.symbol || type}
        />
        <span className="method">{type.replaceAll("-", " ")}</span>
      </span>
      <div>
        {hash ? (
          <Copyable value={hash} link={`/tx/${hash}`} />
        ) : (
          <span className="mono">#{item.index ?? "—"}</span>
        )}
        <small>
          {item.timestamp
            ? age(item.timestamp)
            : item.method || item.type || "Chain event"}
        </small>
      </div>
      <div className="generic-address">
        <Copyable
          value={addressOf(item.from)}
          link={
            addressOf(item.from)
              ? `/address/${addressOf(item.from)}`
              : undefined
          }
        />
        <ArrowRight />
        <Copyable
          value={addressOf(item.to)}
          link={
            addressOf(item.to) ? `/address/${addressOf(item.to)}` : undefined
          }
        />
      </div>
      <strong>
        {item.total?.value != null
          ? `${num(scaled(item.total.value, item.token?.decimals), 4)} ${item.token?.symbol || ""}`
          : eth(item.value)}
      </strong>
    </div>
  );
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
            ? `Token ${item.token?.symbol || ""} ${item.token_id || ""}`
            : "Native balance or contract storage"}
        </small>
      </div>
      <div>
        <small>Before</small>
        <strong className="mono">{item.balance_before ?? "—"}</strong>
      </div>
      <ArrowRight />
      <div>
        <small>Change</small>
        <strong
          className={
            String(item.change || "").startsWith("-") ? "negative" : "positive"
          }
        >
          {item.change ?? "—"}
        </strong>
      </div>
    </div>
  );
}

function Tokens() {
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  useEffect(() => {
    get("/explorer/tokens")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <PageIntro
        eyebrow="TOKENS & NFTS"
        title={t("tokens")}
        text={t("tokenDirectory")}
      >
        <SearchBox compact />
      </PageIntro>
      <div className="table-shell">
        <div className="table-toolbar">
          <span>Sorted by circulating market cap</span>
          <span>Ink index</span>
        </div>
        {!data && !error ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} />
        ) : (
          <div className="token-table">
            <div className="token-table-head">
              <span>Asset</span>
              <span>Type</span>
              <span>Price</span>
              <span>Holders</span>
              <span>Market cap</span>
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
                    <strong>{token.name || "Unknown token"}</strong>
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
      </div>
    </>
  );
}

function TokenDetail({ id }: { id: string }) {
  const [token, setToken] = useState<any>();
  const [data, setData] = useState<any>();
  const [tab, setTab] = useState("transfers");
  const [params, setParams] = useState("");
  const [error, setError] = useState("");
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
    get(`/explorer/tokens/${id}/${tab}${params}`)
      .then((value) => request === dataRequest.current && setData(value))
      .catch(
        (e) =>
          request === dataRequest.current &&
          setData({ items: [], error: e.message }),
      );
  }, [id, tab, params]);
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
          <span>Reference price</span>
          <strong>{money(token.exchange_rate)}</strong>
        </div>
      </section>
      <section className="address-summary">
        <Metric label={t("holders")} value={num(token.holders_count)} />
        <Metric
          label="Total supply"
          value={compact(scaled(token.total_supply, token.decimals))}
          note={`${token.decimals} decimals`}
        />
        <Metric
          label="Market cap"
          value={money(token.circulating_market_cap)}
        />
        <Metric label={t("volume24h")} value={money(token.volume_24h)} />
      </section>
      <div className="tabs">
        <button
          className={tab === "transfers" ? "active" : ""}
          onClick={() => {
            setTab("transfers");
            setParams("");
          }}
        >
          Transfers
        </button>
        <button
          className={tab === "holders" ? "active" : ""}
          onClick={() => {
            setTab("holders");
            setParams("");
          }}
        >
          Holders
        </button>
        {token.type !== "ERC-20" && (
          <button
            className={tab === "instances" ? "active" : ""}
            onClick={() => {
              setTab("instances");
              setParams("");
            }}
          >
            Token instances
          </button>
        )}
      </div>
      <div className="table-shell address-activity">
        {!data ? (
          <Loading />
        ) : data.items?.length ? (
          tab === "transfers" ? (
            data.items.map((t: any, i: number) => (
              <GenericActivity
                key={t.transaction_hash || i}
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
          <Empty>{data.error || `No ${tab} found.`}</Empty>
        )}
        {data?.next_page_params && (
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
  const dataRequest = useRef(0);
  useEffect(() => {
    const request = ++dataRequest.current;
    setFailed(false);
    setError("");
    setInstance(undefined);
    Promise.all([
      get(`/explorer/tokens/${id}/instances/${encodeURIComponent(tokenId)}`),
      get(`/explorer/tokens/${id}`),
      get(
        `/explorer/tokens/${id}/instances/${encodeURIComponent(tokenId)}/transfers`,
      ),
    ])
      .then(([item, collection, activity]) => {
        if (request !== dataRequest.current) return;
        setInstance(item);
        setToken(collection);
        setTransfers(activity);
      })
      .catch(
        (e) => request === dataRequest.current && setError(e.message),
      );
  }, [id, tokenId]);
  if (!instance && !error) return <Loading />;
  if (error) return <ErrorState error={error} />;
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
            <Definition label="Transfers">
              {num(instance.transfers_count || transfers?.items?.length)}
            </Definition>
            <Definition label="Collection">
              <button className="text-link" onClick={() => go(`/token/${id}`)}>
                {token.name} ({token.symbol})
              </button>
            </Definition>
            <Definition label="Contract">
              <Copyable value={id} link={`/address/${id}`} />
            </Definition>
          </dl>
          {instance.external_app_url && (
            <a
              className="external-action"
              href={instance.external_app_url}
              target="_blank"
              rel="noreferrer"
            >
              External collection <ExternalLink />
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
                    `Attribute ${index + 1}`}
                </span>
                <strong>{String(attribute.value ?? "—")}</strong>
              </article>
            ))}
          </div>
        </section>
      )}
      <section className="nft-activity">
        <SectionTitle eyebrow="TRANSFERS" title={t("latestActivity")} />
        <div className="table-shell">
          {transfers?.items?.length ? (
            transfers.items.map((item: any, index: number) => (
              <GenericActivity
                key={item.transaction_hash || index}
                item={item}
                type="NFT transfer"
              />
            ))
          ) : (
            <Empty />
          )}
        </div>
      </section>
      <details className="raw-metadata">
        <summary>{t("metadata")} · JSON</summary>
        <pre>{JSON.stringify(instance.metadata || {}, null, 2)}</pre>
      </details>
      <section className="methodology">
        <span>CHECK BEFORE USE</span>
        <p>
          Confirm the contract address before interacting. Collection owners may
          be able to change NFT metadata or media.
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
        {large && <small>{pool.dex?.name || "Decentralised exchange"}</small>}
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
      throw new Error("Pool catalogue returned a repeated cursor");
    seenCursors.add(query);
  }
  throw new Error("Pool catalogue exceeded the safe pagination limit");
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
        eyebrow="DEX POOLS"
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
        <div className="pool-filter-grid">
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
        <span>MARKET DATA</span>
        <p>
          Pool and price data comes from Blockscout Contract Info and
          GeckoTerminal. Thin markets can show delayed or misleading values.
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
          <span>LIQUIDITY POOL · {network.name.toUpperCase()}</span>
          <PoolPair pool={pool} large />
          <Copyable value={id} display={id} />
        </div>
        <div className="pool-actions">
          <button onClick={() => go(`/address/${id}`)}>
            {t("openAddress")} <ArrowRight />
          </button>
          {pool.coin_gecko_terminal_url && (
            <a
              href={pool.coin_gecko_terminal_url}
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
          note="USD value reported by market index"
        />
        <Metric
          label={t("volume24h")}
          value={money(pool.volume_usd_24h)}
          note="Reported 24-hour volume"
        />
        <Metric
          label={t("feeTier")}
          value={pool.fee == null ? "—" : `${pool.fee}%`}
          note={pool.dex?.name}
        />
        <Metric
          label={t("transactions")}
          value={compact(counters.transactions_count)}
          note={`${compact(counters.token_transfers_count)} token transfers`}
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
              <dt>Market cap</dt>
              <dd>{money(pool.base_token_market_cap_usd)}</dd>
            </div>
            <div>
              <dt>Fully diluted value</dt>
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
              <dt>Market cap</dt>
              <dd>{money(pool.quote_token_market_cap_usd)}</dd>
            </div>
            <div>
              <dt>Fully diluted value</dt>
              <dd>{money(pool.quote_token_fully_diluted_valuation_usd)}</dd>
            </div>
          </dl>
        </article>
        <article className="pool-contract">
          <span>POOL CONTRACT</span>
          <h2>
            {address?.implementations?.[0]?.name ||
              address?.name ||
              "Automated market maker"}
          </h2>
          <dl>
            <div>
              <dt>{t("verified")}</dt>
              <dd>{address?.is_verified ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt>{t("proxyType")}</dt>
              <dd>{address?.proxy_type || "None"}</dd>
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
        <SectionTitle eyebrow="POOL TRANSACTIONS" title={t("latestActivity")} />
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
        <span>CHECK BEFORE USE</span>
        <p>
          Confirm both token addresses. Liquidity and volume come from
          third-party market data and can change quickly.
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
        <small>{item.address?.is_contract ? "Contract" : "Account"}</small>
      </div>
      <strong>
        {num(value, 6)} <small>{symbol}</small>
      </strong>
    </div>
  );
}

function AdvancedPage() {
  const [mode, setMode] = useState("deposits");
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
        eyebrow="BRIDGE & AA"
        title="Advanced activity"
        text="Ink deposits, withdrawals and ERC‑4337 user operations."
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
      <div className="tabs advanced-tabs">
        <button
          className={mode === "deposits" ? "active" : ""}
          onClick={() => {
            setMode("deposits");
            setParams("");
          }}
        >
          L1 → L2 deposits
        </button>
        <button
          className={mode === "withdrawals" ? "active" : ""}
          onClick={() => {
            setMode("withdrawals");
            setParams("");
          }}
        >
          L2 → L1 withdrawals
        </button>
        <button
          className={mode === "userops" ? "active" : ""}
          onClick={() => {
            setMode("userops");
            setParams("");
          }}
        >
          User operations
        </button>
      </div>
      <section className="protocol-note">
        <TerminalSquare />
        <div>
          <strong>
            {mode === "deposits"
              ? "Messages entering Ink"
              : mode === "withdrawals"
                ? "Messages exiting Ink"
                : "ERC‑4337 smart accounts"}
          </strong>
          <p>
            {mode === "deposits"
              ? "Deposits originate on Ethereum and are executed as transactions on Ink."
              : mode === "withdrawals"
                ? "Withdrawals pass through the Optimism proving and challenge lifecycle before finalization."
                : "Bundled operations executed through an EntryPoint contract, with their fee and inclusion transaction."}
          </p>
        </div>
      </section>
      <div className="table-shell advanced-list">
        <div className="table-toolbar">
          <span>
            {data ? `${data.items?.length || 0} shown` : "Loading records"}
          </span>
          <span>Ink index</span>
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
          <Empty>No records found.</Empty>
        )}
        {data?.next_page_params && (
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
          {item.status ? "Success" : "Failed"}
        </StatusPill>
        <div>
          <Copyable value={item.hash} display={short(item.hash, 10, 8)} />
          <small>
            {age(item.timestamp)} · EntryPoint {item.entry_point_version}
          </small>
        </div>
        <div>
          <small>Smart account</small>
          <Copyable value={addr} link={`/address/${addr}`} />
        </div>
        <div>
          <small>Included in</small>
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
        <small>{withdrawal ? "From" : "L1 origin"}</small>
        <Copyable
          value={withdrawal ? addressOf(item.from) : item.l1_transaction_origin}
          link={withdrawal ? `/address/${addressOf(item.from)}` : undefined}
        />
      </div>
      <div>
        <small>L1 transaction</small>
        {item.l1_transaction_hash ? (
          <Copyable value={item.l1_transaction_hash} />
        ) : (
          <span>{item.status || "Pending"}</span>
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
        eyebrow="API & STREAM"
        title="Developer API"
        text="Read-only explorer routes, live WebSocket events and local node status."
      />
      <section className="developer-grid">
        <article>
          <TerminalSquare />
          <span>EXPLORER API</span>
          <h2>Chain data</h2>
          <code>{API}/explorer/blocks</code>
          <code>{API}/explorer/transactions</code>
          <code>{API}/explorer/tokens</code>
          <p>
            Blockscout API v2 data. Responses are cached locally; the last valid
            response is used during rate limits.
          </p>
        </article>
        <article>
          <Activity />
          <span>LIVE STREAM</span>
          <h2>WebSocket</h2>
          <code>{location.protocol === "https:" ? "wss" : "ws"}://{location.host}{API}/live</code>
          <code>ink-observer.live.v1</code>
          <code>{API}/live/status</code>
          <p>
            New block and node-status messages every two seconds. Frames include
            sequence IDs and timestamps; clients reconnect automatically.
          </p>
        </article>
        <article>
          <BarChart3 />
          <span>NODE & STATS</span>
          <h2>Node and charts</h2>
          <code>{API}/network</code>
          <code>{API}/stats/counters</code>
          <code>{API}/stats/lines/activeAccounts</code>
          <p>
            Current OP-Reth status, Blockscout counters and the time series used
            on the analytics page.
          </p>
        </article>
      </section>
      <section className="methodology">
        <span>SECURITY</span>
        <p>
          Indexed data uses GET and WebSocket. POST {API}/contract-rpc only
          allows reads and simulations; the server cannot sign or broadcast.
        </p>
        <p>
          Your wallet submits a contract transaction only after you confirm
          it. Keep local node credentials on the server.
        </p>
      </section>
    </>
  );
}

function Contracts() {
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  useEffect(() => {
    get("/explorer/smart-contracts")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <PageIntro
        eyebrow="VERIFIED SOURCE"
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
                <span>{contract.compiler_version || "Source available"}</span>
              </footer>
            </button>
          ))
        )}
      </div>
    </>
  );
}

function StatChart({
  title,
  value,
  note,
  points,
  labels,
  color,
  formatValue = compact,
  selectedLabel,
  onSelectLabel,
  approximateLast = false,
}: {
  title: string;
  value: string;
  note: string;
  points: number[];
  labels: string[];
  color?: string;
  formatValue?: (value: number) => string;
  selectedLabel: string | null;
  onSelectLabel: (label: string | null) => void;
  approximateLast?: boolean;
}) {
  const selected = selectedLabel ? labels.indexOf(selectedLabel) : -1;
  return (
    <div className="stat-chart">
      <div>
        <span>{title}</span>
        <strong>{selected >= 0 ? formatValue(points[selected]) : value}</strong>
      </div>
      <Sparkline
        points={points}
        labels={labels}
        color={color}
        height={115}
        formatValue={formatValue}
        selectedLabel={selectedLabel}
        onSelectLabel={onSelectLabel}
        ariaLabel={title}
        approximateLast={approximateLast}
      />
      <p>{note}</p>
    </div>
  );
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
  const [focusDate, setFocusDate] = useState<string | null>(null);
  const [showData, setShowData] = useState(false);
  const dataTableRef = useRef<HTMLElement>(null);
  const dataRequest = useRef(0);
  const grain = period >= 365 ? "WEEK" : "DAY";
  const choosePeriod = (days: number) => {
    setPeriod(days);
    setFocusDate(null);
    const u = new URL(location.href);
    u.searchParams.set("range", String(days));
    history.replaceState({}, "", `${u.pathname}${u.search}`);
  };
  useEffect(() => {
    const request = ++dataRequest.current;
    const to = new Date().toISOString().slice(0, 10),
      from = new Date(Date.now() - (period - 1) * 86400000)
        .toISOString()
        .slice(0, 10),
      q = `?from=${from}&to=${to}&resolution=${grain}`;
    setData(undefined);
    setError("");
    Promise.all([
      get("/explorer/stats"),
      get(`/stats/lines/newTxns${q}`),
      get("/explorer/blocks"),
      get("/stats/counters"),
      get(`/stats/lines/activeAccounts${q}`),
      get(`/stats/lines/newAccounts${q}`),
      get(`/stats/lines/averageTxnFee${q}`),
      get(`/stats/lines/txnsSuccessRate${q}`),
      get(`/stats/lines/newBlocks${q}`),
    ])
      .then(
        ([
          stats,
          chart,
          blocks,
          counters,
          active,
          newAccounts,
          fees,
          success,
          newBlocks,
        ]) => {
          if (request !== dataRequest.current) return;
          setData({
            stats,
            chart: chart.chart || [],
            blocks: blocks.items || [],
            counters: counters.counters || [],
            active: active.chart || [],
            newAccounts: newAccounts.chart || [],
            fees: fees.chart || [],
            success: success.chart || [],
            newBlocks: newBlocks.chart || [],
            updatedAt: new Date().toISOString(),
          });
        },
      )
      .catch(
        (e) => request === dataRequest.current && setError(e.message),
      );
  }, [period, grain, refresh]);
  if (!data && !error) return <Loading label="Calculating network signals" />;
  if (error) return <ErrorState error={error} />;
  const ordered = (rows: any[]) =>
    [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
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
  const focused = focusDate ? labels.indexOf(focusDate) : -1;
  const utilRows = [...data.blocks].reverse(),
    util = utilRows.map((b: any) => Number(b.gas_used_percentage)),
    utilLabels = utilRows.map((b: any) => b.timestamp);
  const counter = Object.fromEntries(data.counters.map((x: any) => [x.id, x]));
  const rows = (key: string) => ordered(data[key]);
  const series = (key: string) => rows(key).map((x: any) => Number(x.value));
  const labelsFor = (key: string) => rows(key).map((x: any) => x.date);
  const last = (key: string) => series(key).at(-1);
  const success = series("success").map((v: number) => v * 100);
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
    a.download = `ink-analytics-${period}d.csv`;
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
          behavior: "smooth",
          block: "start",
        }),
      ),
    );
  };
  return (
    <>
      <PageIntro
        eyebrow="NETWORK STATS"
        title="Ink analytics"
        text="Compare transactions, active accounts, fees and success rate. Select a range or inspect any chart point."
      >
        <div className="analytics-controls">
          <div className="period-switch">
            {[
              [7, "7D"],
              [30, "30D"],
              [90, "90D"],
              [180, "6M"],
              [365, "1Y"],
            ].map(([days, label]) => (
              <button
                key={days}
                className={period === days ? "active" : ""}
                onClick={() => choosePeriod(Number(days))}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="analytics-actions">
            <button onClick={toggleData} className={showData ? "active" : ""}>
              <Table2 /> Data
            </button>
            <button onClick={exportCsv}>
              <Download /> CSV
            </button>
            <button
              aria-label="Refresh analytics"
              onClick={() => setRefresh((v) => v + 1)}
            >
              <RefreshCw />
            </button>
          </div>
        </div>
      </PageIntro>
      <section className="analytics-counters">
        <Metric
          label="Active accounts"
          value={compact(last("active"))}
          note={`latest ${grain.toLowerCase()}`}
        />
        <Metric
          label="Contracts today"
          value={compact(counter.lastNewContracts?.value)}
          note={`${compact(counter.lastNewVerifiedContracts?.value)} verified`}
        />
        <Metric
          label="Account abstraction"
          value={compact(counter.totalUserOps?.value)}
          note={`${compact(counter.totalAccountAbstractionWallets?.value)} AA wallets`}
        />
        <Metric
          label="Fees · 24h"
          value={unit(counter.txnsFee24h?.value, " ETH", 4)}
          note={`${unit(counter.averageTxnFee24h?.value, " ETH", 8)} average`}
        />
        <Metric
          label="Token contracts"
          value={compact(counter.totalTokens?.value)}
          note={`${compact(counter.totalVerifiedContracts?.value)} verified contracts`}
        />
      </section>
      <section className="analytics-freshness">
        <span>
          {grain === "DAY" ? "Daily" : "Weekly"} grain · {c.length} observations
        </span>
        <span>
          Updated {new Date(data.updatedAt).toLocaleTimeString()} · latest
          interval may be partial
        </span>
      </section>
      <section className="analytics-lead">
        <div>
          <span>
            {grain === "DAY" ? "DAILY" : "WEEKLY"} TRANSACTIONS ·{" "}
            {period === 365 ? "1 YEAR" : `${period} DAYS`}
          </span>
          <strong>{compact(focused >= 0 ? vals[focused] : vals.at(-1))}</strong>
          <Sparkline
            points={vals}
            labels={labels}
            height={220}
            selectedLabel={focusDate}
            onSelectLabel={setFocusDate}
            ariaLabel={`${grain.toLowerCase()} transactions over ${period} days`}
            approximateLast={Boolean(c.at(-1)?.is_approximate)}
          />
          <div className="chart-axis">
            <span>{dateText(c[0]?.date)}</span>
            <span>{dateText(c.at(-1)?.date)}</span>
          </div>
        </div>
        <aside>
          <Metric
            label="Period average"
            value={compact(avg)}
            note={`${grain.toLowerCase()} transactions`}
          />
          <Metric
            label="Period total"
            value={compact(total)}
            note={`${c.length} observations`}
          />
          <Metric
            label="Period high"
            value={compact(peak)}
            note={
              peak === undefined
                ? "Observation unavailable"
                : dateText(c[vals.indexOf(peak)]?.date)
            }
          />
        </aside>
      </section>
      {showData && (
        <section className="analytics-data" ref={dataTableRef}>
          <div className="panel-head">
            <h3>Exact values</h3>
            <span>
              {period} day range · {grain.toLowerCase()} grain
            </span>
          </div>
          <div>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Transactions</th>
                  <th>Active accounts</th>
                  <th>New accounts</th>
                  <th>Success</th>
                  <th>Avg. fee</th>
                  <th>Blocks</th>
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
                      <td>{dateText(item.date)}</td>
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
        <div className="analytic-card">
          <div className="analytic-label">
            <Gauge />
            <span>Recent block utilization</span>
            <strong>
              {unit(
                util.length
                  ? util.reduce((a: number, b: number) => a + b, 0) /
                      util.length
                  : undefined,
                "%",
              )}
            </strong>
          </div>
          <Sparkline
            points={util}
            labels={utilLabels}
            color="#0c8b68"
            formatValue={(v) => `${v.toFixed(2)}%`}
            ariaLabel="Gas utilization for recent blocks"
          />
          <p>Gas used as a share of capacity in the latest indexed blocks.</p>
        </div>
        <div className="analytic-card">
          <div className="analytic-label">
            <Fuel />
            <span>Gas price</span>
            <strong>{unit(data.stats.gas_prices?.average, " Gwei")}</strong>
          </div>
          <div className="gas-scale">
            <span>
              <i style={{ width: "34%" }} />
              Slow · {unit(data.stats.gas_prices?.slow, " Gwei")}
            </span>
            <span>
              <i style={{ width: "58%" }} />
              Standard · {unit(data.stats.gas_prices?.average, " Gwei")}
            </span>
            <span>
              <i style={{ width: "82%" }} />
              Fast · {unit(data.stats.gas_prices?.fast, " Gwei")}
            </span>
          </div>
          <p>Slow, standard and fast estimates reported by Blockscout.</p>
        </div>
        <div className="analytic-card">
          <div className="analytic-label">
            <Timer />
            <span>Block cadence</span>
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
          <p>Average time between indexed Ink blocks.</p>
        </div>
        <div className="analytic-card dark">
          <div className="analytic-label">
            <TrendingUp />
            <span>All-time totals</span>
            <strong>{compact(data.stats.total_transactions)}</strong>
          </div>
          <dl>
            <div>
              <dt>Blocks indexed</dt>
              <dd>{compact(data.stats.total_blocks)}</dd>
            </div>
            <div>
              <dt>Gas used today</dt>
              <dd>{compact(data.stats.gas_used_today)}</dd>
            </div>
            <div>
              <dt>ETH reference</dt>
              <dd>{money(data.stats.coin_price)}</dd>
            </div>
          </dl>
        </div>
      </section>
      <section className="stat-library">
        <SectionTitle
          eyebrow={`${period} DAY RANGE`}
          title="Accounts, fees and reliability"
        />
        <div className="stat-chart-grid">
          <StatChart
            title={`${grain === "DAY" ? "Daily" : "Weekly"} active accounts`}
            value={compact(last("active"))}
            note="Accounts active during each interval."
            points={series("active")}
            labels={labelsFor("active")}
            color="#7136f3"
            selectedLabel={focusDate}
            onSelectLabel={setFocusDate}
          />
          <StatChart
            title="New accounts"
            value={compact(last("newAccounts"))}
            note="Addresses first seen during each interval."
            points={series("newAccounts")}
            labels={labelsFor("newAccounts")}
            color="#d45b31"
            selectedLabel={focusDate}
            onSelectLabel={setFocusDate}
          />
          <StatChart
            title="Transaction success"
            value={unit(
              last("success") === undefined
                ? undefined
                : last("success")! * 100,
              "%",
            )}
            note="Transactions completed without a revert."
            points={success}
            labels={labelsFor("success")}
            formatValue={(v) => `${v.toFixed(2)}%`}
            color="#087d5b"
            selectedLabel={focusDate}
            onSelectLabel={setFocusDate}
          />
          <StatChart
            title="Average transaction fee"
            value={unit(last("fees"), " ETH", 9)}
            note="Average execution and L1 data fee."
            points={series("fees")}
            labels={labelsFor("fees")}
            formatValue={(v) => `${v.toFixed(9)} ETH`}
            color="#222226"
            selectedLabel={focusDate}
            onSelectLabel={setFocusDate}
          />
          <StatChart
            title="Blocks produced"
            value={compact(last("newBlocks"))}
            note="Blocks added during each interval."
            points={series("newBlocks")}
            labels={labelsFor("newBlocks")}
            color="#2b70c9"
            selectedLabel={focusDate}
            onSelectLabel={setFocusDate}
          />
          <div className="stat-chart statement">
            <span>7-DAY COMPARISON</span>
            <strong>
              {last("active") === undefined
                ? "The latest active-account comparison is unavailable."
                : last("active")! >
                    series("active")
                      .slice(-8, -1)
                      .reduce((a: number, b: number) => a + b, 0) /
                      Math.max(1, series("active").slice(-8, -1).length)
                  ? "Active accounts are above the previous 7-day average."
                  : "Active accounts are below the previous 7-day average."}
            </strong>
            <p>
              Select any chart to compare the same date across all five series.
            </p>
          </div>
        </div>
      </section>
      <section className="counter-library">
        <SectionTitle eyebrow="TOTALS" title="Network totals" />
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
        <span>DATA SOURCES</span>
        <p>
          Charts and totals come from Ink’s Blockscout statistics API. Head,
          peers and finality come from the OP-Reth and OP Node running on this
          machine. The latest interval may be incomplete.
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
        eyebrow="LOCAL NODE"
        title="Network health"
        text="OP-Reth and OP Node status reported by this machine."
      />
      <section className="health-banner">
        <div>
          <Activity />
          <div>
            <span>STATUS</span>
            <h2>{data.online ? data.synced ? `Synced to ${network.name}` : data.stale ? `${network.name} node behind` : `Syncing ${network.name}` : `${network.name} node unavailable`}</h2>
            <p>
              Checked {new Date(data.sampledAt).toLocaleTimeString()} ·
              refreshes every five seconds
            </p>
          </div>
        </div>
        <StatusPill ok={data.online && data.synced}>{data.online ? data.synced ? "Operational" : data.stale ? "Behind" : "Syncing" : "Unavailable"}</StatusPill>
      </section>
      {data.online && data.sync && data.syncProgress && <section className="sync-progress" aria-label="Node synchronization progress">
        <h2>Downloading and executing chain history</h2>
        <p>The explorer index remains available while this local node synchronizes. These counters measure downloads since the node started, not overall synchronization completion.</p>
        <dl><div><dt>Headers received</dt><dd>{num(data.syncProgress.headersDownloaded)}</dd></div><div><dt>Block bodies received</dt><dd>{num(data.syncProgress.bodiesDownloaded)}</dd></div><div><dt>Rollup target</dt><dd>{num(data.syncProgress.target)}</dd></div></dl>
      </section>}
      <section className="health-grid">
        <Metric
          label="Chain head"
          value={num(data.head)}
          note={`safe at ${num(data.safeBlock)}`}
          icon={<Blocks />}
        />
        <Metric
          label="Finalized"
          value={num(data.finalizedBlock)}
          note={`${num(data.finalityLag)} block lag`}
          icon={<ShieldCheck />}
        />
        <Metric
          label="Rollup peers"
          value={num(data.rollupPeers)}
          note={`${num(data.topicPeers)} on Ink block topic`}
          icon={<Network />}
        />
        <Metric
          label="Known peers"
          value={num(data.knownPeers)}
          note={`${num(data.routingTablePeers)} in routing table`}
          icon={<Database />}
        />
      </section>
      <section className="network-detail">
        <div className="peer-visual">
          <div className="peer-core">
            <img src="/brand/ink-symbol.svg" alt="" aria-hidden="true" />
            <span>THIS NODE</span>
          </div>
          {Array.from({ length: 12 }, (_, i) => (
            <i
              key={i}
              style={{ transform: `rotate(${i * 30}deg) translateY(-128px)` }}
            />
          ))}
          <span className="peer-count">
            {data.rollupPeers}
            <small>live peers</small>
          </span>
        </div>
        <div className="network-facts">
          <SectionTitle eyebrow="NODE DETAILS" title="OP-Reth full node" />
          <dl>
            <div>
              <dt>Execution client</dt>
              <dd>OP-Reth v2.4.1</dd>
            </div>
            <div>
              <dt>Rollup client</dt>
              <dd>OP Node v1.19.5</dd>
            </div>
            <div>
              <dt>Chain ID</dt>
              <dd>{data.chainId}</dd>
            </div>
            <div>
              <dt>Execution peers</dt>
              <dd>{data.executionPeers}</dd>
            </div>
            <div>
              <dt>Sync state</dt>
              <dd>{data.online ? data.synced ? "At head" : data.stale ? `Last block ${num(data.blockAgeSeconds)} seconds ago` : "Synchronizing" : "Unavailable"}</dd>
            </div>
            <div>
              <dt>L1 head observed</dt>
              <dd>{num(data.l1Head)}</dd>
            </div>
          </dl>
        </div>
      </section>
      <section className="rpc-community">
        <div>
          <Network />
          <div>
            <span>L1 FAILOVER</span>
            <h3>{isTestnet ? "Ethereum Sepolia RPC" : "Ethereum RPC failover"}</h3>
            <p>
              {isTestnet ? "The rollup node derives Ink Sepolia from Ethereum Sepolia using public execution and beacon endpoints. No failover relay is configured." : "Public L1 RPC endpoints sit behind a local circuit breaker. RPC keys never reach the browser."}
            </p>
          </div>
        </div>
        <div>
          <StatusPill ok={Boolean(data.l1Rpc?.online)}>
            {isTestnet ? "Direct connection" : data.l1Rpc?.online ? "Available" : "Degraded"}
          </StatusPill>
          <small>
            {isTestnet ? "See L1 head observed above" : `${rpcReady}/${rpcUpstreams.length} upstreams ready`}
          </small>
        </div>
      </section>
      {data.disk && (
        <section className="storage">
          <div>
            <span>NODE STORAGE</span>
            <strong>
              {bytes(used)} <small>used of {bytes(data.disk.total)}</small>
            </strong>
          </div>
          <div className="storage-bar">
            <i style={{ width: `${pct}%` }} />
          </div>
          <div>
            <span>{pct.toFixed(1)}% used</span>
            <span>{bytes(data.disk.free)} available</span>
          </div>
        </section>
      )}
      <section className="node-note">
        <ShieldCheck />
        <div>
          <h3>About this node</h3>
          <p>
            This machine executes Ink blocks and keeps its RPC private. It
            checks the public index against local chain data. It is not the
            Kraken sequencer and earns no staking or mining rewards.
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
      </div>
      <div>
        <span>{t("build")}</span>
        <button onClick={() => go("/developers")}>
          {t("developerAccess")}
        </button>
        <a href="https://docs.inkonchain.com" target="_blank" rel="noreferrer">
          {t("documentation")} <ExternalLink />
        </a>
        <a
          href={network.explorer}
          target="_blank"
          rel="noreferrer"
        >
          {t("officialExplorer")} <ExternalLink />
        </a>
      </div>
      <div className="footer-status">
        <StatusPill ok={Boolean(live.connected && live.network?.online && live.network?.synced)}>{!live.connected ? "Connecting" : !live.network?.online ? "Node unavailable" : live.network?.stale ? "Node behind" : !live.network?.synced ? "Node syncing" : t("operational")}</StatusPill>
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
  const base: Record<string, [string, string]> = {
    home: ["Ink Explorer — Ink Mainnet", t("defaultDescription")],
    blocks: [
      t("blocksTitle"),
      "Latest Ink Mainnet blocks with transaction counts, gas use, size and fees.",
    ],
    transactions: [
      t("txTitle"),
      "Search confirmed Ink transactions, token transfers and internal contract calls.",
    ],
    tokens: [t("tokenTitle"), t("tokenDirectory")],
    pools: [t("poolsTitle"), t("poolIntro")],
    contracts: [t("contractTitle"), t("contractDirectory")],
    analytics: [
      t("analyticsTitle"),
      "Ink transactions, active accounts, fees, success rate and downloadable history.",
    ],
    advanced: [
      "Ink bridge and account abstraction activity",
      "Optimism deposits, withdrawals and ERC-4337 user operations on Ink Mainnet.",
    ],
    developers: [
      "Ink Explorer developer API",
      "Read-only Ink explorer routes, WebSocket events and local OP-Reth status.",
    ],
    network: [
      t("networkTitle"),
      "OP-Reth and OP Node head, finality, peer, sync and storage status from this machine.",
    ],
  };
  if (view.name === "search")
    return [
      view.query ? `Ink search: ${view.query}` : "Search Ink",
      "Search addresses, verified contracts, tokens, blocks and transactions on Ink Mainnet.",
    ];
  if (view.name === "transaction")
    return [
      `Ink transaction ${short(view.id, 12, 10)}`,
      `Status, fees, transfers, logs, state changes and execution trace for Ink transaction ${view.id}.`,
    ];
  if (view.name === "block")
    return [
      `Ink block ${view.id}`,
      `Transactions, gas, fees, size and hashes for Ink block ${view.id}.`,
    ];
  if (view.name === "address")
    return [
      `Ink address ${short(view.id, 12, 10)}`,
      `Balance, assets, NFTs, activity, contract source and deployment details for Ink address ${view.id}.`,
    ];
  if (view.name === "token")
    return [
      `Ink token ${short(view.id, 12, 10)}`,
      `Supply, holders, transfers and NFT instances for Ink token ${view.id}.`,
    ];
  if (view.name === "nft")
    return [
      `Ink NFT ${view.tokenId}`,
      `Owner, metadata, attributes, media and transfer history for NFT ${view.tokenId} on Ink.`,
    ];
  if (view.name === "pool")
    return [
      `Ink pool ${short(view.id, 12, 10)}`,
      `Liquidity, 24-hour volume, fee tier, paired tokens, DEX and contract activity for Ink pool ${view.id}.`,
    ];
  return base[view.name] || [t("pageNotFound"), t("defaultDescription")];
}

export default function App() {
  const live = useLiveStream();
  const [locale, setLocale] = useState<Locale>(() => {
    const value = initialLocale();
    activeLocale = value;
    return value;
  });
  const [view, setView] = useState(route());
  useEffect(() => {
    const f = () => setView(route());
    addEventListener("popstate", f);
    return () => removeEventListener("popstate", f);
  }, []);
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
    content = <LedgerList type="blocks" live={live} />;
  else if (view.name === "transactions")
    content = <LedgerList type="transactions" live={live} />;
  else if (view.name === "block" && view.id)
    content = <BlockDetail id={view.id} />;
  else if (view.name === "transaction" && view.id)
    content = <TxDetail id={view.id} />;
  else if (view.name === "address" && view.id)
    content = <AddressDetail id={view.id} />;
  else if (view.name === "tokens") content = <Tokens />;
  else if (view.name === "token" && view.id)
    content = <TokenDetail id={view.id} />;
  else if (view.name === "nft" && view.id && view.tokenId)
    content = <NftDetail id={view.id} tokenId={view.tokenId} />;
  else if (view.name === "pools") content = <Pools />;
  else if (view.name === "pool" && view.id)
    content = <PoolDetail id={view.id} />;
  else if (view.name === "contracts") content = <Contracts />;
  else if (view.name === "analytics") content = <Analytics />;
  else if (view.name === "advanced") content = <AdvancedPage />;
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
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Header
        current={view.name}
        live={live}
        locale={locale}
        onLocale={chooseLocale}
      />
      <main id="main-content">{content}</main>
      <Footer live={live} />
    </>
  );
}
