import { readStartupSearch, finishStartupSearch } from "./startup-search";
import PageDataNotice from "./PageDataNotice";
import { homeGuideCopy, homeDataCopy } from "./home-guide-copy";
import { initialRecord, initialProfile } from "./initial-record";
import { recordOverview, type RecordKind } from "./record-arrival";
import "./record-arrival.css";
import { useLedgerPage } from "./useLedgerPage";
import {addressActivityFrame, readAddressTransactions} from "./address-activity";
import {addressTransactionSlots, type TransactionSlot} from "./address-transaction-slots";
import type {LedgerPage} from "./ledger-page";
import "./ledger-history.css";
import { useNetworkObservation } from "./useNetworkObservation";
import { useDirectoryPages, directoryResponse } from "./useDirectoryPages";
import "./directory-pages.css";
import { LedgerViewport, LedgerPager, LedgerScroll } from "./LedgerViewport";
import LedgerSkeleton from "./LedgerSkeleton";
import { chartScale, chartTickLabels } from "./chart-scale";
import { IndexedHeadContext } from "./IndexedHeadContext";
import {RollingCount,RollingStatisticsContext,useRollingStatistics} from "./RollingCount";
import { CanonicalBlockCountContext } from "./CanonicalBlockCountContext";
import { canonicalBlockCount } from "./chain-statistics";
import { IndexedUpdates } from "./IndexedUpdates";
import { indexedHead } from "./indexed-updates";
import { ExplorerLink, ExplorerNavigationProvider } from "./ExplorerLink";
import {
  cloneElement,
  FormEvent,
  ReactNode,
  useEffect,
  useLayoutEffect,
  useId,
  useMemo,
  memo,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import {
  Activity,
  CircleX,
  CircleCheck,
  CircleDashed,
  ArrowDownUp,
  ArrowDownLeft,
  ArrowRight,
  TriangleAlert,
  ArrowUp,
  ArrowUpRight,
  BarChart3,
  Blocks,
  Box,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronsLeft,
  ChevronRight,
  CircleDot,
  Code2,
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
import { formatMessage, isLocale, localeNames, locales, message, loadLocale, type Locale } from "./i18n";
import { mergeLiveTransactions, mergeLiveBlocks, applyLiveFrame, isCurrentNetwork, observeBlockCanonicality, type CanonicalObservation } from "./live-ledger";
import { Navigation } from "./Navigation";
import { LiveAge } from "./LiveAge";
import { Info } from "./Info";
import { formatCounterValue, formatCompactGas } from "./counter-format";
import { dailyTransactionChange } from "./home-data";
import { additiveCharts, chartRequest, chartRequestQuery, normalizeChartSeries, type ChartPoint } from "./chart-data";
import { useStatisticsCounters } from "./useCurrentStatistics";
import { observePageResource } from "./page-resource";
import {readPoolCatalogue,readPoolMarket,readPoolContract} from "./pool-market";
import {useCurrentSnapshot} from "./useCurrentSnapshot";
import {useAddressBalance} from "./useAddressBalance";
import {useRankedSnapshot} from "./useRankedSnapshot";
import {normalizeAddressProfile,normalizeAddressCounters,normalizeAddressAssetCount} from "./address-data";
import {normalizeAccountInventory} from "./inventory-data";
import {normalizeNftInstance,normalizeNftInstances,normalizeNftTransferCount} from "./nft-data";
import { readCurrentJson } from "./statistics-request";
// Preserve the filter styles' position before the later global overrides.
import "./activity.css";
import { FilterErrorBoundary } from "./FilterErrorBoundary";
import { normalizeTransactionFilters, readTransactionFilters, transactionFilterCount, type TransactionFilterState } from "./transaction-filters";
import { EntityMark } from "./EntityMark";
import { TokenMark } from "./TokenMark";
import { CursorPagination, useCursorPages } from "./CursorPagination";
import { TransferNfts } from "./TransferNfts";
import { transferNfts } from "./transfer-data";
import { TOKEN_STANDARDS, readTokenFilters, tokenCursorQuery, tokenListQuery, tokenOnchainCap, tokenFiatValue, tokenUsd, normalizeTokenProfile, normalizeTokenDirectory, normalizeTokenHolders, type TokenFilters } from "./token-data";
import {UsdValue} from "./UsdValue";
import { logoUrl, thumbnailUrl } from "./media";
import {useNftArtwork,nftArtwork} from "./useNftArtwork";
import {NftMedia} from "./NftMedia";
import { CopyableValue } from "./CopyableValue";
import { canonicalDocumentOrigin, parseExplorerPath, updatePageMetadata } from "./page-seo";
import { explorerPageMetadata } from "./page-metadata";
import { ExplorerDirectory } from "./ExplorerDirectory";
import Apps from "./Apps";
import Statistics from "./Statistics";
import { savedLanguage, saveLanguage } from "./browser-preferences";
import { blockFinality, cursorQuery, executionFee, transactionState, stateChangeText, formatWei, formatChainAmount, mergeIndexedBlocks } from "./explorer-data";
import { API, basePath, network, networkPath, isTestnet, liveWebSocketUrl, resolveLiveWebSocketUrl, externalDestination } from "./network";
import { requestJson, explorerRequestTimeout, resetDataFreshness, waitForRequestRetry } from "./api-request";
import { preloadApps, cancelAppsPreload } from "./apps-resource";
import { isEcosystemAppId } from "./ink-ecosystem-route";
import { resolveSearchDestination, searchResultDestination, searchCursorQuery } from "./search";
import { poolContractAddress } from "./pool-identity";
import { loadIndexedBlockResource, type BlockResourceKind } from "./block-indexing";
import { useTransactionFollow } from "./useTransactionFollow";
import "./explorer-pages.css";
const Approvals = lazy(() => import("./Approvals"));
const ContractInteraction = lazy(() => import("./ContractInteraction"));
const FilteredActivity = lazy(() => import("./FilteredActivity"));
const ApiDocs = lazy(() => import("./ApiDocs"));
const LedgerPages = lazy(() => import("./LedgerPages"));
const TokenTransfers = lazy(() => import("./TokenTransfers"));
const TransactionFilters = lazy(() => import("./TransactionFilters").then(module => ({ default: module.TransactionFilters })));
const ExplorerPages = lazy(() => import("./ExplorerPages"));

const AddressHistory = lazy(() => import("./ExplorerPages").then(module => ({ default: module.AddressHistory })));
const UserOperationsList = lazy(() => import("./ExplorerPages").then(module => ({ default: module.UserOperationsList })));
const AssetFlows = lazy(() => import("./ExplorerPages").then(module => ({ default: module.AssetFlows })));
import { activityKeys, downloadCsv, activityState } from "./activity-data";
import type { ExplorerPageProps } from "./ExplorerPageShell";

const canonicalOrigin = canonicalDocumentOrigin(document, location.href);
const forceNoindex = document.documentElement.dataset.robotsPolicy === "noindex";

type AnyRow = Record<string, any>;
type View = { name: string; id?: string; tokenId?: string; query?: string };
type LiveData = {
  connected: boolean;
  initialPending?: boolean;
  polling?: boolean;
  sequence: number;
  sentAt?: string;
  network?: AnyRow;
  block?: AnyRow;
  transactions?: AnyRow[];
  blocks?: AnyRow[];
  utilization?: AnyRow;
  rolling24h?: AnyRow;
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
let cachedFormats: {
  locale: Locale;
  numbers: Map<string, Intl.NumberFormat>;
  relative: Map<string, Intl.RelativeTimeFormat>;
} | undefined;
function localeFormats() {
  if (cachedFormats?.locale !== activeLocale) {
    cachedFormats = { locale: activeLocale, numbers: new Map(), relative: new Map() };
  }
  return cachedFormats;
}
function localizedNumber(value: number, options: Intl.NumberFormatOptions) {
  const formats = localeFormats().numbers;
  const key = JSON.stringify(options);
  let formatter = formats.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(activeLocale, options);
    formats.set(key, formatter);
  }
  return formatter.format(value);
}
function num(value: unknown, digits = 0) {
  const n = finiteNumber(value);
  return n !== null
    ? localizedNumber(n, {
        maximumFractionDigits: digits,
      })
    : "—";
}
function compact(value: unknown) {
  const n = finiteNumber(value);
  return n !== null
    ? localizedNumber(n, {
        notation: "compact",
        maximumFractionDigits: 2,
      })
    : "—";
}
function money(value: unknown) {
  return <UsdValue value={value} locale={activeLocale}/>;
}
function eth(wei: unknown, digits = 5) {
  const formatted = formatChainAmount(wei, 18, activeLocale, digits);
  return <bdi dir="ltr">{formatted === "—" ? formatted : `${formatted} ETH`}</bdi>;
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
  return amount === null || precision === null || !Number.isInteger(precision) || precision < 0 || precision > 255
    ? undefined : amount / 10 ** precision;
}
function age(date: string, style: "narrow" | "short" = "short") {
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
  const formats = localeFormats().relative;
  let formatter = formats.get(style);
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(activeLocale, { numeric: "always", style });
    formats.set(style, formatter);
  }
  return formatter.format(-value, unit);
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
    ? value?.ens_domain_name || value?.metadata?.tags?.find((tag: AnyRow) => tag.tagType === "name")?.name || value?.implementations?.find((item: AnyRow) => item.name)?.name || value?.name
    : null;
}
async function get<T = any>(path: string, signal?: AbortSignal): Promise<T> {
  try {
    const count = /^\/explorer\/optimism\/(?:batches|games|deposits|withdrawals)\/count$/.test(path);
    const body = await requestJson<T>(`${API}${path}`, { signal }, explorerRequestTimeout(path), count ? "count" : "object");
    if (body == null && !path.endsWith("/check")) throw new Error("invalidApiResponse");
    return body;
  } catch (error) {
    if (signal?.aborted) throw error;
    const key = error instanceof Error ? error.message : "Data source unavailable";
    throw new Error(t(key));
  }
}

async function getLedger(path: string, signal?: AbortSignal) {
  await waitForRequestRetry(`${API}${path}`, signal);
  return get(path, signal);
}

function useLiveStream(): LiveData {
  const [live, setLive] = useState<LiveData>({ connected: false, initialPending: true, sequence: 0 });
  useEffect(() => {
    if (/bot\b|crawler|spider|slurp|GoogleOther|bingpreview/i.test(navigator.userAgent)) {
      setLive(v => ({ ...v, initialPending: false }));
      return;
    }
    let stopped = false,
      offline = navigator.onLine === false,
      suspended = document.visibilityState === "hidden" || offline,
      generation = 0,
      urlReady = false,
      socket: WebSocket | undefined,
      retry = 0,
      timer: number | undefined;
    let pollTimer: number | undefined;
    let pollController: AbortController | undefined;
    let configController: AbortController | undefined;
    let pollFailures = 0;
    let socketHealthy = false, lastSocketFrame=0;
    const active = (epoch: number) => !stopped && !suspended && !offline && epoch === generation;
    const accept = (msg: AnyRow, polling: boolean) => {
      if (stopped || suspended || msg.protocol !== "ink-observer.live.v1" || (msg.network?.expectedChainId != null ? msg.network.expectedChainId !== network.chainId : (msg.network?.chainId !== network.chainId && !(msg.network?.chainId == null && msg.network?.online === false))) || !["welcome", "network", "block", "snapshot"].includes(msg.type)) return;
      if (msg.network?.chainId != null && msg.network.chainId !== network.chainId) return;
      if (!polling) {socketHealthy = true;lastSocketFrame=performance.now();retry=0;}
      setLive(previous => ({ connected: true, initialPending: false, polling, sequence: msg.sequence || 0, sentAt: msg.sentAt,
        ...applyLiveFrame(previous, msg.network?.chainId === network.chainId ? msg : {...msg,delta:false,blocks:[],transactions:[]}), utilization: msg.network?.chainId === network.chainId ? msg.utilization : null, rolling24h:msg.rolling24h, network: msg.network, block: msg.network?.chainId === network.chainId ? msg.block : undefined, event: msg.type }));
    };
    const poll = async () => {
      const epoch = generation;
      if (!active(epoch)) return;
      if(socketHealthy && performance.now()-lastSocketFrame>12000){socketHealthy=false;setLive(v=>({...v,connected:false}));socket?.close();}
      if (!socketHealthy) {
        const controller = new AbortController();
        pollController = controller;
        try {
          const msg = await requestJson<AnyRow>(`${API}/live/snapshot`, { signal: controller.signal }, 12000);
          if (active(epoch)) pollFailures = 0;
          if (active(epoch) && !socketHealthy) {
            accept(msg, true);
            // A response for the wrong chain is still a completed attempt.
            setLive(v => v.initialPending ? { ...v, initialPending: false } : v);
          }
        } catch { if (active(epoch) && !socketHealthy) { pollFailures++; setLive(v => ({ ...v, connected: false, initialPending: false, polling: false })); } }
        finally { if (pollController === controller) pollController = undefined; }
      }
      if (active(epoch)) pollTimer = window.setTimeout(poll, Math.min(4000 * 2 ** Math.min(pollFailures, 4), 60000));
    };
    const connect = () => {
      const epoch = generation;
      if (!active(epoch) || !urlReady || socket) return;
      const connection = new WebSocket(liveWebSocketUrl, "ink-explorer.delta.v1");
      socket = connection;
      const current = () => active(epoch) && socket === connection;
      // An open transport is not yet evidence of fresh, correctly scoped data.
      connection.onmessage = e => { if (current()) { try { accept(JSON.parse(e.data), false); } catch { /* Ignore malformed frames. */ } } };
      connection.onclose = () => {
        if (!current()) return;
        socket = undefined;
        socketHealthy = false;
        setLive(v => v.polling ? v : { ...v, connected: false });
        timer = window.setTimeout(connect, Math.min(1000 * 2 ** Math.min(retry++, 6), 60000));
      };
      connection.onerror = () => { if (current()) connection.close(); };
    };
    const configure = () => {
      const epoch = generation;
      const controller = new AbortController();
      configController = controller;
      resolveLiveWebSocketUrl(controller.signal).then(() => {
        if (active(epoch) && !controller.signal.aborted) {
          urlReady = true;
          connect();
        }
        if (configController === controller) configController = undefined;
      });
    };
    const pause = () => {
      suspended = true;
      generation++;
      clearTimeout(timer);
      clearTimeout(pollTimer);
      pollController?.abort();
      pollController = undefined;
      configController?.abort();
      configController = undefined;
      urlReady = false;
      socketHealthy = false;
      if (socket) {
        socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
        socket.close();
        socket = undefined;
      }
      if (!stopped) setLive(v => ({ ...v, connected: false, polling: false }));
    };
    const resume = () => {
      if (stopped || !suspended || offline || navigator.onLine === false || document.visibilityState === "hidden") return;
      suspended = false;
      retry = 0;
      pollFailures = 0;
      configure();
      void poll();
    };
    // Close before a document is cached; React remains mounted during bfcache.
    // Restoring it must use fresh transports and reject pre-navigation callbacks.
    window.addEventListener("pagehide", pause);
    window.addEventListener("pageshow", resume);
    const goOffline=()=>{offline=true;pause();};
    const goOnline=()=>{offline=false;resume();};
    window.addEventListener("offline",goOffline);
    window.addEventListener("online",goOnline);
    const visibility = () => document.visibilityState === "hidden" ? pause() : resume();
    document.addEventListener("visibilitychange", visibility);
    // A healthy socket supplies the initial snapshot itself. Give its welcome
    // frame a bounded window before downloading the same large snapshot over
    // HTTP. A stalled configuration, silent socket or rejected frame still
    // reaches the fallback; pause() also cancels this initial timer.
    if (!suspended) { configure(); pollTimer = window.setTimeout(poll, 1000); }
    return () => {
      stopped = true;
      window.removeEventListener("pagehide", pause);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("offline",goOffline);
      window.removeEventListener("online",goOnline);
      document.removeEventListener("visibilitychange", visibility);
      pause();
    };
  }, []);
  return live;
}

// The app uses the History API rather than a routing dependency. The server
// serves the same shell with route-specific crawl metadata for every route.
function route(): View {
  const parsed = parseExplorerPath(location.pathname.slice(basePath.length) || "/", basePath);
  if (!parsed) return { name: "not-found" };
  return parsed.name === "search" ? { ...parsed, query: new URLSearchParams(location.search).get("q") || "" } : parsed;
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
  // pushState emits no event. Reuse the Back/Forward path so navigation also
  // cancels an outstanding hash search.
  dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
}

function sectionChoice(fallback: string, allowed: string[], aliases: Record<string,string> = {}) {
  const value = new URLSearchParams(location.search).get("tab") || fallback;
  const selected = aliases[value] || value;
  return allowed.includes(selected) ? selected : fallback;
}
function addressSection() {
  return sectionChoice("transactions", ["overview", "transactions", "history", "userops", "approvals", "tokens", "nft", "token-transfers", "internal-transactions", "logs", "contract", "read", "write"], {details:"overview",txs:"transactions",account_history:"history",coin_balance_history:"history",user_ops:"userops",token_transfers:"token-transfers",internal_txns:"internal-transactions"});
}
function explorerProps(page: string, id?: string, live?: LiveData): ExplorerPageProps {
  return { page, id, live, locale: activeLocale, t, go, get,
    identity: (value, link, label) => <Copyable value={value} link={link} display={label || value} />,
    transaction: item => <TxRow locale={activeLocale} tx={item} />, block: item => <BlockRow locale={activeLocale} block={item} />,
    activity: (item,type) => <GenericActivity item={item} type={type} />,
    chart: (metric, title, unit, resolutions) => {
      const ratio = metric === "txnsSuccessRate" || metric === "networkUtilization";
      const suffix = ratio ? "%" : unit ? t(unit) : "";
      return <StatChart metric={metric} title={title} note={suffix} refresh={0} enableData detailed={page === "stats" && !!id} tickMultiplier={ratio ? 100 : 1} resolutions={resolutions} units={ratio ? null : unit || null} formatValue={value => {
        const amount = ratio ? value * 100 : value;
        const digits = ratio || !unit || unit === "Bytes" ? 2 : 9;
        const formatted = amount > 0 && amount < 10 ** -digits
          ? localizedNumber(amount, {notation:"scientific", maximumFractionDigits:3})
          : num(amount, digits);
        return `${formatted}${suffix ? ` ${suffix}` : ""}`;
      }} />;
    },
    historyChart: items => <Sparkline points={items.map(item => scaled(item.value, 18) || 0)} labels={items.map(item => item.date)} height={160} ariaLabel={t("Historical ETH balance")} formatValue={value => `${num(value, 9)} ETH`} />,
  };
}

function Brand() {
  return (
    <ExplorerLink
      className="brand"
      to={"/"}
      aria-label={t("explorerHome")}
    >
      <img src="/brand/block-lens/wordmark.svg" width="168" height="54" alt="" />
    </ExplorerLink>
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
  const [market, setMarket] = useState<AnyRow>();
  const [marketPending, setMarketPending] = useState(true);
  useEffect(() => {
    if (isTestnet) return;
    return observePageResource({
      interval: 60000,
      load: signal => readCurrentJson<AnyRow>("/explorer/stats", signal),
      expiresAt: snapshot => snapshot.expiresAt,
      onStart: () => setMarketPending(true),
      onSuspend: () => { setMarket(undefined); setMarketPending(false); },
      onValue: snapshot => { setMarket(snapshot.data); setMarketPending(false); },
      onError: () => { setMarket(undefined); setMarketPending(false); },
    });
  }, []);
  const language = <label className="language-picker"><Languages aria-hidden="true"/><span className="sr-only">{t("language")}</span><select aria-label={t("language")} value={locale} onChange={e => onLocale(e.target.value as Locale)}>{locales.map(code => <option key={code} value={code}>{localeNames[code]}</option>)}</select><ChevronDown className="language-chevron" size={14} aria-hidden="true"/></label>;
  const headerGas=isCurrentNetwork(live) ? formatCompactGas(live.network?.gasPriceWei,locale) : "N/A";
  return <Navigation current={current} t={t} brand={<Brand/>} search={<SearchBox compact initialQuery={current === "search" ? new URLSearchParams(location.search).get("q") || "" : ""}/>} preferences={language}
    market={<><span className="market-eth"><img src="/brand/eth.svg" width="15" height="20" alt=""/>ETH <strong>{isTestnet ? t("testnetLabel") : market?.coin_price != null ? money(market.coin_price) : marketPending ? <PendingValue small/> : "N/A"}</strong></span><ExplorerLink to="/gas-tracker"><Fuel size={15} aria-hidden="true"/><span title={headerGas!=="N/A" ? gasPrice({wei:live.network?.gasPriceWei}) : undefined}>{headerGas === "N/A" && live.initialPending ? <PendingValue small/> : headerGas}</span></ExplorerLink></>}
    status={<><label className="network-picker"><span className="sr-only">{t("network")}</span><select aria-label={t("network")} value={isTestnet ? "sepolia" : "mainnet"} onChange={e => { location.href = `${e.target.value === "sepolia" ? "/testnet" : ""}/${activeLocale === "en" ? "" : `?lang=${activeLocale}`}`; }}><option value="mainnet">Ink Mainnet</option><option value="sepolia">Ink Sepolia</option></select></label><span hidden data-live-head={isCurrentNetwork(live) ? live.block?.height ?? "" : ""} data-live-transport={live.connected ? live.polling || live.network?.liveTransport === "polling" ? "http" : "websocket" : "offline"}/></>}/ >;
}

function Copyable({value,display,link}:{value:string;display?:string;link?:string}) {
  return <CopyableValue value={value} display={display} link={link} t={t}/>;
}

function SearchBox({ compact = false, initialQuery = "" }: { compact?: boolean; initialQuery?: string }) {
  const [startup] = useState(readStartupSearch);
  const [q, setQ] = useState(initialQuery || startup?.value || "");
  const previousInitialQuery = useRef(initialQuery);
  const [narrow,setNarrow] = useState(() => matchMedia("(max-width: 760px)").matches);
  useEffect(()=>{const media=matchMedia("(max-width: 760px)");const update=()=>setNarrow(media.matches);media.addEventListener("change",update);return()=>media.removeEventListener("change",update);},[]);
  const [searching, setSearching] = useState(false);
  const searchRequest = useRef<AbortController | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    finishStartupSearch(startup);
    const input = ref.current;
    if (!startup || !input) return;
    // Restore before paint so the keyboard and viewport do not see an
    // intermediate frame with the focus moved away from the search.
    if (startup.focus === "input") input.focus({ preventScroll: true });
    if (startup.selectionStart !== null && startup.selectionEnd !== null)
      input.setSelectionRange(startup.selectionStart, startup.selectionEnd, startup.selectionDirection || "none");
    if (startup.focus === "submit") input.closest("form")?.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus({ preventScroll: true });
  }, [startup]);
  useEffect(() => {
    if (previousInitialQuery.current === initialQuery) return;
    previousInitialQuery.current = initialQuery;
    searchRequest.current?.abort(); setSearching(false); setQ(initialQuery);
  }, [initialQuery]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "/" && !e.defaultPrevented && !e.ctrlKey && !e.altKey && !e.metaKey && !e.isComposing && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName || "") && !(document.activeElement as HTMLElement)?.isContentEditable) {
        e.preventDefault();
        dispatchEvent(new Event("focus-global-search"));
      }
    };
    const cancelPendingSearch = () => {
      const controller = searchRequest.current;
      searchRequest.current = null;
      controller?.abort();
      setSearching(false);
    };
    addEventListener("keydown", key);
    addEventListener("popstate", cancelPendingSearch);
    return () => {
      searchRequest.current?.abort();
      removeEventListener("keydown", key);
      removeEventListener("popstate", cancelPendingSearch);
    };
  }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = q.trim();
    if (!value) return;
    searchRequest.current?.abort();
    const controller = new AbortController();
    searchRequest.current = controller;
    setSearching(true);
    try {
      const destination = await resolveSearchDestination(value, (query, signal) => get(`/search?q=${encodeURIComponent(query)}`, signal), controller.signal);
      if (!controller.signal.aborted && destination) go(destination);
    } catch {
      if (!controller.signal.aborted) go(`/search?q=${encodeURIComponent(value)}`);
    } finally {
      if (searchRequest.current === controller) setSearching(false);
    }
  };
  return (
    <form
      className={cx("global-search", compact && "compact")}
      onSubmit={submit}
      aria-busy={searching}
    >
      <Search size={compact ? 17 : 20} />
      <input
        ref={ref}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={q}
        onChange={(e) => { searchRequest.current?.abort(); setSearching(false); setQ(e.target.value); }}
        placeholder={t(narrow ? "Search Ink" : "searchPlaceholder")}
        aria-label={t("search")}
        title={t("searchPlaceholder")}
      />
      <button
        className="search-submit"
        type="submit"
        disabled={searching}
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
function SectionTabs({ value, items, onChange, inline = false }: {
  value: string;
  items: [string, string][];
  onChange: (value: string) => void;
  inline?: boolean;
}) {
  const choose = (next: string) => {
    const url = new URL(location.href); url.searchParams.set("tab", next);
    history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`); onChange(next);
  };
  return <div className={cx("section-navigation", inline && "inline-section-navigation")}>
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
  help,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  icon?: ReactNode;
  help?: ReactNode;
}) {
  return (
    <div className="metric">
      <div className="metric-top">
        {help ? <Info label={label} showLabel>{help}</Info> : <><span>{label}</span>{icon}</>}
      </div>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}

function PendingValue({ small = false }: { small?: boolean }) {
  return <span className={cx("pending-value", small && "small")} role="img" aria-label={t("loadingRecords")}/>;
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
  color = "var(--purple)",
  height = 90,
  formatValue = compact,
  ariaLabel =t("Trend chart"),
  approximateLast = false,
  approximatePoints,
  endLabels,
  detailed = false,
  tickMultiplier = 1,
}: {
  points: number[];
  labels?: string[];
  color?: string;
  height?: number;
  formatValue?: (value: number) => string;
  ariaLabel?: string;
  approximateLast?: boolean;
  approximatePoints?: boolean[];
  endLabels?: string[];
  detailed?: boolean;
  tickMultiplier?: number;
}) {
  const [plotSize, setPlotSize] = useState({ width: 600, height });
  const { width, height: plotHeight } = plotSize;
  const clean = points.map(value => value == null || value === ("" as unknown) ? NaN : Number(value));
  const finite = clean.filter(Number.isFinite);
  const hasPlot = finite.length >= 2;
  const [local, setLocal] = useState<number | null>(null);
  const owner = useId();
  const chartRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipLeft, setTooltipLeft] = useState(0);
  const seriesKey = `${labels[0]}|${labels.at(-1)}|${labels.length}`;
  useEffect(() => setLocal(null), [seriesKey]);
  useLayoutEffect(() => {
    const element = chartRef.current;
    if (!element) return;
    const updateSize = (width: number, height: number) => {
      if (width > 0 && height > 0) {
        setPlotSize(current => current.width === width && current.height === height ? current : { width, height });
      }
    };
    updateSize(element.clientWidth, element.clientHeight);
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      updateSize(width, height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasPlot]);
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
  if (!hasPlot)
    return (
      <div className="chart-empty" role="status" style={{ minHeight: height }}>{t("Not enough data")}
      </div>
    );
  const scale = detailed ? chartScale(finite) : null;
  const min = scale?.min ?? Math.min(...finite),
    max = scale?.max ?? Math.max(...finite),
    range = max - min || 1;
  const x = (i: number) => (i / (clean.length - 1)) * width;
  const y = (p: number) => plotHeight - 10 - ((p - min) / range) * (plotHeight - 22);
  const segments: number[][] = [];
  clean.forEach((value,index) => { if (!Number.isFinite(value)) return; if (!index || !Number.isFinite(clean[index-1])) segments.push([]); segments.at(-1)!.push(index); });
  const d = segments.map(indices=>indices.map((i,j)=>`${j ? "L" : "M"}${x(i)},${y(clean[i])}`).join(" ")).join(" ");
  const area = segments.map(indices=>`${indices.map((i,j)=>`${j ? "L" : "M"}${x(i)},${y(clean[i])}`).join(" ")} L${x(indices.at(-1)!)},${plotHeight} L${x(indices[0])},${plotHeight} Z`).join(" ");
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
  const plot = (
    <div
      ref={chartRef}
      className="interactive-chart"
      data-points={clean.length}
      style={detailed ? undefined : { height: `clamp(${height}px, 10vw, ${height * 1.25}px)` }}
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
        <defs><linearGradient id={`chart-fill-${owner}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".16"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
        {!detailed && <path d={area} fill={`url(#chart-fill-${owner})`}/>}
        <path
          className="gridline"
          d={scale ? scale.ticks.map(value=>`M0 ${y(value)}H${width}`).join(" ") : `M0 ${plotHeight * 0.33}H${width}M0 ${plotHeight * 0.66}H${width}`}
        />
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {segments.filter(indices=>indices.length===1).map(([index])=><circle key={index} className="chart-isolated-point" cx={x(index)} cy={y(clean[index])} r="2.5" fill={color} />)}
        {(approximatePoints || clean.map((_,index)=>approximateLast && index===clean.length-1)).map((approximate,index)=>approximate && Number.isFinite(clean[index]) ? (
          <circle
            key={index}
            className="chart-provisional"
            cx={x(index)}
            cy={y(clean[index])}
            r="4"
            stroke={color}
          />
        ) : null)}{" "}
        {active != null && (
          <>
            <line
              className="chart-crosshair"
              x1={x(active)}
              x2={x(active)}
              y1="0"
              y2={plotHeight}
            />
            {Number.isFinite(clean[active]) && <circle
              className="chart-point"
              cx={x(active)}
              cy={y(clean[active])}
              r="5"
              fill={color}
            />}
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
          <span>{dateText(labels[active])}{endLabels?.[active] && endLabels[active] !== labels[active] ? ` – ${dateText(endLabels[active])}` : labels[active]?.length > 10 && ` · ${new Date(labels[active]).toLocaleTimeString(activeLocale, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`} · {age(labels[active])}</span>
          <strong>{(approximatePoints?.[active] ?? (approximateLast && active === clean.length - 1)) ? "≈ " : ""}{Number.isFinite(clean[active]) ? formatValue(clean[active]) : "N/A"}</strong>
        </div>
      )}
    </div>
  );
  if (!scale) return plot;
  const tickLabels=chartTickLabels(scale.ticks,activeLocale,tickMultiplier);
  const labelCount=width<480?3:5;
  const dateIndices=[...new Set(Array.from({length:labelCount},(_,index)=>Math.round(index*(clean.length-1)/(labelCount-1))))];
  const longRange=Date.parse(labels.at(-1)||"")-Date.parse(labels[0]||"")>365*86400000;
  return <div className="scaled-chart">
    <div className="chart-y-axis" aria-hidden="true">
      <div className="chart-scale-measure">{tickLabels.map((label,index)=><span key={index}>{label}</span>)}</div>
      {scale.ticks.map((value,index)=><span className="chart-y-tick" key={index} style={{top:y(value)}} data-value={value}>{tickLabels[index]}</span>)}
    </div>
    {plot}
    <div className="chart-x-axis" aria-hidden="true">{dateIndices.map((index,position)=><span key={index} style={{left:`${index/(clean.length-1)*100}%`,transform:position===0?"none":position===dateIndices.length-1?"translateX(-100%)":"translateX(-50%)"}} title={dateText(labels[index])}>{new Date(labels[index]).toLocaleDateString(activeLocale,{month:"short",...(longRange?{year:"2-digit"}:{day:"numeric"}),timeZone:"UTC"})}</span>)}</div>
  </div>;
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

function UtilizationGauge({ value }: { value?: number | null }) {
  const bounded = value != null && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
  // A 240° arc and needle share (50, 48). Include the round stroke caps in the viewBox.
  const arc = "M18.823085 66 A36 36 0 1 1 81.176915 66";
  return <svg className="utilization-gauge" viewBox="0 0 100 80" aria-hidden="true">
    <path className="gauge-track" d={arc} pathLength="100"/>
    {bounded !== null && <>
      <path className="gauge-value" d={arc} pathLength="100" strokeDasharray={`${bounded} 100`}/>
      <path className="gauge-needle" d="M50 48 L26.617314 61.5" transform={`rotate(${bounded * 2.4} 50 48)`}/>
      <circle cx="50" cy="48" r="4" fill="currentColor"/>
    </>}
  </svg>;
}

const TxRow = memo(function TxRow({ tx, compactView = false, columnsView = false, rowRef }: { tx: AnyRow; compactView?: boolean; columnsView?: boolean; locale:Locale; rowRef?:(node:HTMLDivElement|null)=>void }) {
  const from = addressOf(tx.from), target = tx.to || tx.created_contract, to = addressOf(target);
  const state = transactionState(tx), failed = state === "failed";
  const type = tx.transaction_types?.some((value:string)=>value.toLowerCase()==="contract_creation") || tx.created_contract ? "contractCreation" : tx.transaction_types?.some((value: string) => /token_transfer|ERC-/.test(value)) ? "token transfer" : tx.to?.is_contract || (tx.method && !["transfer", "coin_transfer"].includes(tx.method)) ? "contractCall" : "nativeTransfer";
  const Icon = failed ? CircleX : state === "success" ? ArrowDownUp : CircleDashed;
  const labels = <div className="tx-labels"><span>{t(type)}</span>{failed && <span className="failure-label">{t("failed")}</span>}{state !== "success" && !failed && <span className="confirmation-label">{t(state)}</span>}</div>;
  return <div ref={rowRef} className={cx("tx-row", compactView ? "compact-tx-row" : "full-tx-row", tx._live && "live-arrival")}>
    <div className="tx-primary"><span className={cx("tx-type-icon", failed && "failed")} title={t(state)}><Icon size={22}/></span><div>{!columnsView && labels}<Copyable value={tx.hash} link={`/tx/${tx.hash}`}/><small><LiveAge timestamp={tx.timestamp}/></small></div></div>
    {!compactView && <>{columnsView && <div className="tx-kind">{labels}</div>}<Method tx={tx}/><ExplorerLink className="tx-block text-link" to={`/block/${tx.block_number}`}><small className="mobile-label">{t("block")}</small>{num(tx.block_number)}</ExplorerLink></>}
    <div className="flow"><span className="flow-party"><small className="mobile-label">{t("from")}</small><EntityMark address={from} entity={tx.from} label={labelOf(tx.from)}/><Copyable value={from} display={labelOf(tx.from) || short(from)} link={from ? `/address/${from}` : undefined}/></span><ArrowRight className="flow-arrow" size={14}/><span className="flow-party"><small className="mobile-label">{t("to")}</small><EntityMark address={to} entity={target} label={labelOf(target)}/><Copyable value={to} display={labelOf(target) || short(to)} link={to ? `/address/${to}` : undefined}/></span></div>
    <div className="tx-value"><strong title={exactEth(tx.value)}>{eth(tx.value)}</strong><small className="tx-fee" title={tx.fee?.value != null ? exactEth(tx.fee.value) : undefined}><span className="fee-caption">{t("fee")} </span>{tx.fee?.value != null ? eth(tx.fee.value, 9) : "—"}</small></div>
  </div>;
});

function LedgerColumns({ blocks = false, expanded = false }: { blocks?: boolean; expanded?: boolean }) {
  return <div className={cx("ledger-columns", blocks ? "block-columns" : "tx-columns")} aria-hidden="true">{blocks ? <><span>{t("block")}</span><span>{t("size")}</span><span>{t("Beneficiary")}</span><span>{t("transactions")}</span><span>{t("gasUsed")}</span></> : <><span>{t("transactionHash")}</span>{expanded && <span>{t("Type")}</span>}<span>{t("method")}</span><span>{t("block")}</span><span>{t("from")}</span><span>{t("to")}</span><span>{t("value")}</span><span>{t("fee")}</span></>}</div>;
}

const BlockRow = memo(function BlockRow({ block, compactView = false, forked = block.type === "reorg" }: { block: AnyRow; compactView?: boolean; forked?:boolean; locale:Locale }) {
  const miner = addressOf(block.miner), ratio = block.gas_limit && block.gas_used != null ? Number(block.gas_used) / Number(block.gas_limit) * 100 : finiteNumber(block.gas_used_percentage);
  return <div className={cx("block-row", compactView && "compact-block-row")}>
    <div className="block-height"><span className={cx("block-icon",forked&&"forked-block-icon")}>{forked?<TriangleAlert size={23}/>:<Box size={23}/>}</span><div><ExplorerLink to={`/block/${forked ? block.hash : block.height}`} title={forked ? block.hash : undefined}>{num(block.height)}</ExplorerLink><small><LiveAge timestamp={block.timestamp}/></small>{forked&&<small className="forked-block-hash" title={block.hash}><Copyable value={block.hash} display={short(block.hash,4,4)}/></small>}</div></div>
    {!compactView && <><div className="block-size"><small>{t("size")}</small><strong>{bytes(block.size)}</strong></div><div className="block-beneficiary"><small className="sr-only">{t("Beneficiary")}</small><EntityMark address={miner} entity={typeof block.miner === "object" ? block.miner : null}/><Copyable value={miner} display={labelOf(block.miner) || short(miner)} link={miner ? `/address/${miner}` : undefined}/></div></>}
    <div className="block-tx-count"><small>{compactView ? "Tx" : <><span className="block-count-full">{t("transactions")}</span><span className="block-count-compact" aria-hidden="true">Tx</span></>}</small><strong>{num(block.transactions_count)}</strong></div>
    <div className="block-gas"><small>{t("gasUsed")}</small><strong>{unit(ratio, "%")}</strong><span className="gas-meter" role="meter" aria-label={t("gasUsed")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={ratio ?? undefined}><i style={{width:`${Math.max(0, Math.min(100, ratio ?? 0))}%`}}/></span></div>
  </div>;
});

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

function useHomeResource(path: "/overview") {
  const [state, setState] = useState<{ data?: AnyRow; pending: boolean; error: string }>({ pending: true, error: "" });
  const [attempt, retry] = useState(0);
  useEffect(() => {
    return observePageResource({
      interval: 30000,
      onStart: () => setState(current => ({ ...current, pending: true, error: "" })),
      onSuspend: () => setState({ pending: true, error: "" }),
      load: async signal => {
        const snapshot = await readCurrentJson(path, signal), data = snapshot.data;
        const valid = path === "/overview"
          ? data.stats && typeof data.stats === "object" && !Array.isArray(data.stats)
            && [data.blocks, data.transactions, data.chart].every(Array.isArray)
          : Array.isArray(data.counters);
        if (!valid) throw new Error(t("invalidApiResponse"));
        return snapshot;
      },
      expiresAt: snapshot => snapshot.expiresAt,
      onValue: snapshot => setState({ data: snapshot.data, pending: false, error: "" }),
      onError: error => setState({ pending: false, error: t(error instanceof Error ? error.message : "unavailable") }),
    });
  }, [path, attempt]);
  return { ...state, retry: () => retry(value => value + 1) };
}

function HomeGuide() {
  const [title, introduction, transactions, transactionsText, address, addressText, statistics, statisticsText] = homeGuideCopy[activeLocale];
  const [dataTitle,usage,features,sources,documentation]=homeDataCopy[activeLocale];
  return <section className="home-guide" aria-labelledby="home-guide-title">
    <h2 id="home-guide-title">{title}</h2><p>{introduction.replace('{network}', network.name)}</p>
    <div className="home-guide-grid">
      <article><h3><ExplorerLink to="/txs"><Search aria-hidden="true"/>{transactions}</ExplorerLink></h3><p>{transactionsText}</p></article>
      <article><h3><ExplorerLink to="/accounts"><WalletCards aria-hidden="true"/>{address}</ExplorerLink></h3><p>{addressText}</p></article>
      <article><h3><ExplorerLink to="/analytics"><Activity aria-hidden="true"/>{statistics}</ExplorerLink></h3><p>{statisticsText}</p></article>
    </div>
    <div className="home-data-guide"><h2>{dataTitle}</h2><p>{usage}</p><p>{features}</p><p>{sources}</p><ExplorerLink to="/developers">{documentation}</ExplorerLink></div>
  </section>;
}

function Home({ live }: { live: LiveData }) {
  const overview = useHomeResource("/overview"), counters = useStatisticsCounters(t);
  const [feeds, setFeeds] = useState<{ blocks: AnyRow[]; transactions: AnyRow[] }>({ blocks: [], transactions: [] });
  useEffect(() => {
    setFeeds(current => ({
      blocks: mergeLiveBlocks(mergeLiveBlocks(current.blocks, overview.data?.blocks || [], 8), live.blocks?.length ? live.blocks : live.block ? [live.block] : [], 8),
      transactions: mergeLiveTransactions(mergeLiveTransactions(overview.data?.transactions || [], current.transactions, live.blocks || [], 8), live.transactions || [], live.blocks || [], 8),
    }));
  }, [overview.data, live.sequence, live.blocks, live.transactions, live.block]);
  return <>
    <section className="home-heading"><div><span className="home-network-label sr-only">{network.name}{isTestnet ? ` · ${t("testnetLabel")}` : ""}</span><h1>Ink Explorer</h1></div></section>
    <HomeData data={{ ...overview.data, ...feeds, counters: counters.data?.counters || [] }} live={live} overview={overview} counters={counters}/>
    <HomeGuide/>
  </>;
}

function HomeActivityPanel({ kind, items, live, overview, utilization, tabbed, active }: {
  kind: "blocks" | "transactions"; items: AnyRow[]; live: LiveData;
  overview: ReturnType<typeof useHomeResource>; utilization: number | null; tabbed: boolean; active: boolean;
}) {
  // Keep the target under a finger, pointer or keyboard focus unchanged while
  // the other panel and network metrics continue receiving new blocks.
  const [heldItems, setHeldItems] = useState<AnyRow[] | null>(null);
  const shown = heldItems ?? items;
  const hold = () => { if (items.length) setHeldItems(current => current ?? items); };
  const changed = heldItems !== null && (items.length !== heldItems.length || items.some((item, index) =>
    item.hash !== heldItems[index]?.hash || item.status !== heldItems[index]?.status
  ));
  return <div className="panel home-activity-panel" id={`home-feed-${kind}`} data-feed-active={active} role={tabbed ? "tabpanel" : undefined} aria-labelledby={tabbed ? `home-tab-${kind}` : undefined}
    onPointerDownCapture={event => { if (event.pointerType === "touch" || event.pointerType === "pen") hold(); }}
    onPointerEnter={event => { if (event.pointerType !== "touch") hold(); }}
    onPointerLeave={event => { if (event.pointerType === "mouse" && !event.currentTarget.contains(document.activeElement)) setHeldItems(null); }}
    onFocusCapture={event => { if (!(event.target as HTMLElement).closest(".home-feed-update")) hold(); }}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setHeldItems(null); }}>
    <div className="panel-head">
      <div className="home-feed-heading"><h3>{t(kind)}</h3>{kind === "blocks" && <span className="feed-utilization"><Gauge size={15} aria-hidden="true"/>{utilization != null ? unit(utilization, "%") : live.initialPending ? <PendingValue small/> : "N/A"}</span>}</div>
      <span className="indexed-update-slot home-feed-update">{changed && isCurrentNetwork(live) && <button type="button" className="indexed-update-button" title={t("Show updates")} aria-label={`${t(kind)} · ${t("Show updates")}`} onClick={() => setHeldItems(null)}><ArrowUp size={18} aria-hidden="true"/></button>}</span>
      <ExplorerLink to={kind === "blocks" ? "/blocks" : "/txs"}>{t("viewAll")}</ExplorerLink>
    </div>
    {kind === "blocks" ? <div className={cx("home-block-feed", !overview.pending && "settled")}>
      <div className="home-block-slots">{Array.from({ length: 6 }, (_, index) => shown[index]
        ? <BlockRow locale={activeLocale} key={`home-block:${index}`} block={shown[index]} compactView/>
        : <BlockPlaceholder key={`home-block:${index}`}/>)}</div>
      {!shown.length && <HomeFeedState resource={overview}/>}
    </div> : shown.length ? shown.slice(0, 6).map((item, index) =>
      <TxRow locale={activeLocale} key={`home-tx:${index}`} tx={item} compactView/>
    ) : <HomeFeedState resource={overview}/>}
  </div>;
}

function BlockPlaceholder() {
  return <div className="block-row home-block-placeholder" aria-hidden="true">
    <div className="block-height"><span className="block-icon"><Box size={23}/></span><div><span className="block-height-placeholder"/><small><span className="block-placeholder-bar"/></small></div></div>
    <div className="block-tx-count"><small>Tx</small><strong><span className="block-placeholder-bar"/></strong></div>
    <div className="block-gas"><small>{t("gasUsed")}</small><strong><span className="block-placeholder-bar"/></strong><span className="gas-meter"/></div>
  </div>;
}

function HomeData({ data, live, overview, counters }: {
  data: AnyRow; live: LiveData; overview: ReturnType<typeof useHomeResource>; counters: ReturnType<typeof useStatisticsCounters>;
}) {
  const [period, setPeriod] = useState(30);
  const [feed, setFeed] = useState<"transactions" | "blocks">("transactions");
  const [tabbed, setTabbed] = useState(() => matchMedia("(max-width:899px)").matches);
  useEffect(() => {
    const media = matchMedia("(max-width:899px)");
    const resize = () => setTabbed(media.matches);
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, []);
  const ready = isCurrentNetwork(live), utilization = ready ? finiteNumber(live.utilization?.percentage) : null;
  const head = ready ? finiteNumber(live.block?.height ?? live.network?.head) : null;
  const s = data.stats || {},
    history = (data.chart || []).filter((row: AnyRow) => row && typeof row.date === "string").sort((a: AnyRow, b: AnyRow) => a.date.localeCompare(b.date)),
    chart = history.slice(-period);
  const delta = dailyTransactionChange(history);
  const addressCount = finiteNumber(s.total_addresses) ?? finiteNumber(data.counters.find((item: AnyRow) => item?.id === "totalAddresses")?.value);
  const chartCount = finiteNumber(chart.at(-1)?.transactions_count);
  const overviewLoading = overview.pending && !overview.data && !overview.error;
  const countersLoading = counters.pending && !counters.data && !counters.error;
  return (
    <>
      <div className="home-overview">
        <section className="metric-grid">
          <Metric label={t("latestBlock")} value={head != null ? num(head) : live.initialPending ? <PendingValue/> : "N/A"} icon={<Blocks/>}/>
          <RollingCount t={t} variant="home"/>
          <Metric label={t("uniqueAddresses")} value={addressCount !== null ? compact(addressCount) : overviewLoading || countersLoading ? <PendingValue/> : "N/A"} icon={<WalletCards/>}/>
          <div className="metric utilization-metric"><div className="utilization-readout"><Info label={t("networkLoad")} showLabel>{t("Gas used divided by gas capacity across the latest 30 canonical blocks.")}</Info><strong>{utilization != null ? unit(utilization, "%") : live.initialPending ? <PendingValue/> : "N/A"}</strong></div><UtilizationGauge value={utilization}/></div>
        </section>
        <section className="signal-grid">
          <div className="signal-main">
            <SectionTitle
              title={t("dailyTransactions")}
              action={
                <div className="chart-heading-actions">
                  <ChartRange title={t("dailyTransactions")} value={period} onChange={setPeriod} options={chartRanges.slice(0, 2)} />
                  <ExplorerLink className="arrow-link" aria-label={t("viewAnalytics")} to={"/analytics"}>
                    <ArrowUpRight />
                  </ExplorerLink>
                </div>
              }
            />
            <div className="chart-head">
              <div>
                <strong>{chartCount !== null ? compact(chartCount) : overviewLoading ? <PendingValue/> : "N/A"}</strong>
                <span>{t("transactionsPerDay")}</span>
              </div>
              <div className={delta === null ? "home-trend-unavailable" : delta >= 0 ? "positive" : "negative"}>
                <bdi dir="ltr">{delta === null ? overviewLoading ? <PendingValue small/> : "N/A" : `${delta >= 0 ? "+" : ""}${unit(delta, "%", 1)}`}</bdi> <small>{t("previous7Days")}</small>
              </div>
            </div>
            <div className="home-chart-slot">
            {!overview.data ? <div className="home-resource-state">
              {overview.error ? <><span role="status">{t("unavailable")}</span><button onClick={overview.retry} title={overview.error}><RefreshCw size={16} aria-hidden="true"/>{t("retry")}</button></> : <Loading label={t("loadingMedia")}/>}
            </div> : <>
            <Sparkline
              points={chart.map((d: AnyRow) => finiteNumber(d.transactions_count) ?? NaN)}
              labels={chart.map((d: any) => d.date)}
              height={160}
              ariaLabel={t("dailyTransactionsChart")}
            />
            <div className="chart-axis" dir="ltr">
              <span>{chart[0]?.date}</span>
              <span>{chart.at(-1)?.date}</span>
            </div>
            </>}
            </div>
          </div>
        </section>
      </div>
      <section className="live-section">
        <h2 className="sr-only">{t("latestBlocksTransactions")}</h2>
        {<div className="home-feed-tabs" role="tablist" aria-label={t("latestBlocksTransactions")} onKeyDown={event => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === "Home" ? "transactions" : event.key === "End" ? "blocks" : feed === "transactions" ? "blocks" : "transactions";
          setFeed(next); document.getElementById(`home-tab-${next}`)?.focus();
        }}>{(["transactions", "blocks"] as const).map(kind => <button key={kind} id={`home-tab-${kind}`} role="tab" aria-selected={feed === kind} aria-controls={`home-feed-${kind}`} tabIndex={feed === kind ? 0 : -1} onClick={() => setFeed(kind)}>{kind === "transactions" ? <ArrowDownUp size={18} aria-hidden="true"/> : <Blocks size={18} aria-hidden="true"/>}{t(kind)}</button>)}</div>}
        <div className="live-columns">
          <HomeActivityPanel kind="blocks" items={data.blocks} live={live} overview={overview} utilization={utilization} tabbed={tabbed} active={feed === "blocks"}/>
          <HomeActivityPanel kind="transactions" items={data.transactions} live={live} overview={overview} utilization={utilization} tabbed={tabbed} active={feed === "transactions"}/>
        </div>
      </section>
    </>
  );
}

function HomeFeedState({ resource }: { resource: ReturnType<typeof useHomeResource> }) {
  return <div className="home-feed-state">
    {resource.error ? <ErrorState error={resource.error} onRetry={resource.retry}/> : resource.pending ? <Loading/> : <Empty/>}
  </div>;
}

// Cursor values are opaque Blockscout parameters. They are copied into the
// next request without interpreting or reordering them.
function Pagination({
  next,
  onNext,
  onReset,
  onPrevious,
  hasPrevious = false,
  canReset = true,
  page = 1,
}: {
  next?: AnyRow | null;
  onNext: () => void;
  onReset: () => void;
  onPrevious?: () => void;
  hasPrevious?: boolean;
  canReset?: boolean;
  page?: number;
}) {
  if (onPrevious) return <div className="pagination ledger-pagination-footer">
    <span>{tf("Page {page}", {page:num(page)})}</span>
    <LedgerPager t={t} bottom newest={canReset} previous={hasPrevious} older={Boolean(next)} onNewest={onReset} onPrevious={onPrevious} onOlder={onNext}/>
  </div>;
  return (
    <div className="pagination">
      <button disabled={!canReset} onClick={onReset}>
        <ChevronsLeft /> {t("newest")}
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
        <div className="page-title-line"><h1>{title}</h1></div>
        {text && <p className="page-summary">{text}</p>}
      </div>
      {children}
    </section>
  );
}

function SearchResults({ query }: { query: string }) {
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  const [pageError, setPageError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [retry, setRetry] = useState(0);
  const dataRequest = useRef(0);
  const pageController = useRef<AbortController | null>(null);
  useEffect(() => {
    const request = ++dataRequest.current;
    const controller = new AbortController();
    pageController.current?.abort();
    setData(undefined);
    setError("");
    setPageError("");
    setLoadingMore(false);
    if (!query) {
      setData({ items: [] });
      return;
    }
    get(`/search?q=${encodeURIComponent(query)}`, controller.signal)
      .then((value) => {
        if (!Array.isArray(value?.items)) throw new Error(t("invalidApiResponse"));
        if (request === dataRequest.current && !controller.signal.aborted) setData(value);
      })
      .catch(
        (e) => request === dataRequest.current && !controller.signal.aborted && setError(e.message),
      );
    return () => { controller.abort(); pageController.current?.abort(); };
  }, [query, retry]);
  const loadMore = async () => {
    if (!data?.next_page_params || loadingMore) return;
    const request = dataRequest.current;
    const controller = new AbortController();
    pageController.current = controller;
    setLoadingMore(true); setPageError("");
    try {
      const next = await get(`/search${searchCursorQuery(query, data.next_page_params)}`, controller.signal);
      if (!Array.isArray(next?.items)) throw new Error(t("invalidApiResponse"));
      if (request === dataRequest.current && !controller.signal.aborted) {
        setData((previous: any) => ({ ...next, items: [...previous.items, ...next.items] }));
      }
    } catch (error) {
      if (request === dataRequest.current && !controller.signal.aborted) setPageError(error instanceof Error ? error.message : t("Data source unavailable"));
    } finally {
      if (request === dataRequest.current && !controller.signal.aborted) setLoadingMore(false);
    }
  };
  return (
    <>
      <PageIntro
        eyebrow={t("search").toUpperCase()}
        title={query ? tf("resultsFor", { query }) : t("search")}
        text={t("searchDescription")}
      >

      </PageIntro>
      <div className="table-shell search-results">
        {!data && !error ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} onRetry={() => setRetry(value => value + 1)} />
        ) : data.items?.length ? (
          data.items.map((item: any, index: number) => {
            const href = searchResultDestination(item);
            return (
              <ExplorerLink
                key={`${item.type}-${item.address_hash || item.transaction_hash || item.block_hash || index}`}
                disabled={!href}
                to={(href) ? (href) : undefined}
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
                    {item.address_hash ??
                      item.transaction_hash ??
                      item.block_hash ??
                      item.block_number ??
                      "—"}
                  </small>
                </div>
                <ArrowRight />
              </ExplorerLink>
            );
          })
        ) : (
          <Empty>{t("noSearchResults")}</Empty>
        )}
      </div>
      {pageError && <ErrorState error={pageError} onRetry={loadMore} />}
      {data?.next_page_params && <div className="pagination"><button disabled={loadingMore} onClick={loadMore}>{loadingMore ? t("loadingRecords") : t("loadMore")} <ChevronRight /></button></div>}
    </>
  );
}

function TransactionSummary() {
  const resource=useStatisticsCounters(t), counters:AnyRow[]=resource.data?.counters || [];
  return <section className="transaction-summary" aria-busy={resource.pending}>{["newTxns24h","txnsFee24h","averageTxnFee24h"].map((id,index)=>{
    if(id === "newTxns24h")return <RollingCount key={id} t={t}/>;
    const item=counters.find(c=>c?.id === id), value=finiteNumber(item?.value);
    const title=t(item?.title || ({newTxns24h:"Transactions (24h)",txnsFee24h:"Transaction fees · 24h",averageTxnFee24h:"Avg. tx fee · 24h"}[id]!));
    return <div className="metric" key={id}><div className="metric-top">{resource.error && index===1 ? <><span>{title}</span><button type="button" className="info-button summary-retry" disabled={resource.pending} aria-label={t("retry")} title={t(resource.error)} onClick={resource.retry}><RefreshCw size={18} aria-hidden="true"/></button></> : <Info label={title} showLabel>{resource.error ? t(resource.error) : t(item?.description || "Trailing 24-hour window.")}</Info>}</div><strong title={value!==null ? String(item?.value) : undefined}>{value===null ? resource.pending && !resource.error ? <PendingValue/> : "N/A" : item?.units === "ETH" ? <><span>{formatCounterValue(item.value,activeLocale,"ETH")}</span><small>ETH</small></> : compact(item?.value)}</strong></div>;
  })}</section>;
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
  const [params, setParams] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [filters,setFilters]=useState(()=>readTransactionFilters(location.search));
  const [filterRevision,setFilterRevision]=useState(0);
  const [mode, setMode] = useState(() => type === "transactions" && initialMode === "all" && transactionFilterCount(readTransactionFilters(location.search)) ? "filtered" : initialMode);
  const [blockKind, setBlockKind] = useState(() => new URLSearchParams(location.search).get("type") === "reorg" ? "reorg" : "block");
  const [reading,setReading]=useState(false);
  const [anchor,setAnchor]=useState<number>();
  const endpoint =
    type === "transactions" && mode === "tokens"
      ? "token-transfers"
      : type === "transactions" && mode === "internal"
        ? "internal-transactions"
        : type;
  const blockParams=type === "blocks" ? new URLSearchParams(params) : null;
  if(blockParams){blockParams.delete("type");if(blockKind === "reorg")blockParams.set("type","reorg");}
  const query=blockParams?.toString();
  const url=`/explorer/${endpoint}${blockParams ? query ? `?${query}` : "" : params}`;
  const streaming=!params && mode === "all" && blockKind === "block";
  const feed=useLedgerPage({kind:type,url,enabled:mode!=="filtered",streaming,holding:reading,live,
    refresh:!params && (type === "blocks" || mode === "all"),get:getLedger});
  const {data,error}=feed;
  const retry=()=>{feed.retry();requestAnimationFrame(()=>document.getElementById("main-content")?.focus({preventScroll:true}));};
  const next = data?.next_page_params;
  const nextQuery = next
    ? `?${new URLSearchParams(
        Object.entries(next)
          .filter(([, v]) => v != null)
          .map(([k, v]) => [k, String(v)]),
      ).toString()}`
    : "";
  const pending = !data && !error;
  const newestPage = () => {
    if (pending || !params) return;
    setHistory([]);setParams("");setReading(false);setAnchor(undefined);
    requestAnimationFrame(()=>document.getElementById("main-content")?.focus({preventScroll:true}));
  };
  const previousPage = () => {
    if (pending || !history.length) return;
    setParams(history[history.length-1]);setHistory(value=>value.slice(0,-1));
  };
  const olderPage = () => {
    if (pending || error || !next) return;
    if (!params) setAnchor(Number(live?.block?.height));
    setHistory(value=>[...value,params]);setParams(nextQuery);
  };
  const applyFilters = (value: TransactionFilterState) => {
    const next=normalizeTransactionFilters(value.filters,value.status), filtered=transactionFilterCount(next)>0;
    setFilters(next);setFilterRevision(value=>value+1);setMode(filtered?"filtered":"all");setParams("");setHistory([]);setReading(false);setAnchor(undefined);
    const url = new URL(location.href);
    url.searchParams.delete("activity");url.searchParams.delete("status");for(const key of activityKeys)url.searchParams.delete(key);
    if(filtered){url.searchParams.set("activity","filtered");for(const [key,value]of Object.entries(next.filters))url.searchParams.set(key,value!);if(next.status)url.searchParams.set("status",next.status);}
    window.history.replaceState({}, "", url.pathname + url.search);
  };
  useEffect(()=>{
    if(type!=="transactions"||initialMode!=="all")return;
    const restore=()=>{const next=readTransactionFilters(location.search);setFilters(next);setMode(transactionFilterCount(next)?"filtered":"all");setFilterRevision(value=>value+1);setParams("");setHistory([]);setReading(false);setAnchor(undefined);};
    window.addEventListener("popstate",restore);return()=>window.removeEventListener("popstate",restore);
  },[type,initialMode]);
  const indexedUpdate=feed.hasUpdates || Boolean((type !== "blocks" || blockKind === "block") && (params || reading) && isCurrentNetwork(live) && anchor!=null && live?.block?.height>anchor);
  const liveUnavailable=!params && (type === "blocks" || type === "transactions" && mode === "all") && !live?.initialPending && !isCurrentNetwork(live);
  const rowCount=num(data?.items?.length||0);
  const rowCountLabel=error?t("unavailable"):data?tf("shown",{count:rowCount}):t("loadingRecords");
  return (
    <div className={`activity-ledger-page activity-ledger-${type}`}>
      <PageIntro
        eyebrow={t(type === "blocks" ? "inkBlocks" : "inkTransactions")}
        title={t(type === "blocks" ? "blocks" : initialMode === "tokens" ? "Token transfers" : initialMode === "internal" ? "Internal transactions" : "transactions")}
        text=""
      />
      {type === "transactions" && initialMode === "all" && <><TransactionSummary/><FilterErrorBoundary t={t}><Suspense fallback={<div className="transaction-filter-bar" aria-busy="true"><div className="transaction-filter-actions"><button type="button" disabled><SlidersHorizontal size={18} aria-hidden="true"/>{t("advancedFilters")}</button></div></div>}><TransactionFilters locale={activeLocale} value={filters} onApply={applyFilters}/></Suspense></FilterErrorBoundary></>}
      {type === "blocks" && <div className="ledger-filters"><label><span className="block-type-label">{t("Block type")}</span><select aria-label={t("Block type")} value={blockKind} onChange={e => {setBlockKind(e.target.value);setParams("");setHistory([]);setReading(false);setAnchor(undefined);const u=new URL(location.href);if(e.target.value === "block")u.searchParams.delete("type");else u.searchParams.set("type",e.target.value);window.history.replaceState({},"",u.pathname+u.search);}}><option value="block">{t("Canonical blocks")}</option><option value="reorg">{t("Forked blocks")}</option></select></label>{blockKind === "reorg" && <span className="block-kind-help"><TriangleAlert size={18} className="reorg-icon" aria-hidden="true"/><Info label={t("Forked blocks")}>{t("Blocks replaced by another canonical branch. Their transactions may be included again in a different block.")}</Info></span>}</div>}
      {type === "transactions" && mode === "filtered" ? <Suspense fallback={<Loading />}><FilteredActivity key={filterRevision} filters={filters.filters} status={filters.status} locale={activeLocale} columns={<LedgerColumns expanded/>} renderRow={item => <TxRow locale={activeLocale} tx={item} columnsView/>}/></Suspense> : <>
      <div className="table-shell" onPointerDownCapture={e=>{if(e.pointerType==="touch"||e.pointerType==="pen"){setReading(true);if(!params && !reading)setAnchor(Number(live?.block?.height));}}} onPointerEnter={e=>{if(e.pointerType!=="touch"){setReading(true);if(!params && !reading)setAnchor(Number(live?.block?.height));}}} onPointerLeave={e=>{if(e.pointerType==="mouse"&&!e.currentTarget.contains(document.activeElement))setReading(false);}} onFocusCapture={e=>{if((e.target as HTMLElement).closest(".new-rows-button"))return;setReading(true);if(!params && !reading)setAnchor(Number(live?.block?.height));}} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget))setReading(false);}}>
        <div className={`table-toolbar ledger-main-toolbar${indexedUpdate?' has-update':''}${liveUnavailable?' has-unavailable':''}`}>
          <span className="ledger-toolbar-count"><span className="ledger-toolbar-count-full">{rowCountLabel}</span><span className="ledger-toolbar-count-compact" aria-hidden="true">{error?'—':data?rowCount:'…'}</span></span>
          <span className="indexed-update-slot">{indexedUpdate && <button className="new-rows-button indexed-update-button" title={t("Show updates")} onClick={()=>{feed.accept();setHistory([]);setParams("");setAnchor(undefined);setReading(false);}}><ArrowUp size={18} aria-hidden="true"/><span className="sr-only">{t("Show updates")}</span></button>}</span>
          <button className="text-link ledger-toolbar-export" aria-label={t("exportPage")} title={t("exportPage")} disabled={!data?.items?.length} onClick={() => downloadCsv(`ink-${network.chainId}-${endpoint}.csv`, type === "blocks" ? ["height","hash","timestamp","transactions","gas_used","gas_limit","fees_wei"] : ["transaction_hash","timestamp","block","from","to","value_base_units","asset","token_contract","fee_wei"], (data?.items || []).map((item: AnyRow) => type === "blocks" ? [item.height,item.hash,item.timestamp,item.transactions_count,item.gas_used,item.gas_limit,item.transaction_fees] : [item.hash || item.transaction_hash,item.timestamp,item.block_number,addressOf(item.from),addressOf(item.to || item.created_contract),item.total?.value ?? item.value,item.token?.symbol || "ETH",item.token?.address_hash,item.fee?.value]))}><Download size={16} aria-hidden="true" /><span>CSV</span></button>
          <LedgerPager pending={pending} newest={!pending && Boolean(params)} previous={!pending && history.length>0} older={!pending && Boolean(next) && !error} t={t}
            onNewest={newestPage} onPrevious={previousPage} onOlder={olderPage}/>
          {liveUnavailable && <span className="data-unavailable" role="status">N/A</span>}
        </div>
        {feed.indexError && !!data?.items.length && <aside className="ledger-history-notice" role="status">
          <Info label={t("ledgerHistoryUnavailable")} showLabel>{t("ledgerHistoryHelp")}</Info>
          <button type="button" onClick={retry} disabled={feed.indexPending} aria-busy={feed.indexPending} aria-label={t(feed.indexPending ? "loadingRecords" : "retry")} title={t(feed.indexPending ? "loadingRecords" : "retry")}><RefreshCw size={18} aria-hidden="true"/></button>
        </aside>}
        {!data && !error ? (
          <LedgerSkeleton kind={type} label={t("loadingRecords")} />
        ) : error ? (
          <ErrorState error={error} onRetry={retry} />
        ) : (
          <LedgerViewport kind={type} label={t(type)}>
            {!data!.items.length && <Empty />}
            {!!data!.items?.length && (type === "blocks" || mode === "all") && <LedgerColumns blocks={type === "blocks"} expanded />}
            {data!.items?.map((item: any, index: number) =>
              type === "transactions" && mode === "all" ? (
                <TxRow locale={activeLocale} key={!params ? `live:${index}`:item.hash} tx={item} columnsView />
              ) : type === "transactions" ? (
                <GenericActivity
                  key={`${item.transaction_hash || item.index || "activity"}:${index}`}
                  item={item}
                  type={mode}
                />
              ) : (
                <BlockRow locale={activeLocale} key={!params && blockKind==="block" ? `live:${index}`:item.hash} block={item} forked={blockKind==="reorg"} />
              ),
            )}
          </LedgerViewport>
        )}
        {(data || error) && (
          <Pagination
            next={!error ? next : undefined}
            onNext={olderPage}
            onReset={newestPage}
            canReset={!pending && Boolean(params)}
            onPrevious={previousPage}
            hasPrevious={!pending && history.length>0}
            page={history.length+1}
          />
        )}
      </div>
      </>}
    </div>
  );
}

function Definition({
  label,
  children,
  wide = false,
}: {
  label: ReactNode;
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
  actions,
  className,
}: {
  kind?: string;
  title: string;
  subtitle?: string;
  status?: ReactNode;
  identifier?: boolean;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("detail-header", className)}>
      {kind && <span>{kind}</span>}
      <div>
        <h1 className={identifier ? "mono" : undefined}>{title}</h1>
        {status}
      </div>
      {subtitle && <p>{ADDRESS.test(subtitle) || TX.test(subtitle) ? <Copyable value={subtitle} display={subtitle} /> : subtitle}</p>}
      {actions && <nav className="detail-actions" aria-label={t("Block navigation")}>{actions}</nav>}
    </section>
  );
}

function requestBlockResource(id: string, kind: BlockResourceKind, signal: AbortSignal, onIndexing: () => void, query = "") {
  const suffix = kind === "transactions" ? "/transactions" : "";
  return loadIndexedBlockResource<AnyRow>({ id, kind, chainId: network.chainId, signal, onIndexing,
    request: async (requestSignal, timeout) => {
      let status = 0;
      const value = await requestJson(`${API}/explorer/blocks/${id}${suffix}${query}`, { signal: requestSignal, headers: { accept: "application/vnd.ink.indexing+json, application/json" } }, timeout, "object", (_, responseStatus) => { status = responseStatus; });
      return { value, status };
    },
  });
}

type BlockResourceState = { id: string; phase: "loading" | "indexing" | "paused" | "ready" | "error"; value?: AnyRow; error?: string };
function useBlockResource(id: string, kind: BlockResourceKind, enabled = true) {
  const [attempt, setAttempt] = useState(0);
  const seed=()=>kind==='block'&&enabled&&attempt===0?initialRecord('block',id,network.chainId):undefined;
  const [state, setState] = useState<BlockResourceState>(()=>{const initial=seed();return initial?.phase==='ready'?{id,phase:'ready',value:initial.data}:{id,phase:'loading'};});
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    const active = () => current === generation.current && !controller.signal.aborted;
    const initial=seed();
    if(initial?.phase==='ready'){
      setState({id,phase:'ready',value:initial.data});
      return()=>{generation.current++;controller.abort();};
    }
    setState({ id, phase: initial?.phase==='indexing'?'indexing':"loading" });
    if (!enabled) return () => { generation.current++; controller.abort(); };
    void requestBlockResource(id, kind, controller.signal, () => {
      if (active()) setState({ id, phase: "indexing" });
    }).then(value => {
      if (active()) setState({ id, phase: "ready", value });
    }).catch(error => {
      if (!active()) return;
      const reason = error instanceof Error ? error.message : "Data source unavailable";
      setState({ id, phase: reason === "blockIndexingExpired" ? "paused" : "error", error: reason });
    });
    return () => { generation.current++; controller.abort(); };
  }, [id, kind, attempt, enabled]);
  return { ...(state.id === id ? state : { id, phase: "loading" as const }), retry: () => setAttempt(value => value + 1) };
}

function BlockIndexingNotice({ kind, paused, onRetry }: { kind: BlockResourceKind; paused: boolean; onRetry: () => void }) {
  return <aside className="data-freshness block-indexing" role="status" data-kind={kind} data-state={paused ? "paused" : "indexing"}>
    <Timer aria-hidden="true" size={20} />
    <div><strong>{t(kind === "block" ? "blockIndexingTitle" : "blockTransactionsIndexingTitle")}</strong>
      <p>{t(paused ? "blockIndexingPaused" : kind === "block" ? "blockIndexingDescription" : "blockTransactionsIndexingDescription")}</p>
    </div>
    {paused && <button onClick={onRetry}><RefreshCw aria-hidden="true" size={16} />{t("retry")}</button>}
  </aside>;
}

function RecordArrivalHeading({kind,id}:{kind:RecordKind;id:string}) {
  const model=recordOverview({schema:1,kind,id,chainId:network.chainId,issuedAt:Date.now(),phase:'unavailable'},activeLocale,t,basePath);
  return <DetailHeader title={model.title} subtitle={model.identifier} identifier={false} className="record-arrival-header"/>;
}

function BlockDetail({ id, live }: { id: string; live: LiveData }) {
  const blockResource = useBlockResource(id, "block");
  const block = blockResource.value;
  const [tab, setTab] = useState(() => sectionChoice("overview", ["overview", "transactions"], { details: "overview", txs: "transactions" }));
  useEffect(() => setTab(sectionChoice("overview", ["overview", "transactions"], { details: "overview", txs: "transactions" })), [id]);
  // Pin the transaction list to the displayed hash, including on height routes.
  const transactionResource = useBlockResource(block?.hash || id, "transactions", !!block && tab === "transactions");
  const [previousObservation, setPreviousObservation] = useState<CanonicalObservation>();
  const observation = observeBlockCanonicality(block, live, previousObservation);
  useEffect(() => setPreviousObservation(observation), [observation]);
  const [txs, setTxs] = useState<AnyRow>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState("");
  const [pageIndexing, setPageIndexing] = useState<"" | "indexing" | "paused">("");
  const dataRequest = useRef(0);
  const pageController = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    dataRequest.current++;
    pageController.current?.abort();
    setTxs(transactionResource.value);
    setLoadingMore(false);
    setPageError("");
    setPageIndexing("");
    return () => { dataRequest.current++; pageController.current?.abort(); };
  }, [id, transactionResource.value]);
  const retryBlock = () => {
    blockResource.retry();
    if (["paused", "error"].includes(transactionResource.phase)) transactionResource.retry();
  };
  if (!block) {
    if (blockResource.phase === "indexing" || blockResource.phase === "paused") return <><RecordArrivalHeading kind="block" id={id}/><BlockIndexingNotice kind="block" paused={blockResource.phase === "paused"} onRetry={retryBlock} /></>;
    if (blockResource.phase === "error") return <><RecordArrivalHeading kind="block" id={id}/><div className="block-resource-error" data-kind="block"><ErrorState error={t(blockResource.error || "Data source unavailable")} onRetry={retryBlock} /></div></>;
    return <div className="record-arrival-loading"><RecordArrivalHeading kind="block" id={id}/><Loading /></div>;
  }
  const observedType = observation ? observation.canonicalHash === observation.hash ? "block" : "reorg" : block.type;
  const finality = blockFinality({ ...block, type: observedType }, isCurrentNetwork(live) ? live.network : undefined);
  const miner = addressOf(block.miner);
  const previousBlock = Number(block.height) > 0 && TX.test(block.parent_hash || "") ? `/block/${block.parent_hash}` : undefined;
  const nextBlock = finality !== "Forked block" && isCurrentNetwork(live) && live.network?.chainId === live.network?.expectedChainId && Number(live.network?.head) > Number(block.height) ? `/block/${Number(block.height) + 1}` : undefined;
  const loadMore = async () => {
    if (loadingMore || !txs?.next_page_params) return;
    const request = dataRequest.current;
    pageController.current?.abort();
    const controller = new AbortController();
    pageController.current = controller;
    const active = () => request === dataRequest.current && !controller.signal.aborted;
    setLoadingMore(true);
    setPageError("");
    setPageIndexing("");
    try {
      const next = await requestBlockResource(block.hash, "transactions", controller.signal, () => { if (active()) setPageIndexing("indexing"); }, cursorQuery(txs.next_page_params));
      if (active()) { setTxs((current: any) => ({ ...next, items: [...current.items, ...next.items] })); setPageIndexing(""); }
    } catch (e) {
      if (active()) {
        const reason = e instanceof Error ? e.message : "Data source unavailable";
        setPageIndexing(reason === "blockIndexingExpired" ? "paused" : "");
        if (reason !== "blockIndexingExpired") setPageError(t(reason));
      }
    } finally {
      if (active()) setLoadingMore(false);
    }
  };
  return (
    <>
      <DetailHeader
        kind={t("blockKind")}
        title={`#${num(block.height)}`}
        subtitle={tf("produced", { age: age(block.timestamp), date: new Date(block.timestamp).toLocaleString(activeLocale) })}
        status={finality==="Forked block" ? <span className="forked-block-state"><span className="status forked"><TriangleAlert size={16} aria-hidden="true"/>{t(finality)}</span><Info label={t(finality)}>{t("Blocks replaced by another canonical branch. Their transactions may be included again in a different block.")}{observation && <ExplorerLink className="text-link canonical-block-link" to={`/block/${observation.canonicalHash}`}>{t("View canonical block")}</ExplorerLink>}</Info></span> : <StatusPill ok>{t(finality)}</StatusPill>}
        actions={<><ExplorerLink to={previousBlock} aria-label={t("Previous block")} title={t("Previous block")}><ChevronLeft aria-hidden="true" size={20}/></ExplorerLink><ExplorerLink to={nextBlock} aria-label={t("Next block")} title={t("Next block")}><ChevronRight aria-hidden="true" size={20}/></ExplorerLink></>}
      />
      <SectionTabs value={tab} onChange={setTab} inline items={[["overview", t("overview")], ["transactions", `${t("transactions")} (${num(block.transactions_count)})`]]}/>
      <section className="detail-layout block-detail-layout">
        {tab === "overview" && <dl className="definitions block-definitions">
          <Definition label={t("blockHash")} wide>
            <Copyable value={block.hash} display={block.hash} />
          </Definition>
          <Definition label={t("transactions")}>
            <button className="detail-count-link" onClick={() => { const url = new URL(location.href); url.searchParams.set("tab", "transactions"); history.replaceState({}, "", `${url.pathname}${url.search}`); setTab("transactions"); }}>{num(block.transactions_count)}</button>
          </Definition>
          <Definition label={t("size")}>{bytes(block.size)}</Definition>
          <Definition label={t("gasUsed")}>
            {num(block.gas_used)}{" "}
            <small>({unit(block.gas_used_percentage, "%")})</small>
          </Definition>
          <Definition label={t("gasLimit")}>{num(block.gas_limit)}</Definition>
          <Definition label={t("baseFee")} wide>
            {num(block.base_fee_per_gas)} wei
          </Definition>
          <Definition label={<span className="definition-label-with-info">{t("l2Fees")}<Info label={t("l2Fees")}>{t("blockFeesNote")}</Info></span>} wide>
            {exactEth(block.transaction_fees)}
          </Definition>
          <Definition label={t("Beneficiary")} wide>
            <span className="flow-party detail-party"><EntityMark address={miner} entity={typeof block.miner === "object" ? block.miner : undefined}/><Copyable value={miner} display={labelOf(block.miner) || short(miner)} link={miner ? `/address/${miner}` : undefined}/></span>
          </Definition>
          <Definition label={t("parentBlock")} wide>
            <Copyable
              value={block.parent_hash}
              display={block.parent_hash}
              link={Number(block.height)>0 && TX.test(block.parent_hash || "") ? `/block/${block.parent_hash}` : undefined}
            />
          </Definition>
        </dl>}
        {tab === "transactions" && <div className="detail-feed block-transactions">
          <div className="panel-head">
            <h3>{t("transactionsInBlock")}</h3>
            <span>{tf("total", { count: num(block.transactions_count) })}</span>
          </div>
          {txs?.items?.length > 0 && <LedgerColumns/>}
          {transactionResource.phase === "indexing" || transactionResource.phase === "paused" ? <BlockIndexingNotice kind="transactions" paused={transactionResource.phase === "paused"} onRetry={transactionResource.retry} />
          : transactionResource.phase === "error" ? <div className="block-resource-error" data-kind="transactions"><ErrorState error={t(transactionResource.error || "Data source unavailable")} onRetry={transactionResource.retry} /></div>
          : !txs ? <Loading />
          : txs.items.length ? (
            txs.items.map((t: any) => <TxRow locale={activeLocale} key={t.hash} tx={t} />)
          ) : (
            <Empty>{t("blockEmpty")}</Empty>
          )}
          {pageError && <p role="alert">{pageError}</p>}
          {pageIndexing && <BlockIndexingNotice kind="transactions" paused={pageIndexing === "paused"} onRetry={loadMore} />}
          {txs?.next_page_params && pageIndexing !== "paused" && <div className="pagination">
            <button disabled={loadingMore} onClick={loadMore}>{loadingMore ? t("loadingRecords") : t("loadMore")} <ChevronRight /></button>
          </div>}
        </div>}
      </section>
    </>
  );
}

function TxDetail({ id, live }: { id: string; live: LiveData }) {
  const {tx, error, indexing, replaced, checking, confirmations, retry} = useTransactionFollow(id, network.chainId, API, live);
  const [related, setRelated] = useState<any>();
  const [tab, setTab] = useState(() => sectionChoice("overview", ["overview", "flows", "userops", "transfers", "internal", "logs", "state", "trace", "input", "l2"], {details:"overview",asset_flows:"flows",user_ops:"userops",token_transfers:"transfers",raw_trace:"trace"}));
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState("");
  const [relatedRetry, setRelatedRetry] = useState(0);
  const relatedRequest = useRef(0);
  const inclusion = `${tx?.block_number ?? "pending"}:${tx?.block_hash || ""}:${tx?.status || ""}:${replaced}`;
  useEffect(() => {
    const request = ++relatedRequest.current;
    setRelated(undefined);
    setLoadingMore(false);
    setPageError("");
    const controller = new AbortController();
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
    get(`/explorer/transactions/${id}/${endpoint}`, controller.signal)
      .then(
        (v) =>
          request === relatedRequest.current && !controller.signal.aborted &&
          setRelated(Array.isArray(v) ? { items: v } : tab === "trace" && !Array.isArray(v?.items) ? {items:v && Object.keys(v).length ? [v] : []} : v),
      )
      .catch(
        (e) =>
          request === relatedRequest.current && !controller.signal.aborted &&
          setRelated({ items: [], error: e.message }),
      );
    return () => controller.abort();
  }, [id, tab, relatedRetry, inclusion]);
  if (!tx && indexing && (!error || error === "transactionIndexingExpired")) return <>
    <DetailHeader title={t("Transaction details")} subtitle={id} identifier={false} className="transaction-detail-header"/>
    <section className="transaction-indexing-notice" role="status" data-phase={error ? "paused" : "indexing"}>
      <Timer aria-hidden="true" /><h2>{t("Transaction indexing in progress")}</h2>
      <p>{t("Included in a recent block. Details will appear once indexed.")}</p>
      {error && <button onClick={retry}>{t("retry")}</button>}
    </section>
  </>;
  if (!tx && error) return <><RecordArrivalHeading kind="transaction" id={id}/><ErrorState error={t(error)} onRetry={retry} /></>;
  if (!tx) return <div className="record-arrival-loading"><RecordArrivalHeading kind="transaction" id={id}/><Loading /></div>;
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
        title={t("Transaction details")}
        subtitle={tx.hash}
        identifier={false}
        className="transaction-detail-header"
        status={
          <StatusPill ok={state === "success" || state === "confirmed"}>
            {t(state === "pending" ? "Pending" : state)}
          </StatusPill>
        }
      />
      {replaced && <p className="notice transaction-follow-notice" role="status">{t("transactionReorganized")}</p>}
      {checking && !replaced && <p className="notice transaction-follow-notice" role="status">{t("transactionInclusionChecking")}</p>}
      {error && <p className="notice transaction-follow-notice" role="status">{t("transactionRefreshUnavailable")} <button className="text-link" onClick={retry}>{t("retry")}</button></p>}
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
        <dl className="definitions standalone transaction-definitions">
          <Definition label={t("block")} wide>
            {tx.block_number != null ? <><ExplorerLink
              className="text-link"
              to={`/block/${tx.block_number}`}
            >
              {num(tx.block_number)}
            </ExplorerLink>{" "}
            · <span data-transaction-confirmations>{tf("confirmations", { count: confirmations === null ? "N/A" : num(confirmations) })}</span></> : t("Pending")}
          </Definition>
          <Definition label={t("timestamp")} wide>
            {tx.timestamp ? <>{new Date(tx.timestamp).toLocaleString(activeLocale)} ({age(tx.timestamp)})</> : "—"}
          </Definition>
          <Definition label={t("from")} wide>
            {from ? <span className="flow-party detail-party">
              <EntityMark address={from} entity={tx.from} label={labelOf(tx.from)} />
              <Copyable value={from} display={from} link={`/address/${from}`} />
            </span> : "N/A"}
          </Definition>
          <Definition label={t("to")} wide>
            {to ? <span className="flow-party detail-party">
              <EntityMark address={to} entity={tx.to || tx.created_contract} label={labelOf(tx.to)} />
              <Copyable
                value={to}
                display={labelOf(tx.to) || to}
                link={to ? `/address/${to}` : undefined}
              />
            </span> : "N/A"}
          </Definition>
          <Definition label={t("value")}>{exactEth(tx.value)}</Definition>
          <Definition label={t("transactionFee")} wide>
            {exactEth(tx.fee?.value)}
          </Definition>
          <Definition label={t("gasUsed")}>
            {num(tx.gas_used)} / {num(tx.gas_limit)}
          </Definition>
          <Definition label={t("gasPrice")}>{num(tx.gas_price)} wei</Definition>
          <Definition label={t("method")} wide>
            {tx.method || tx.transaction_types?.length ? <Method tx={tx} /> : "N/A"}
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
          <pre tabIndex={0}>{tx.raw_input ?? "N/A"}</pre>
          {tx.decoded_input && <pre tabIndex={0}>{JSON.stringify(tx.decoded_input, null, 2)}</pre>}
          {tx.revert_reason && <pre tabIndex={0}>{typeof tx.revert_reason === "string" ? tx.revert_reason : JSON.stringify(tx.revert_reason, null, 2)}</pre>}
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
            <pre tabIndex={0}>{JSON.stringify(related.items, null, 2)}</pre>
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

function AddressDetail({ id,live }: { id: string;live:LiveData }) {
  const readers = useMemo(() => ({
    profile: async (signal: AbortSignal) => {
      const snapshot = await readCurrentJson(`/explorer/addresses/${id}`, signal);
      return {...snapshot, data: normalizeAddressProfile(snapshot.data, id, network.chainId)};
    },
    counters: async (signal: AbortSignal) => {
      const snapshot = await readCurrentJson(`/explorer/addresses/${id}/counters`, signal);
      return {...snapshot, data: normalizeAddressCounters(snapshot.data, network.chainId)};
    },
    assets: async (signal: AbortSignal) => {
      const snapshot = await readCurrentJson(`/explorer/addresses/${id}/token-balances`, signal);
      return {...snapshot, data: normalizeAddressAssetCount(snapshot.data, network.chainId)};
    },
  }), [id]);
  const seed=useMemo(()=>()=>initialProfile('address',id,network.chainId),[id]);
  const profile = useCurrentSnapshot(readers.profile, 60000, seed);
  const counts = useCurrentSnapshot(readers.counters, 60000);
  const assets = useCurrentSnapshot(readers.assets, 60000);
  const indexedAddress = profile.data;
  const failed = [profile, counts, assets].filter(resource => resource.error);
  const retrySummary = () => failed.forEach(resource => resource.retry());
  const count = (field: string) => counts.current && counts.data?.[field] != null
    ? formatChainAmount(counts.data[field], 0, activeLocale) : "N/A";
  const [data, setData] = useState<any>();
  const [pool, setPool] = useState<any>();
  const [tab, setTab] = useState(() => addressSection());
  const currentBalance=useAddressBalance(id,network.chainId,API,live,indexedAddress,!["contract","read","write"].includes(tab));
  const address=indexedAddress || (currentBalance.data ? {hash:id} : undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [dataRetry, setDataRetry] = useState(0);
  const dataRequest = useRef(0);
  const selectTab = (next: string) => {
    if(next === tab)return;
    ++dataRequest.current;
    setData(undefined);
    setLoadingMore(false);
    setTab(next);
  };
  useEffect(() => {
    setTab(addressSection());
    setData(undefined);
  }, [id]);
  useEffect(() => {
    const controller = new AbortController();
    setPool(undefined);
    if (address?.is_contract) {
      get(`/contract-info/pools/${id}/check`, controller.signal)
        .then(value => { if (!controller.signal.aborted) setPool(value); })
        .catch(() => { if (!controller.signal.aborted) setPool(null); });
    } else if (address) setPool(null);
    return () => controller.abort();
  }, [id, address?.is_contract]);
  useEffect(() => {
    const request = ++dataRequest.current;
    const controller = new AbortController();
    setLoadingMore(false);
    setData(undefined);
    if (["overview", "history", "userops", "tokens", "nft", "transactions"].includes(tab)) return;
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
  }, [id, tab, dataRetry]);
  useEffect(() => {
    if (address?.is_contract === false && ["contract", "read", "write"].includes(tab)) {
      setTab("overview");
      const url = new URL(location.href);
      url.searchParams.set("tab", "overview");
      history.replaceState({}, "", url.pathname + url.search);
    }
  }, [address?.is_contract, tab]);
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
  if (!address) {
    const heading = recordOverview({schema:1,kind:'address',id,chainId:network.chainId,issuedAt:Date.now(),phase:'unavailable'},activeLocale,t,basePath);
    // Retain the same header and copy control when the profile arrives. A user
    // may already be copying the known address while its metadata is loading.
    return <div className={cx('address-page', !profile.error && 'record-arrival-loading')}>
      <DetailHeader title={heading.title} subtitle={heading.identifier} identifier={false} className="record-arrival-header"/>
      {profile.error ? <ErrorState error={t(profile.error)} onRetry={profile.retry}/> : <Loading/>}
    </div>;
  }
  const balance = currentBalance.data?.balance;
  const name = labelOf(address) || address?.token?.name;
  const implementations = Array.isArray(address?.implementations)
    ? address.implementations.filter((item: AnyRow | null) => item && ADDRESS.test(item.address_hash))
    : [];
  const showSummary = !["contract", "read", "write"].includes(tab);
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
      {showSummary && <section className="address-summary">
        <Metric
          label={t("ETH balance")}
          value={<span data-address-balance={balance ?? ""} data-balance-block={currentBalance.data?.block.number ?? ""} data-balance-hash={currentBalance.data?.block.hash ?? ""}>{balance != null ? <bdi dir="ltr">{formatChainAmount(balance,18,activeLocale,6)}<span className="balance-unit"> ETH</span></bdi> : "N/A"}</span>}
          note={money(tokenFiatValue(balance,18,profile.current ? address.exchange_rate : undefined))}
          help={balance == null ? "N/A" : <>
            <bdi dir="ltr">{exactEth(balance)}</bdi><br />
            {t("balanceNodeSource")}
            {currentBalance.data && <> · <ExplorerLink to={`/block/${currentBalance.data.block.hash}`}>{t("block")} #{formatChainAmount(currentBalance.data.block.number,0,activeLocale)}</ExplorerLink></>}
          </>}
        />
        <Metric
          label={t("Transactions")}
          value={<bdi dir="ltr">{count("transactions_count")}</bdi>}
          note={tf("{count} token transfers", { count: count("token_transfers_count") })}
        />
        <Metric
          label={t("Token holdings")}
          value={<bdi dir="ltr">{assets.current ? num(assets.data) : "N/A"}</bdi>}
          note={t("known assets")}
        />
      </section>}
      {showSummary && failed.length > 0 && <div className="address-refresh-error">
        <ResourceError error={[...new Set(failed.map(resource => t(resource.error)))].join(" · ")}
          pending={failed.every(resource => resource.pending)} onRetry={retrySummary} />
      </div>}
      <SectionTabs value={tab} onChange={selectTab} items={[
        ["overview", t("overview")], ["transactions", t("transactions")],
        ["history", t("Account history")], ["userops", t("User operations")],
        ["tokens", t("assets")], ["nft", t("nfts")],
        ["token-transfers", t("transfers")], ["internal-transactions", t("internal")],
        ["logs", t("logs")], ["approvals", t("approvalsTitle")],
        ...(address?.is_contract ? [
          ["contract", t("contractSource")], ["read", t("readContract")],
          ["write", t("writeContract")],
        ] as [string, string][] : []),
      ]} />
      {tab === "approvals" ? <Suspense fallback={<Loading />}><Approvals address={id} locale={activeLocale} embedded /></Suspense> : tab === "overview" ? (
        <dl className="definitions standalone address-facts">
          <Definition label={t("address")} wide><Copyable value={id} display={id} /></Definition>
          {address?.ens_domain_name && <Definition label="ENS"><bdi>{address.ens_domain_name}</bdi></Definition>}
          <Definition label={t("transfers")}>{<bdi dir="ltr">{count("token_transfers_count")}</bdi>}</Definition>
          <Definition label={t("Gas consumed")}>{<bdi dir="ltr">{count("gas_usage_count")}</bdi>} <small>{t("sourceIndex")}</small></Definition>
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
            {!address?.is_verified && <Definition label={t("contractSource")}><ExplorerLink className="text-link" to={`/contract-verification?address=${id}`}>{t("Verify contract")}</ExplorerLink></Definition>}
            {pool && <Definition label={t("pool")}><ExplorerLink className="text-link" to={`/pools/${id}`}><Droplets size={16} /> {pool.base_token_symbol} / {pool.quote_token_symbol}</ExplorerLink></Definition>}
          </>}
        </dl>
      ) : tab === "history" ? (
        <Suspense fallback={<Loading />}><AddressHistory {...explorerProps("history", id)} /></Suspense>
      ) : tab === "userops" ? (
        <Suspense fallback={<Loading />}><UserOperationsList {...explorerProps("userops", id)} sender={id} /></Suspense>
      ) : tab === "tokens" || tab === "nft" ? <AccountInventory id={id} kind={tab}/> : tab === "transactions" ? <AddressTransactions key={`${network.chainId}:${id}`} id={id} live={live}/> : (
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
              ) : data.items?.length ? (
                tab === "transactions" ? (
                  <><LedgerColumns />{data.items.map((tx: any) => <TxRow locale={activeLocale} key={tx.hash} tx={tx} />)}</>
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

function AddressTransactionRows({rows,holding}:{rows:AnyRow[];holding:boolean}) {
  const committed=useRef<TransactionSlot[]>([]);
  const nodes=useRef(new Map<number,HTMLDivElement>());
  const heights=useRef(new Map<number,number>());
  const callbacks=useRef(new Map<number,(node:HTMLDivElement|null)=>void>());
  const slots=useMemo(()=>addressTransactionSlots(committed.current,rows,holding),[rows,holding]);
  const rowRef=(key:number)=>{
    if(!callbacks.current.has(key))callbacks.current.set(key,node=>{if(node)nodes.current.set(key,node);else nodes.current.delete(key);});
    return callbacks.current.get(key)!;
  };
  useLayoutEffect(()=>{
    committed.current=slots;
    for(const [key,node]of nodes.current)if(holding||!heights.current.has(key))heights.current.set(key,node.getBoundingClientRect().height);
  },[slots,holding]);
  if(!slots.length)return <Empty>{tf("No {type} indexed for this address.",{type:activityLabel("transactions")})}</Empty>;
  return <>{slots.map(slot=>slot.row
    ? <TxRow key={slot.key} rowRef={rowRef(slot.key)} tx={slot.row} locale={activeLocale} columnsView/>
    : <div key={slot.key} className="address-activity-gap" style={{height:heights.current.get(slot.key)||80}} role="status" aria-label={t("unavailable")}><TriangleAlert size={18} aria-hidden="true"/><span>N/A</span></div>)}</>;
}

function AddressTransactions({id,live}:{id:string;live:LiveData}) {
  const [reading,setReading]=useState(false);
  const [history,setHistory]=useState<LedgerPage[]>([]);
  const [historyHold,setHistoryHold]=useState(false);
  const [loadingMore,setLoadingMore]=useState(false);
  const [pageError,setPageError]=useState("");
  const moreRequest=useRef<AbortController | null>(null);
  const frame=useMemo(()=>addressActivityFrame(live,id,network.chainId),[id,live]);
  const reader=useMemo(()=>async(path:string,signal?:AbortSignal)=>readAddressTransactions(await getLedger(path,signal),id,network.chainId),[id]);
  const feed=useLedgerPage({kind:"transactions",url:`/explorer/addresses/${id}/transactions`,enabled:true,streaming:true,
    retainObserved:true,holding:reading||historyHold,live:frame,refresh:true,get:reader});
  const current=isCurrentNetwork(frame);
  const historical=history.flatMap(page=>page.items);
  const rows=mergeLiveTransactions(historical,feed.data?.items || [],current?frame.blocks || []:[],(feed.data?.items.length || 0)+historical.length)
    .filter(row=>!current || Number(row.block_number)<=Number(frame.block?.height));
  const cursor=history.length?history[history.length-1].next_page_params:feed.data?.next_page_params;
  useEffect(()=>{
    const suspend=()=>{moreRequest.current?.abort();moreRequest.current=null;setLoadingMore(false);};
    const visibility=()=>{if(document.hidden)suspend();};
    document.addEventListener("visibilitychange",visibility);
    window.addEventListener("pagehide",suspend);window.addEventListener("offline",suspend);
    return()=>{moreRequest.current?.abort();document.removeEventListener("visibilitychange",visibility);window.removeEventListener("pagehide",suspend);window.removeEventListener("offline",suspend);};
  },[]);
  useEffect(()=>{
    if(!isCurrentNetwork(frame))return;
    setHistory(pages=>{
      let changed=false;
      const next=pages.map(page=>{
        const items=mergeLiveTransactions(page.items,[],frame.blocks || [],page.items.length).filter(row=>Number(row.block_number)<=Number(frame.block?.height));
        if(items.length===page.items.length)return page;
        changed=true;return {...page,items};
      });
      return changed?next:pages;
    });
  },[frame.sequence,frame.connected]);
  const accept=()=>{
    moreRequest.current?.abort();moreRequest.current=null;setLoadingMore(false);setPageError("");
    setHistory([]);setHistoryHold(false);setReading(false);feed.accept();
  };
  const loadMore=async()=>{
    if(!cursor || moreRequest.current)return;
    const query=new URLSearchParams(Object.entries(cursor).filter(([,v])=>v!=null).map(([k,v])=>[k,String(v)])).toString();
    const controller=new AbortController();moreRequest.current=controller;
    setHistoryHold(true);setLoadingMore(true);setPageError("");
    try{
      const next=await reader(`/explorer/addresses/${id}/transactions?${query}`,controller.signal);
      if(next.next_page_params && Object.keys(next.next_page_params).length===Object.keys(cursor).length && Object.entries(cursor).every(([key,value])=>String(next.next_page_params?.[key])===String(value)))throw new Error("invalidApiResponse");
      if(!controller.signal.aborted && moreRequest.current===controller)setHistory(pages=>[...pages,next]);
    }catch(error){
      if(!controller.signal.aborted)setPageError(error instanceof Error?error.message:"Data source unavailable");
    }finally{
      if(moreRequest.current===controller){moreRequest.current=null;setLoadingMore(false);}
    }
  };
  const hold=(target:EventTarget)=>!(target as HTMLElement).closest(".address-activity-toolbar,.address-pagination,.ledger-history-notice");
  return <div className="activity-ledger-page activity-ledger-transactions address-transactions">
    <div className="table-shell address-activity"
      onPointerDownCapture={e=>{if((e.pointerType==="touch"||e.pointerType==="pen")&&hold(e.target))setReading(true);}}
      onPointerMove={e=>{if(e.pointerType==="mouse"&&hold(e.target))setReading(true);}}
      onPointerLeave={e=>{if(e.pointerType==="mouse"&&!e.currentTarget.contains(document.activeElement))setReading(false);}}
      onFocusCapture={e=>{if(hold(e.target))setReading(true);}}
      onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget))setReading(false);}}>
      <div className="table-toolbar address-activity-toolbar">
        <span>{feed.data?tf("shown",{count:num(rows.length)}):t(feed.error?"unavailable":"loadingRecords")}</span>
        <div className="address-activity-actions">
          {(feed.hasUpdates||historyHold)&&<button type="button" className="new-rows-button" onClick={accept} aria-label={t("Show updates")} title={t("Show updates")}><ArrowUp size={18} aria-hidden="true"/></button>}
          {!live.initialPending&&!current&&<span className="data-unavailable" role="status">N/A</span>}
        </div>
      </div>
      {feed.indexError&&rows.length>0&&<aside className="ledger-history-notice" role="status">
        <Info label={t("ledgerHistoryUnavailable")} showLabel>{t("ledgerHistoryHelp")}</Info>
        <button type="button" onClick={feed.retry} disabled={feed.indexPending} aria-busy={feed.indexPending} aria-label={t("retry")} title={t("retry")}><RefreshCw size={18} aria-hidden="true"/></button>
      </aside>}
      {!feed.data&&!feed.error?<LedgerSkeleton kind="transactions" label={t("loadingRecords")}/>:feed.error?<ErrorState error={feed.error} onRetry={feed.retry}/>:rows.length||reading||historyHold?<LedgerViewport kind="transactions" label={t("transactions")}>
        <LedgerColumns expanded/><AddressTransactionRows rows={rows} holding={reading||historyHold}/>
      </LedgerViewport>:<Empty>{tf("No {type} indexed for this address.",{type:activityLabel("transactions")})}</Empty>}
      {pageError&&<ResourceError error={t(pageError)} pending={loadingMore} onRetry={loadMore}/>}
      {!!rows.length&&<div className="pagination address-pagination">
        <span>{num(rows.length)} {t("recordsLoaded")}</span>
        <button type="button" onClick={loadMore} disabled={!cursor||loadingMore}>{loadingMore?t("loadingRecords"):cursor?t("loadMore"):feed.indexPending||feed.indexError?t("unavailable"):t("allLoaded")}<ChevronRight size={18} aria-hidden="true"/></button>
      </div>}
    </div>
  </div>;
}

function AccountInventory({id,kind}:{id:string;kind:"tokens"|"nft"}) {
  const pages=useCursorPages(`${id}:${kind}`);
  const reader=useMemo(()=>async(signal:AbortSignal)=>{
    const snapshot=await readCurrentJson(`/explorer/addresses/${id}/${kind}${pages.query}`,signal);
    return{...snapshot,data:normalizeAccountInventory(snapshot.data,id,kind,network.chainId)};
  },[id,kind,pages.query]);
  const resource=useRankedSnapshot(reader),data=resource.data;
  const pager=<CursorPagination page={pages.page} previous={pages.previous}
    next={()=>data?.next_page_params&&pages.next(data.next_page_params)}
    hasNext={resource.current&&!!data?.next_page_params&&tokenCursorQuery(data.next_page_params)!==pages.query}
    pending={!data&&!resource.error}/>;
  return <div className="table-shell address-activity account-inventory">
    <div className="token-list-controls"><button type="button"
      className={cx("token-refresh-button inventory-refresh-button",resource.hasUpdates&&"has-updates")}
      disabled={resource.pending} onClick={resource.refresh}
      aria-label={t(resource.hasUpdates?"Show updates":"restoredPageRefresh")}
      title={t(resource.hasUpdates?"Show updates":"restoredPageRefresh")}><RefreshCw size={18} aria-hidden="true"/></button>{pager}</div>
    {data&&resource.error&&<div className="inventory-refresh-error"><ResourceError error={resource.error} pending={resource.pending} onRetry={resource.refresh}/></div>}
    {!data ? resource.error ? <ErrorState error={t(resource.error)} onRetry={resource.refresh}/> : <Loading/>
      : !data.items.length ? <Empty>{resource.current?tf("No {type} indexed for this address.",{type:activityLabel(kind)}):"N/A"}</Empty>
      : kind==="tokens" ? <div className="asset-list">{data.items.map(item=><AssetHolding key={item.inventory_key} item={item} current={resource.current}/>)}</div>
      : <div className="nft-grid">{data.items.map((item,index)=><NftItem key={item.inventory_key} item={item} holdingCurrent={resource.current} priority={index<4}/>)}</div>}
    {!!data?.items.length&&<div className="token-pagination-bottom">{cloneElement(pager,{bottom:true})}</div>}
  </div>;
}

// All third-party artwork is routed through the same-origin, SSRF-protected
// media cache. Broken or unsafe assets fall back to deterministic placeholders.
function AssetHolding({ item,current }: { item: AnyRow;current:boolean }) {
  const token = item.token || {},
    fiat = current ? tokenFiatValue(item.value, token.decimals, token.exchange_rate) : undefined;
  const amount=(digits?:number)=>current?formatChainAmount(item.value,token.decimals ?? 0,activeLocale,digits).replace(/^—$/,"N/A"):"N/A";
  return (
    <ExplorerLink
      className="asset-row"
      disabled={!token.address_hash}
      to={(token.address_hash) ? (`/token/${token.address_hash}`) : undefined}
    >
      <span className="token-name">
        <TokenMark token={token}/>
        <span>
          <strong>{token.name || t("Unknown asset")}</strong>
          <small>
            {token.symbol} · {token.type}
          </small>
        </span>
      </span>
      <span>
        <strong title={amount()}><bdi dir="ltr">{amount(6)}</bdi>{token.decimals == null && ` ${t("base units")}`}</strong>
        <small>
          {!current || item.value == null ? "N/A" : fiat !== undefined
            ? money(fiat) : t("No price data")}
        </small>
      </span>
      <ArrowUpRight />
    </ExplorerLink>
  );
}
function NftItem({ item,holdingCurrent,ownerCurrent=holdingCurrent,priority=false }: { item: AnyRow;holdingCurrent?:boolean;ownerCurrent?:boolean;priority?:boolean }) {
  const token = item.token || {};
  const tokenId = String(item.id ?? item.token_id ?? "");
  const owner = addressOf(item.owner);
  const {ref,source,name,resolving}=useNftArtwork(item);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [source]);
  return (
    <ExplorerLink
      className="nft-item"
      to={(token.address_hash &&
        tokenId) ? (`/token/${token.address_hash}/instance/${encodeURIComponent(tokenId)}`) : undefined}
    >
      <div ref={ref} className="nft-thumb">
        {source && !failed && (
          <img
            className={loaded ? "is-ready" : ""}
            src={thumbnailUrl(source)}
            alt={`${token.name || "NFT"} #${tokenId || "—"}`}
            loading={priority?"eager":"lazy"}
            fetchPriority={priority?"high":"auto"}
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        )}{" "}
        {(!source || failed || !loaded) && (
          <div className="nft-placeholder" title={failed || !source&&!resolving ? t("mediaUnavailable") : t("loadingMedia")}>
            <ImageIcon aria-hidden="true" />
            <small className="sr-only">
              {failed || !source&&!resolving ? t("mediaUnavailable") : t("loadingMedia")}
            </small>
          </div>
        )}
      </div>
      <span>{name || item.metadata?.name || token.name || t("NFT collection")}</span>
      <strong title={`#${tokenId}`}>#{short(tokenId, 8, 6)}</strong>
      {holdingCurrent != null && <span className="nft-holding-balance"><span>{t("approvalAmount")}</span><bdi dir="ltr">{holdingCurrent?formatChainAmount(item.value,0,activeLocale).replace(/^—$/,"N/A"):"N/A"}</bdi></span>}
      {owner && <span title={ownerCurrent===false?"":owner}>{t("owner")}: {ownerCurrent===false?"N/A":labelOf(item.owner) || short(owner)}</span>}
    </ExplorerLink>
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
            <pre tabIndex={0} aria-label={source.file_path || t("contractSource")}>{source.source_code}</pre>
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
      {[["ABI",contract.abi], [t("Compiler settings"),contract.compiler_settings], [t("Creation bytecode"),contract.creation_bytecode], [t("Deployed bytecode"),contract.deployed_bytecode]].map(([label,value]) => value != null && <details className="source-file" key={label as string}><summary>{label as string}</summary><pre tabIndex={0} aria-label={label as string}>{typeof value === "string" ? value : JSON.stringify(value,null,2)}</pre></details>)}
    </div>
  );
}

function GenericActivity({ item, type, tokenContext }: { item: AnyRow; type: string; tokenContext?: string }) {
  const hash = item.transaction_hash || item.tx_hash;
  const from = addressOf(item.from), destination = item.to || item.created_contract, to = addressOf(destination);
  const nfts = transferNfts(item), nft = nfts.length > 0;
  const decimals = item.total?.decimals ?? item.token?.decimals;
  const failed = item.success === false;
  const raw = item.token ? item.total?.value : item.value;
  const precision = item.token ? decimals ?? 0 : 18;
  const formatted = formatChainAmount(raw, precision, activeLocale, 6);
  const amount = formatted === "—" ? "N/A" : formatted;
  const tokenName = item.token?.name || item.token?.symbol || t("Unknown token");
  const knownToken = !!tokenContext && tokenContext.toLowerCase() === item.token?.address_hash?.toLowerCase();
  const party = (entity: AnyRow, address: string, label: string) => <span className="activity-party">
    <small>{label}</small><span className={cx("activity-party-identity", !!labelOf(entity) && "named")}>
      <EntityMark address={address} entity={entity}/>{address ? <Copyable value={address} display={labelOf(entity) || short(address)} link={`/address/${address}`}/> : <span>N/A</span>}
    </span>
  </span>;
  if (type === "logs") return <LogEntry item={item} />;
  return <div className={cx("generic-row", nft && "has-nfts", knownToken && "context-token")}>
    <span className="activity-kind">
      {item.token ? <TokenMark token={item.token}/> : <img className="activity-native-icon" src="/brand/eth.svg" alt=""/>}
      <span className="activity-identity">
        {item.token && ADDRESS.test(item.token.address_hash || "") ? <ExplorerLink className="activity-asset text-link" to={`/token/${item.token.address_hash}`} title={tokenName}>{tokenName}</ExplorerLink> : <span className="activity-asset">{item.token ? tokenName : activityLabel(type)}</span>}
        <span className="activity-meta">{(item.token?.type || item.type) && <span>{item.token?.type || item.type}</span>}{item.method && item.method !== item.type && <span className="method" title={item.method}>{item.method}</span>}{failed && <span className="failure-label"><CircleX size={15} aria-hidden="true"/>{t("failed")}</span>}</span>
      </span>
    </span>
    <div className="activity-reference">
      {hash ? <Copyable value={hash} link={`/tx/${hash}`}/> : <span className="mono">#{item.index ?? "—"}</span>}
      <small><LiveAge timestamp={item.timestamp}/></small>
      {knownToken && item.method && <span className="method" title={item.method}>{item.method}</span>}
    </div>
    <div className="generic-address">{party(item.from, from, t("from"))}{party(destination, to, t("to"))}</div>
    <div className="activity-amount">
      {nft ? <TransferNfts item={item} get={get} locale={activeLocale} t={t}/> : <><strong title={formatChainAmount(raw, precision, activeLocale)}><bdi dir="ltr">{amount}</bdi></strong><span>{item.token ? decimals == null ? t("base units") : item.token.symbol || "" : "ETH"}</span></>}
    </div>
  </div>;
}

function LogEntry({ item }: { item: AnyRow }) {
  const address = addressOf(item.address);
  return <article className="code-panel event-log">
    <section className="event-log-head">
      <strong>{t("logs")} #{item.index ?? "—"}</strong>
      <span><small>{t("address")}</small><Copyable value={address} link={address ? `/address/${address}` : undefined} /></span>
      {item.transaction_hash && <span><small>{t("transactionKind")}</small><Copyable value={item.transaction_hash} link={`/tx/${item.transaction_hash}`} /></span>}
    </section>
    {item.decoded && <section className="event-decoded">
      <h3>{item.decoded.method_call || t("Decoded event")}</h3>
      <dl>{(item.decoded.parameters || []).map((parameter: any, index: number) => <div key={index}><dt>{parameter.name || `#${index}`} <small>{parameter.type}</small></dt><dd>{ADDRESS.test(String(parameter.value)) ? <Copyable value={String(parameter.value)} link={`/address/${parameter.value}`} /> : typeof parameter.value === "object" ? <code>{JSON.stringify(parameter.value)}</code> : <bdi>{String(parameter.value ?? "—")}</bdi>}</dd></div>)}</dl>
    </section>}
    <details className="event-raw"><summary>{t("Raw log data")}</summary><pre tabIndex={0}>{JSON.stringify({ decoded: item.decoded, topics: item.topics || [], data: item.data || "0x" }, null, 2)}</pre></details>
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
  const [filters, setFilters] = useState(() => readTokenFilters(new URLSearchParams(location.search)));
  const [draft, setDraft] = useState(filters.search);
  const [navigation, setNavigation] = useState(0);
  const pages = useCursorPages(JSON.stringify([filters, navigation]));
  const query = tokenListQuery(filters, pages.query);
  const reader=useMemo(()=>async(signal:AbortSignal)=>{
    const snapshot=await readCurrentJson(`/explorer/tokens${query}`,signal);
    return {...snapshot,data:normalizeTokenDirectory(snapshot.data,network.chainId)};
  },[query]);
  const resource=useRankedSnapshot(reader),data=resource.data,error=resource.error?t(resource.error):"";
  const marketValue=(value:unknown)=>resource.current?value:undefined;
  const apply = (next: TokenFilters) => { setFilters(next); pages.reset(); };
  useEffect(() => {
    const restore = () => {
      if (route().name !== "tokens") return;
      const next = readTokenFilters(new URLSearchParams(location.search));
      setFilters(next); setDraft(next.search); setNavigation(value => value + 1);
    };
    addEventListener("popstate", restore);
    return () => removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    const url = new URL(location.href);
    for (const key of ["q", "type", "sort", "order"]) url.searchParams.delete(key);
    if (filters.search) url.searchParams.set("q", filters.search);
    if (filters.standard) url.searchParams.set("type", filters.standard);
    if (filters.sort !== "circulating_market_cap" || filters.order !== "desc") { url.searchParams.set("sort", filters.sort); url.searchParams.set("order", filters.order); }
    history.replaceState({}, "", url.pathname + url.search);
  }, [filters]);
  const pager = <CursorPagination page={pages.page} previous={pages.previous} next={() => data?.next_page_params && pages.next(data.next_page_params)} hasNext={resource.current && !!data?.next_page_params && tokenCursorQuery(data.next_page_params) !== pages.query} pending={!data && !error}/>;
  return <div className="token-directory">
    <PageIntro eyebrow={t("TOKENS & NFTS")} title={t("tokens")} text={tf("tokenDirectory", { network: network.name })}/>
    <form className="token-directory-filters" onSubmit={e => { e.preventDefault(); apply({ ...filters, search: draft.trim() }); }}>
      <div className="token-search-field"><Search size={18} aria-hidden="true"/><input type="search" maxLength={256} aria-label={t("Search tokens")} placeholder={t("Search tokens")} value={draft} onChange={e => setDraft(e.target.value)}/>{draft && <button type="button" className="token-clear-search" aria-label={t("Clear search")} onClick={event => { event.currentTarget.parentElement?.querySelector("input")?.focus(); setDraft(""); apply({ ...filters, search: "" }); }}><X size={17} aria-hidden="true"/></button>}<button type="submit" aria-label={t("search")} title={t("search")}><ArrowRight size={19} aria-hidden="true"/></button></div>
      <label><span className="sr-only">{t("Token standard")}</span><select value={filters.standard} onChange={e => apply({ ...filters, standard: e.target.value })}><option value="">{t("All")}</option>{TOKEN_STANDARDS.map(value => <option key={value}>{value}</option>)}</select><ChevronDown size={16} aria-hidden="true"/></label>
      <label><span className="sr-only">{t("Sort tokens")}</span><select value={`${filters.sort}:${filters.order}`} onChange={e => { const [sort, order] = e.target.value.split(":"); apply({ ...filters, sort, order: order as "desc" }); }}>
        <option value="circulating_market_cap:desc">{t("Circulating cap")}</option><option value="holders_count:desc">{t("Holders")}</option><option value="fiat_value:desc">{t("Price")}</option>
      </select><ChevronDown size={16} aria-hidden="true"/></label>
    </form>
    {data && error && <div className="token-refresh-error"><ResourceError error={resource.error} pending={resource.pending} onRetry={resource.refresh}/></div>}
    <div className="table-shell">
      <div className="token-list-controls"><span>{data ? tf("shown", { count: num(data.items.length) }) : t("tokens")}<Info label={t("Sort tokens")}>{t("Token ranking uses circulating market cap, price or holder count. The Ink market cap column uses the supply on this network.")}</Info></span><button type="button" className={cx("token-refresh-button",resource.hasUpdates&&"has-updates")} disabled={resource.pending} onClick={resource.refresh} aria-label={t(resource.hasUpdates?"Show updates":"restoredPageRefresh")} title={t(resource.hasUpdates?"Show updates":"restoredPageRefresh")}><RefreshCw size={18} aria-hidden="true"/></button>{pager}</div>
      {!data ? error ? <ErrorState error={error} onRetry={resource.refresh}/> : <Loading/> : !data.items.length ? <Empty>{resource.current?t("No matching tokens"):"N/A"}</Empty> : <div className="token-table">
        <div className="token-table-head"><span>{t("Asset")}</span><span>{t("Type")}</span><span>{t("Price")}</span><span>{t("Holders")}</span><span>{t("On-chain market cap")} <Info label={t("On-chain market cap")}>{t("Indexed token supply on this network multiplied by the reported token price. This is not the global circulating market cap.")}</Info></span></div>
        {data.items.map((token: AnyRow) => {
          const count=resource.current?token.holders_count:undefined;
          const exactCount=formatChainAmount(count,0,activeLocale).replace(/^—$/,"N/A");
          const countLabel=count!=null&&BigInt(count)>=1000000n
            ? new Intl.NumberFormat(activeLocale,{notation:"compact",maximumFractionDigits:2}).format(BigInt(count)):exactCount;
          return <ExplorerLink className="token-row" key={token.address_hash} to={`/token/${token.address_hash}`}>
          <span className="token-name"><TokenMark token={token}/><span><strong>{token.name || t("Unknown token")}</strong><small>{token.symbol}<span className="token-type-inline"> · {token.type}</span></small></span></span>
          <span className="token-type-column">{token.type}</span>
          <span title={resource.current?String(token.exchange_rate ?? ""):""}><small className="mobile-label">{t("Price")}</small><UsdValue value={marketValue(token.exchange_rate)} locale={activeLocale} mode="price"/></span>
          <span><small className="mobile-label">{t("Holders")}</small><bdi dir="ltr" title={exactCount}>{countLabel}</bdi></span>
          <span title={tokenUsd(marketValue(tokenOnchainCap(token)), activeLocale)}><small className="mobile-label">{t("Ink cap")}</small><UsdValue value={marketValue(tokenOnchainCap(token))} locale={activeLocale} mode="cap"/></span>
        </ExplorerLink>})}
      </div>}
      {(data?.items.length ?? 0) > 0 && <div className="token-pagination-bottom">{cloneElement(pager,{bottom:true})}</div>}
    </div>
  </div>;
}

function TokenDetail({ id }: { id: string }) {
  const profileReader=useMemo(() => async (signal:AbortSignal) => {
    const snapshot=await readCurrentJson(`/explorer/tokens/${id}`,signal);
    return {...snapshot,data:normalizeTokenProfile(snapshot.data,id,network.chainId)};
  },[id]);
  const seed=useMemo(()=>()=>initialProfile('token',id,network.chainId),[id]);
  const profile=useCurrentSnapshot(profileReader,60000,seed),token=profile.data;
  const [data, setData] = useState<any>();
  const [tab, setTab] = useState(() => sectionChoice("overview", ["overview", "transfers", "holders", "instances", "contract", "read", "write"], { token_transfers: "transfers" }));
  const [retry, setRetry] = useState(0);
  const pages = useCursorPages(`${id}:${tab}`);
  useEffect(() => {
    setTab(sectionChoice("overview", ["overview", "transfers", "holders", "instances", "contract", "read", "write"], { token_transfers: "transfers" }));
  }, [id]);
  const profileReady=!!token;
  const section = tab === "instances" && token?.type === "ERC-20" ? "overview" : tab;
  const recentReader=useMemo(() => async (signal:AbortSignal) => {
    const snapshot=await readCurrentJson<{items:AnyRow[]}>(`/explorer/tokens/${id}/transfers`,signal);
    if (!Array.isArray(snapshot.data?.items)) throw new Error(t("invalidApiResponse"));
    return snapshot;
  },[id]);
  const recent=useCurrentSnapshot(profileReady && section === "overview" ? recentReader : undefined,30000);
  useEffect(() => {
    if (section !== tab) {
      setTab(section); const url = new URL(location.href); url.searchParams.set("tab", section); history.replaceState({}, "", url.pathname + url.search);
    }
  }, [section, tab]);
  useEffect(() => {
    const controller = new AbortController();
    setData(undefined);
    if (!profileReady || ["overview","holders","instances"].includes(section)) return () => controller.abort();
    get(["contract", "read", "write"].includes(section) ? `/explorer/smart-contracts/${id}` : `/explorer/tokens/${id}/${section}${pages.query}`, controller.signal)
      .then(value => {
        if (!["contract", "read", "write"].includes(section) && !Array.isArray(value.items)) throw new Error(t("invalidApiResponse"));
        if (!controller.signal.aborted) setData(value);
      })
      .catch(e => !controller.signal.aborted && setData({ items: [], error: e.message }));
    return () => controller.abort();
  }, [id, section, pages.query, retry, profileReady]);
  if (!token) return <div className="record-arrival-loading"><RecordArrivalHeading kind="token" id={id}/>{profile.error ? <ErrorState error={t(profile.error)} onRetry={profile.retry}/> : <Loading/>}</div>;
  const amount=(value:unknown,decimals:unknown,digits?:number) => profile.current ? formatChainAmount(value,decimals,activeLocale,digits).replace(/^—$/,"N/A") : "N/A";
  const supply = amount(token.total_supply,token.decimals ?? 0);
  const scaledSupply=token.decimals==null ? undefined : scaled(token.total_supply,token.decimals);
  const shortSupply=profile.current && scaledSupply!=null && scaledSupply>=1000 && Number.isFinite(scaledSupply)
    ? compact(scaledSupply) : amount(token.total_supply,token.decimals ?? 0,6);
  const marketValue=(value:unknown)=>profile.current?value:undefined;
  const pager = <CursorPagination page={pages.page} previous={pages.previous} next={() => pages.next(data.next_page_params)} hasNext={!!data?.next_page_params && tokenCursorQuery(data.next_page_params) !== pages.query} pending={!data}/>;
  return (
    <>
      <section className="token-hero token-detail-header">
        <div className="token-id"><TokenMark token={token} eager/><div><h1>{token.name || t("Unknown token")}</h1><div className="token-subtitle"><span>{token.symbol}</span><span>{token.type}</span></div></div></div>
        <div className="token-price"><span>{t("Price")}</span><strong><UsdValue value={marketValue(token.exchange_rate)} locale={activeLocale} mode="price"/></strong></div>
        <div className="token-contract-id"><Copyable value={id} display={id} link={`/address/${id}`}/></div>
      </section>
      {profile.error && <div className="token-refresh-error"><ResourceError error={profile.error} pending={profile.pending} onRetry={profile.retry}/></div>}
      <SectionTabs value={section} onChange={setTab} items={[
        ["overview", t("overview")], ["transfers", t("Transfers")], ["holders", t("Holders")],
        ["contract",t("contractSource")], ["read",t("readContract")], ["write",t("writeContract")],
        ...(token.type !== "ERC-20" ? [["instances", t("Token instances")]] as [string, string][] : []),
      ]}/>
      {section === "overview" ? <><section className="address-summary token-summary">
        <Metric label={t("Holders")} value={<bdi dir="ltr">{amount(token.holders_count,0)}</bdi>}/>
        <Metric label={t("Total supply")} value={<span title={supply}><bdi dir="ltr">{shortSupply}</bdi></span>} help={<><bdi dir="ltr">{supply}</bdi> {token.decimals == null ? t("base units") : token.symbol}<br/>{token.decimals != null && tf("{count} decimals", {count: num(token.decimals)})}</>}/>
        <Metric label={t("On-chain market cap")} value={<span title={tokenUsd(marketValue(tokenOnchainCap(token)), activeLocale)}><UsdValue value={marketValue(tokenOnchainCap(token))} locale={activeLocale} mode="cap"/></span>} help={<>{t("Indexed token supply on this network multiplied by the reported token price. This is not the global circulating market cap.")}<br/><br/>{t("Circulating market cap reported by the token price source.")}<br/><UsdValue value={marketValue(token.circulating_market_cap)} locale={activeLocale}/><br/>{t("This market cap may include other networks.")}</>}/>
        <Metric label={t("Market volume · 24h")} value={<span title={tokenUsd(marketValue(token.volume_24h), activeLocale)}><UsdValue value={marketValue(token.volume_24h)} locale={activeLocale} mode="cap"/></span>} help={t("Trading volume reported by the token price source across its tracked markets. This is not the value transferred on Ink.")}/>
      </section><section className="token-overview-activity" aria-label={t("Token transfers")}>
        <div className="token-overview-head"><h2>{t("Token transfers")}</h2><button type="button" aria-label={`${t("All")} · ${t("Token transfers")}`} title={`${t("All")} · ${t("Token transfers")}`} onClick={() => {const url=new URL(location.href);url.searchParams.set("tab","transfers");history.replaceState({},"",url.pathname+url.search+url.hash);setTab("transfers");}}>{t("All")}<ArrowRight size={18} aria-hidden="true"/></button></div>
        <div className="table-shell address-activity token-activity token-preview-list" aria-busy={recent.pending}>
          {recent.error ? <ErrorState error={t(recent.error)} onRetry={recent.retry}/> : recent.pending && !recent.current ? <Loading/> : !recent.current ? <Empty>N/A</Empty> : !recent.data?.items.length ? <Empty>{t("noRecords")}</Empty> : recent.data.items.slice(0,3).map((item:AnyRow,index:number)=><GenericActivity key={`${item.transaction_hash || item.tx_hash || "transfer"}:${index}`} item={item} type="token transfer" tokenContext={id}/>)}
        </div>
      </section></> : section === "holders" ? <TokenHolders id={id} token={token} profileCurrent={profile.current}/> : section === "instances" ? <NftInstances id={id} token={token}/> : <div className="table-shell address-activity token-activity">
        {!["contract", "read", "write"].includes(section) && <div className="token-list-controls">{pager}</div>}
        {!data ? (
          <Loading />
        ) : ["read","write"].includes(section) ? (
          <Suspense fallback={<Loading />}><ContractInteraction key={`${id}-${section}`} address={id} contract={data.error ? {} : data} mode={section === "read" ? "read" : "write"} locale={activeLocale} /></Suspense>
        ) : data.error ? (
          <ErrorState error={data.error} onRetry={()=>setRetry(value=>value+1)} />
        ) : section === "contract" ? (
          <ContractSource contract={data} />
        ) : data.items?.length ? (
            data.items.map((t: any, i: number) => (
              <GenericActivity
                key={`${t.transaction_hash || "transfer"}:${i}`}
                item={t}
                type="token transfer"
                tokenContext={id}
              />
            ))
        ) : (
          <Empty>{data.error || tf("No {type} found.", { type: activityLabel(section) })}</Empty>
        )}
        {data?.items?.length > 0 && !["contract", "read", "write"].includes(section) && <div className="token-pagination-bottom">{cloneElement(pager,{bottom:true})}</div>}
      </div>}
    </>
  );
}

function NftInstances({id,token}:{id:string;token:AnyRow}) {
  const pages=useCursorPages(id);
  const reader=useMemo(()=>async(signal:AbortSignal)=>{
    const snapshot=await readCurrentJson(`/explorer/tokens/${id}/instances${pages.query}`,signal);
    return{...snapshot,data:normalizeNftInstances(snapshot.data,id,network.chainId)};
  },[id,pages.query]);
  const resource=useRankedSnapshot(reader),data=resource.data;
  const pager=<CursorPagination page={pages.page} previous={pages.previous} next={()=>data?.next_page_params&&pages.next(data.next_page_params)}
    hasNext={resource.current&&!!data?.next_page_params&&tokenCursorQuery(data.next_page_params)!==pages.query} pending={!data&&!resource.error}/>;
  return <div className="table-shell token-activity collection-instances">
    <div className="token-list-controls"><button type="button" className={cx("token-refresh-button instances-refresh-button",resource.hasUpdates&&"has-updates")}
      disabled={resource.pending} onClick={resource.refresh} aria-label={t(resource.hasUpdates?"Show updates":"restoredPageRefresh")}
      title={t(resource.hasUpdates?"Show updates":"restoredPageRefresh")}><RefreshCw size={18} aria-hidden="true"/></button>{pager}</div>
    {data&&resource.error&&<div className="instances-refresh-error"><ResourceError error={resource.error} pending={resource.pending} onRetry={resource.refresh}/></div>}
    {!data?resource.error?<ErrorState error={t(resource.error)} onRetry={resource.refresh}/>:<Loading/>:
      data.items.length?<div className="nft-grid">{data.items.map(item=><NftItem key={item.id} item={{...item,token}} ownerCurrent={resource.current}/>)}</div>:
      <Empty>{resource.current?tf("No {type} found.",{type:activityLabel("instances")}):"N/A"}</Empty>}
    {!!data?.items.length&&<div className="token-pagination-bottom">{cloneElement(pager,{bottom:true})}</div>}
  </div>;
}

function NftDetail({ id, tokenId }: { id: string; tokenId: string }) {
  const readers=useMemo(()=>({
    instance:async(signal:AbortSignal)=>{const snapshot=await readCurrentJson(`/explorer/tokens/${id}/instances/${encodeURIComponent(tokenId)}`,signal);return{...snapshot,data:normalizeNftInstance(snapshot.data,id,tokenId,network.chainId)};},
    token:async(signal:AbortSignal)=>{const snapshot=await readCurrentJson(`/explorer/tokens/${id}`,signal);return{...snapshot,data:normalizeTokenProfile(snapshot.data,id,network.chainId)};},
    count:async(signal:AbortSignal)=>{const snapshot=await readCurrentJson(`/explorer/tokens/${id}/instances/${encodeURIComponent(tokenId)}/transfers-count`,signal);return{...snapshot,data:normalizeNftTransferCount(snapshot.data,id,tokenId,network.chainId)};},
  }),[id,tokenId]);
  const profile=useCurrentSnapshot(readers.instance,60000),collection=useCurrentSnapshot(readers.token,60000),count=useCurrentSnapshot(readers.count,60000);
  const instance=profile.data,token=collection.data;
  const [tab,setTab]=useState(()=>sectionChoice("overview",["overview","transfers","metadata"]));
  useEffect(()=>setTab(sectionChoice("overview",["overview","transfers","metadata"])),[id,tokenId]);
  const resources=[profile,collection,count],errors=resources.filter(resource=>resource.error),refresh=()=>resources.forEach(resource=>resource.retry());
  if(!instance||!token)return errors.length?<ErrorState error={[...new Set(errors.map(resource=>t(resource.error)))].join(" · ")} onRetry={refresh}/>:<Loading/>;
  const name=instance.metadata?.name||`${token.name||"NFT"} #${tokenId}`;
  const source=nftArtwork(instance);
  const owner=profile.current?addressOf(instance.owner):"",creator=addressOf(instance.creator);
  const transfersCount=count.current?count.data?.transfers_count:undefined;
  const attributes=instance.metadata?.attributes||[];
  const chooseTransfers=()=>{const url=new URL(location.href);url.searchParams.set("tab","transfers");history.replaceState({},"",url.pathname+url.search);setTab("transfers");};
  return <div className="nft-instance-page">
    <header className="nft-heading">
      <div className="nft-collection-line"><ExplorerLink className="nft-collection-link" to={`/token/${id}?tab=instances`}><TokenMark token={token}/><span>{token.name||t("Collection")}{token.symbol&&<small>{token.symbol}</small>}</span><ChevronRight size={16} aria-hidden="true"/></ExplorerLink>
        <button type="button" className="token-refresh-button nft-refresh-button" disabled={resources.some(resource=>resource.pending)} onClick={refresh} aria-label={t("restoredPageRefresh")} title={t("restoredPageRefresh")}><RefreshCw size={18} aria-hidden="true"/></button></div>
      <h1>{name}</h1><span className="nft-standard">{token.type||t("nftInstance")}</span>
    </header>
    {errors.length>0&&<div className="nft-refresh-error"><ResourceError error={[...new Set(errors.map(resource=>t(resource.error)))].join(" · ")} pending={errors.some(resource=>resource.pending)} onRetry={()=>errors.forEach(resource=>resource.retry())}/></div>}
    <SectionTabs value={tab} onChange={setTab} items={[["overview",t("overview")],["transfers",t("Transfers")],["metadata",t("metadata")]]}/>
    {tab==="overview"?<>
      <section className="nft-detail">
        <NftMedia key={`${id}:${tokenId}`} source={source} name={name} t={t}/>
        <div className="nft-facts"><dl>
          <Definition label={t("owner")}><span className="nft-owner nft-entity">{owner?<><EntityMark address={owner} entity={instance.owner}/><Copyable value={owner} display={labelOf(instance.owner)||short(owner,10,8)} link={`/address/${owner}`}/></>:"N/A"}</span></Definition>
          {creator&&<Definition label={t("creator")}><span className="nft-entity"><EntityMark address={creator} entity={instance.creator}/><Copyable value={creator} display={labelOf(instance.creator)||short(creator,10,8)} link={`/address/${creator}`}/></span></Definition>}
          <Definition label={t("tokenId")}><Copyable value={tokenId} display={tokenId}/></Definition>
          <Definition label={t("Transfers")}><button type="button" className="nft-transfer-count text-link" onClick={chooseTransfers}><bdi dir="ltr">{formatChainAmount(transfersCount,0,activeLocale).replace(/^—$/,"N/A")}</bdi><ArrowUpRight size={16} aria-hidden="true"/></button></Definition>
          <Definition label={t("Contract")}><Copyable value={id} display={id} link={`/address/${id}`}/></Definition>
        </dl></div>
      </section>
      {(instance.metadata?.description||attributes.length>0)&&<section className="nft-description">
        {instance.metadata?.description&&<p>{instance.metadata.description}</p>}
        {attributes.length>0&&<div className="nft-attributes"><h2>{t("attributes")}</h2><div>{attributes.map((attribute:AnyRow,index:number)=><article key={index} className={attribute.value.length>80?"wide-attribute":undefined}><span>{attribute.trait_type||attribute.key||tf("Attribute {number}",{number:index+1})}</span><strong>{attribute.value}</strong></article>)}</div></div>}
      </section>}
      {externalDestination(instance.external_app_url)&&<a className="external-action" href={externalDestination(instance.external_app_url)} target="_blank" rel="noreferrer">{t("External collection")}<ExternalLink/></a>}
    </>:tab==="transfers"?<NftTransfers key={`${id}:${tokenId}`} id={id} tokenId={tokenId}/>:<section className="nft-json">
      <div><h2>{t("metadata")}</h2><Info label={t("metadata")}>{t("Confirm the contract address before interacting. Collection owners may be able to change NFT metadata or media.")}</Info></div>
      <pre tabIndex={0} aria-label={t("metadata")}>{JSON.stringify(instance.raw_metadata||{},null,2)}</pre>
    </section>}
  </div>;
}

function NftTransfers({id,tokenId}:{id:string;tokenId:string}) {
  const [transfers,setTransfers]=useState<any>(),[retry,setRetry]=useState(0),[loadingMore,setLoadingMore]=useState(false),[pageError,setPageError]=useState("");
  const dataRequest=useRef(0);
  useEffect(()=>{
    const request=++dataRequest.current,controller=new AbortController();setTransfers(undefined);setLoadingMore(false);setPageError("");
    get(`/explorer/tokens/${id}/instances/${encodeURIComponent(tokenId)}/transfers`,controller.signal)
      .then(value=>{if(!Array.isArray(value.items))throw new Error(t("invalidApiResponse"));if(request===dataRequest.current)setTransfers(value);})
      .catch(e=>{if(request===dataRequest.current&&!controller.signal.aborted)setTransfers({items:[],error:e.message});});
    return()=>{controller.abort();++dataRequest.current;};
  },[id,tokenId,retry]);
  const loadMore=async()=>{
    if(loadingMore||!transfers?.next_page_params)return;
    const request=dataRequest.current;setLoadingMore(true);setPageError("");
    try{const next=await get(`/explorer/tokens/${id}/instances/${encodeURIComponent(tokenId)}/transfers${cursorQuery(transfers.next_page_params)}`);
      if(!Array.isArray(next.items))throw new Error(t("invalidApiResponse"));if(request===dataRequest.current)setTransfers((current:any)=>({...next,items:[...current.items,...next.items]}));
    }catch(e){if(request===dataRequest.current)setPageError(e instanceof Error?e.message:String(e));}finally{if(request===dataRequest.current)setLoadingMore(false);}
  };
  return <section className="nft-activity table-shell">
    {!transfers?<Loading/>:transfers.error?<ErrorState error={transfers.error} onRetry={()=>setRetry(value=>value+1)}/>:transfers.items.length?
      transfers.items.map((item:AnyRow,index:number)=><GenericActivity key={`${item.transaction_hash||"transfer"}:${index}`} item={item} type="NFT transfer" tokenContext={id}/>):<Empty/>}
    {pageError&&<p role="alert">{pageError}</p>}
    {transfers?.next_page_params&&<div className="pagination"><button disabled={loadingMore} onClick={loadMore}>{loadingMore?t("loadingRecords"):t("loadMore")}<ChevronRight/></button></div>}
  </section>;
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
          <img src={logoUrl(pool.base_token_icon_url)} alt="" />
        ) : (
          <i>{pool.base_token_symbol?.[0]}</i>
        )}
        {pool.quote_token_icon_url ? (
          <img src={logoUrl(pool.quote_token_icon_url)} alt="" />
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

function ResourceError({error,pending,onRetry}:{error:string;pending:boolean;onRetry:()=>void}) {
  return <div className="resource-error" role="alert" aria-busy={pending}>
    <CircleDot aria-hidden="true"/>
    <div><strong>{t("unavailable")}</strong>
      {!["Data source unavailable","unavailable"].includes(error) && <p>{t(error)}</p>}
    </div>
    <button type="button" disabled={pending} onClick={onRetry}><RefreshCw aria-hidden="true"/>{t("retry")}</button>
  </div>;
}

function Pools() {
  const resource=useCurrentSnapshot(readPoolCatalogue),data=resource.data;
  const error=resource.error?t(resource.error):"";
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
  const activePage = Math.min(page, pageCount - 1);
  useEffect(()=>setPage(previous=>Math.min(previous,pageCount-1)),[pageCount]);
  const visiblePools = filtered.slice(activePage * pageSize, (activePage + 1) * pageSize);
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
            <button disabled={!activeFilters && sortBy === "volume" && order === "desc"} onClick={resetFilters}>
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
            {resource.current ? <>{filtered.length} {t("pools").toLocaleLowerCase()}</> : data ? "—" : t(error ? "unavailable" : "loadingRecords")}
          </strong>
          <span>
            {t("sortedBy")} {sortLabel.toLocaleLowerCase()} ·{" "}
            {order === "desc" ? t("highToLow") : t("lowToHigh")}
          </span>
        </div>
      </section>
      {data && error && <div className="pool-refresh-error">
        <ResourceError error={resource.error} pending={resource.pending} onRetry={resource.retry} />
      </div>}
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
        ) : !data && error ? (
          <ErrorState error={error} onRetry={resource.retry} />
        ) : visiblePools.length ? (
          <div className="pool-list">
            {visiblePools.map((pool: any) => (
              <ExplorerLink
                className="pool-row"
                key={pool.pool_id}
                data-pool-id={pool.pool_id}
                data-liquidity={resource.current ? pool.liquidity ?? "" : ""}
                data-volume={resource.current ? pool.volume_usd_24h ?? "" : ""}
                data-fee={resource.current ? pool.fee ?? "" : ""}
                to={`/pools/${pool.pool_id}`}
              >
                <PoolPair pool={pool} />
                <span>{pool.dex?.name || "—"}</span>
                <span>{!resource.current || pool.fee == null ? "N/A" : `${pool.fee}%`}</span>
                <strong data-label={t("liquidity")}>
                  {!resource.current || pool.liquidity == null ? "N/A" : money(pool.liquidity)}
                </strong>
                <strong data-label={t("volume24h")}>
                  {!resource.current || pool.volume_usd_24h == null ? "N/A" : money(pool.volume_usd_24h)}
                </strong>
                <ArrowRight />
              </ExplorerLink>
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
              {resource.current ? <>{activePage * pageSize + 1}–
              {Math.min((activePage + 1) * pageSize, filtered.length)} {t("of")}{" "}
              {filtered.length}</> : "N/A"}
            </span>
            <button
              aria-label={t("previousPoolPage")}
              disabled={activePage === 0}
              onClick={() => setPage(Math.max(0, activePage - 1))}
            >
              <ChevronLeft />
            </button>
            <button
              aria-label={t("nextPoolPage")}
              disabled={activePage + 1 >= pageCount}
              onClick={() =>
                setPage(Math.min(pageCount - 1, activePage + 1))
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
  const marketReader=useMemo(()=>(signal:AbortSignal)=>readPoolMarket(id,signal),[id]);
  const market=useCurrentSnapshot(marketReader),pool=market.data;
  const contractAddress = poolContractAddress(pool, id);
  const contractReader=useMemo(()=>contractAddress
    ? (signal:AbortSignal)=>readPoolContract(contractAddress,signal) : undefined,[contractAddress]);
  const contract=useCurrentSnapshot(contractReader);
  const address=contract.data?.address,counters=contract.data?.counters,transactions=contract.data?.transactions;
  const marketMoney=(value:unknown)=>market.current && value!=null ? money(value) : "N/A";
  if (!pool) return market.error ? <ErrorState error={t(market.error)} onRetry={market.retry}/> : <Loading />;
  return (
    <>
      {market.error && <div className="pool-refresh-error"><ResourceError error={market.error} pending={market.pending} onRetry={market.retry}/></div>}
      <section className="pool-hero">
        <div>
          <span>{t("pool").toUpperCase()} · {network.name.toUpperCase()}</span>
          <PoolPair pool={pool} large />
          <Copyable value={id} display={id} />
        </div>
        <div className="pool-actions">
          {contractAddress && <ExplorerLink to={`/address/${contractAddress}`}>
            {t("openAddress")} <ArrowRight />
          </ExplorerLink>}
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
          value={marketMoney(pool.liquidity)}
          note={t("USD value reported by market index")}
        />
        <Metric
          label={t("volume24h")}
          value={marketMoney(pool.volume_usd_24h)}
          note={t("Reported 24-hour volume")}
        />
        <Metric
          label={t("feeTier")}
          value={!market.current || pool.fee == null ? "N/A" : `${pool.fee}%`}
          note={pool.dex?.name}
        />
        {contractAddress && <Metric
          label={t("transactions")}
          value={contract.current && counters?.transactions_count!=null ? compact(counters.transactions_count) : "N/A"}
          note={tf("{count} token transfers", { count: contract.current && counters?.token_transfers_count!=null ? compact(counters.token_transfers_count) : "N/A" })}
        />}
      </section>
      {contract.error && <div className="pool-contract-error"><ResourceError error={contract.error} pending={contract.pending} onRetry={contract.retry}/></div>}
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
              <dd>{marketMoney(pool.base_token_market_cap_usd)}</dd>
            </div>
            <div>
              <dt>{t("Fully diluted value")}</dt>
              <dd>{marketMoney(pool.base_token_fully_diluted_valuation_usd)}</dd>
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
              <dd>{marketMoney(pool.quote_token_market_cap_usd)}</dd>
            </div>
            <div>
              <dt>{t("Fully diluted value")}</dt>
              <dd>{marketMoney(pool.quote_token_fully_diluted_valuation_usd)}</dd>
            </div>
          </dl>
        </article>
        {contractAddress && <article className="pool-contract">
          <span>{t("POOL CONTRACT")}</span>
          <h2>
            {address?.implementations?.[0]?.name ||
              address?.name || t("Automated market maker")}
          </h2>
          <dl>
            <div>
              <dt>{t("verified")}</dt>
              <dd>{!contract.current || typeof address?.is_verified!=="boolean" ? "N/A" : address.is_verified ? t("Yes") : t("No")}</dd>
            </div>
            <div>
              <dt>{t("proxyType")}</dt>
              <dd>{contract.current ? address?.proxy_type || t("None") : "N/A"}</dd>
            </div>
            <div>
              <dt>{t("reputation")}</dt>
              <dd>{contract.current ? address?.reputation || "N/A" : "N/A"}</dd>
            </div>
            <div>
              <dt>{t("dex")}</dt>
              <dd>{pool.dex?.name || "—"}</dd>
            </div>
          </dl>
        </article>}
      </section>
      {contractAddress && <section className="live-section pool-activity">
        <SectionTitle eyebrow={t("POOL TRANSACTIONS")} title={t("latestActivity")} />
        <div className="panel">
          {!contract.current ? <div className="empty-state" role="status">{contract.pending ? t("loadingRecords") : "N/A"}</div> : transactions?.items?.length ? (
            transactions.items
              .slice(0, 10)
              .map((tx: any) => <TxRow locale={activeLocale} key={tx.hash} tx={tx} />)
          ) : (
            <Empty />
          )}
        </div>
      </section>}
      {!contractAddress && <section className="methodology pool-identifier-note"><span>{t("poolIdentifier")}</span><p>{t("poolContractUnavailable")}</p></section>}
      <section className="methodology">
        <span>{t("CHECK BEFORE USE")}</span>
        <p>{t("Confirm both token addresses. Liquidity and volume come from third-party market data and can change quickly.")}
        </p>
      </section>
    </>
  );
}

function TokenHolders({id,token,profileCurrent}:{id:string;token:AnyRow;profileCurrent:boolean}) {
  const pages=useCursorPages(id);
  const reader=useMemo(()=>async(signal:AbortSignal)=>{
    const snapshot=await readCurrentJson(`/explorer/tokens/${id}/holders${pages.query}`,signal);
    return{...snapshot,data:normalizeTokenHolders(snapshot.data,id,network.chainId)};
  },[id,pages.query]);
  const resource=useRankedSnapshot(reader),data=resource.data;
  const pager=<CursorPagination page={pages.page} previous={pages.previous}
    next={()=>data?.next_page_params&&pages.next(data.next_page_params)}
    hasNext={resource.current&&!!data?.next_page_params&&tokenCursorQuery(data.next_page_params)!==pages.query}
    pending={!data&&!resource.error}/>;
  return <div className="table-shell address-activity token-activity holder-activity">
    <div className="token-list-controls">
      <button type="button" className={cx("token-refresh-button holder-refresh-button",resource.hasUpdates&&"has-updates")}
        disabled={resource.pending} onClick={resource.refresh}
        aria-label={t(resource.hasUpdates?"Show updates":"restoredPageRefresh")}
        title={t(resource.hasUpdates?"Show updates":"restoredPageRefresh")}><RefreshCw size={18} aria-hidden="true"/></button>
      {pager}
    </div>
    {data&&resource.error&&<div className="holder-refresh-error"><ResourceError error={resource.error} pending={resource.pending} onRetry={resource.refresh}/></div>}
    {!data ? resource.error ? <ErrorState error={t(resource.error)} onRetry={resource.refresh}/> : <Loading/>
      : data.items.length ? <div className="holder-list">{data.items.map(item=><HolderRow key={addressOf(item.address)} item={item}
          decimals={token.decimals} symbol={token.symbol} current={resource.current&&profileCurrent}/>)}</div>
      : <Empty>{resource.current?tf("No {type} found.",{type:activityLabel("holders")}):"N/A"}</Empty>}
    {!!data?.items.length&&<div className="token-pagination-bottom">{cloneElement(pager,{bottom:true})}</div>}
  </div>;
}

function HolderRow({
  item,
  decimals,
  symbol,
  current,
}: {
  item: AnyRow;
  decimals: unknown;
  symbol: string;
  current: boolean;
}) {
  const addr = addressOf(item.address);
  const amount=(digits?:number)=>current?formatChainAmount(item.value,decimals ?? 0,activeLocale,digits).replace(/^—$/,"N/A"):"N/A";
  return (
    <div className="holder-row">
      <div className="holder-identity">
        <EntityMark address={addr} entity={item.address} label={labelOf(item.address)}/>
        <div>
        <Copyable
          value={addr}
          display={labelOf(item.address) || short(addr, 10, 8)}
          link={`/address/${addr}`}
        />
        <small>{item.address?.is_contract ? t("Contract") : t("Account")}</small>
        </div>
      </div>
      <strong title={amount()}>
        <bdi dir="ltr">{amount(6)}</bdi> <small>{decimals == null ? t("base units") : symbol}</small>
      </strong>
    </div>
  );
}

function AdvancedPage({ initialMode = "deposits" }: { initialMode?: string }) {
  const dedicated = initialMode === "userops";
  const [mode, setMode] = useState(() => dedicated ? initialMode : sectionChoice(initialMode, ["deposits", "withdrawals", "userops"]));
  const paths: Record<string,string> = {deposits:"optimism/deposits", withdrawals:"optimism/withdrawals", userops:"proxy/account-abstraction/operations"};
  const path = `/explorer/${paths[mode]}`, resource = useDirectoryPages(path, get);
  const {data,error,pending} = resource;
  const note = mode === "deposits" ? "Deposits originate on Ethereum and are executed as transactions on Ink." : mode === "withdrawals" ? "Withdrawals pass through the Optimism proving and challenge lifecycle before finalization." : "Bundled operations executed through an EntryPoint contract, with their fee and inclusion transaction.";
  const choose = (value:string) => {setMode(value);const url=new URL(location.href);url.searchParams.set("tab",value);history.replaceState({},"",url.pathname+url.search);};
  return <section className="directory-page operations-directory">
    <PageIntro eyebrow="" title={t(dedicated ? "User operations" : "Advanced activity")} text={t(note)}/>
    {!dedicated && <>
      <details className="explorer-tools"><summary>{t("Explorer tools")}</summary><ExplorerDirectory t={t} /></details>
      <SectionTabs value={mode} onChange={choose} items={[["deposits",t("L1 → L2 deposits")],["withdrawals",t("L2 → L1 withdrawals")],["userops",t("User operations")]]}/>
    </>}
    <div className="table-shell advanced-list" aria-busy={pending}>
      <div className="directory-controls">
        <span>{error ? t("unavailable") : data ? tf("shown",{count:num(data.items.length)}) : t("loadingRecords")}</span>
        <IndexedUpdates scope={`${path}:${resource.query}`} path={path} value={data} normalize={directoryResponse} enabled={!!data&&!error&&!resource.query} onApply={resource.apply} t={t}/>
        <LedgerPager t={t} pending={resource.pending} newest={resource.hasPrevious} previous={resource.hasPrevious} older={resource.hasNext} onNewest={resource.newest} onPrevious={resource.previous} onOlder={resource.next}/>
      </div>
      {pending ? <Loading/> : error ? <ErrorState error={t(error)} onRetry={resource.retry}/> : data?.items.length ? mode === "userops" ? <LedgerScroll className="user-operation-ledger" label={t("User operations")}>
        <div className="operation-columns">{["User operations","Status","Smart account","Included in","fee"].map(label=><span key={label}>{t(label)}</span>)}</div>
        {data.items.map(item=><ProtocolRow key={item.hash} item={item} mode={mode}/>)}
      </LedgerScroll> : data.items.map((item,i)=><ProtocolRow key={item.hash||item.l2_transaction_hash||i} item={item} mode={mode}/>) : <Empty>{t("noRecords")}</Empty>}
      <Pagination next={resource.hasNext ? data?.next_page_params : undefined} onNext={resource.next} onReset={resource.newest} onPrevious={resource.previous} hasPrevious={resource.hasPrevious} canReset={resource.hasPrevious} page={resource.page}/>
    </div>
  </section>;
}

function ProtocolRow({ item, mode }: { item: AnyRow; mode: string }) {
  if (mode === "userops") {
    const addr = addressOf(item.address);
    return (
      <div className="protocol-row">
        <span className={`directory-status${item.status===true ? " completed" : item.status===false ? " failed" : ""}`}>
          {item.status===true ? <><CircleCheck size={18} aria-hidden="true"/>{t("Success")}</> : item.status===false ? <><CircleX size={18} aria-hidden="true"/>{t("Failed")}</> : "N/A"}
        </span>
        <div>
          <Copyable value={item.hash} display={short(item.hash)} link={`/op/${item.hash}`} />
          <small>
            {item.timestamp ? <LiveAge timestamp={item.timestamp}/> : "N/A"}{item.entry_point_version && <> · EntryPoint {item.entry_point_version}</>}
          </small>
        </div>
        <div>
          <small>{t("Smart account")}</small>
          <span className="directory-identity"><EntityMark address={addr} entity={item.address}/><Copyable value={addr} link={`/address/${addr}`} /></span>
        </div>
        <div>
          <small>{t("Included in")}</small>
          <Copyable
            value={item.transaction_hash}
            link={`/tx/${item.transaction_hash}`}
          />
        </div>
        <strong title={exactEth(item.fee)}><small className="mobile-label">{t("fee")}</small>{eth(item.fee, 9)}</strong>
      </div>
    );
  }
  const withdrawal = mode === "withdrawals",
    hash = item.l2_transaction_hash;
  return (
    <div className="protocol-row">
      <span className="method">{t(withdrawal ? "Withdrawals" : "Deposits")}</span>
      <div>
        <Copyable value={hash} link={`/tx/${hash}`} />
        <small>
          {age(withdrawal ? item.l2_timestamp : item.l1_block_timestamp, "short")}
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
        <small className="mobile-label">{t(withdrawal ? "value" : "gasLimit")}</small>
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
          <span>WebSocket</span>
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
  const path="/explorer/smart-contracts",resource=useDirectoryPages(path,get);
  const {data,error,pending}=resource;
  return (
    <section className="directory-page contracts-directory">
      <PageIntro
        eyebrow={t("VERIFIED SOURCE")}
        title={t("Verified contracts")}
        text={t("contractDirectory")}
      >

      </PageIntro>
      <div className="directory-controls">
        <span>{error ? t("unavailable") : data ? tf("shown",{count:num(data.items.length)}) : t("loadingRecords")}</span>
        <IndexedUpdates scope={`${path}:${resource.query}`} path={path} value={data} normalize={directoryResponse} enabled={!!data&&!error&&!resource.query} onApply={resource.apply} t={t}/>
        <LedgerPager t={t} pending={resource.pending} newest={resource.hasPrevious} previous={resource.hasPrevious} older={resource.hasNext} onNewest={resource.newest} onPrevious={resource.previous} onOlder={resource.next}/>
      </div>
      <div className="contract-grid" aria-busy={pending} role="region" aria-label={t("Verified contracts")}>
        {pending ? (
          <Loading />
        ) : error ? (
          <ErrorState error={t(error)} onRetry={resource.retry} />
        ) : !data?.items.length ? <Empty>{t("noRecords")}</Empty> : (
          data.items.map((contract: any) => (
            <ExplorerLink
              className="contract-card"
              key={contract.address?.hash || contract.address_hash}
              to={`/address/${contract.address?.hash || contract.address_hash}`}
            >
              <div>
                <EntityMark address={contract.address?.hash || contract.address_hash} entity={{...contract.address,is_contract:true,is_verified:true}}/>
                <StatusPill ok>{t("verified")}</StatusPill>
              </div>
              <h2>
                {contract.name || contract.address?.name || t("smartContract")}
              </h2>
              <span className="mono">
                {short(contract.address?.hash || contract.address_hash, 10, 8)}
              </span>
              <footer>
                <span>{contract.language || "N/A"}</span>
                <span>{contract.compiler_version || t("Source available")}</span>
              </footer>
            </ExplorerLink>
          ))
        )}
      </div>
      <Pagination next={resource.hasNext ? data?.next_page_params : undefined} onNext={resource.next} onReset={resource.newest} onPrevious={resource.previous} hasPrevious={resource.hasPrevious} canReset={resource.hasPrevious} page={resource.page}/>
    </section>
  );
}

function StatChart({ title, note, metric, color, formatValue = compact, refresh, enableData = false, resolutions, units, detailed=false, tickMultiplier=1 }: {
  title: string;
  note: string;
  metric: string;
  color?: string;
  formatValue?: (value: number) => string;
  refresh: number;
  enableData?: boolean;
  resolutions?: string[];
  units?: string|null;
  detailed?: boolean;
  tickMultiplier?: number;
}) {
  const [period, setPeriod] = useState(30);
  const [data, setData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [showData, setShowData] = useState(false);
  const [visible, setVisible] = useState(!enableData);
  const chartRef = useRef<HTMLElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const requestKey = useRef("");
  const [plotHeight, setPlotHeight] = useState<number>();
  useLayoutEffect(() => {
    if (loading || error || !plotRef.current) return;
    const measure = () => setPlotHeight(plotRef.current?.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(plotRef.current);
    return () => observer.disconnect();
  }, [loading, error]);
  useEffect(() => {
    if (!enableData || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      setVisible(entries.some(entry => entry.isIntersecting));
    }, { rootMargin: "200px" });
    if (chartRef.current) observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, [enableData]);
  useEffect(() => {
    if (!visible) return;
    const key = JSON.stringify([metric, period, resolutions, units]);
    const changed = requestKey.current !== key;
    requestKey.current = key;
    if (changed) setData([]);
    // Preserve the table's geometry while its values are being revalidated.
    const clear = () => { setLoading(true); setError(""); };
    return observePageResource({
      interval: 60000,
      onStart: reason => { if (reason !== "poll") clear(); },
      onSuspend: clear,
      load: async signal => {
        const request = {...chartRequest(metric,period,resolutions),units};
        const snapshot = await readCurrentJson(`/stats/lines/${metric}${chartRequestQuery(request)}`, signal);
        return { data: normalizeChartSeries(snapshot.data,request), expiresAt: snapshot.expiresAt };
      },
      expiresAt: snapshot => snapshot.expiresAt,
      onValue: snapshot => { setData(snapshot.data); setLoading(false); setError(""); },
      onError: error => { setLoading(false); setError(t(error instanceof Error ? error.message : "Data source unavailable")); },
    });
  }, [metric, period, refresh, retry, visible, resolutions?.join(","), units]);
  const points = data.map(row => row.value == null || row.value === "" ? NaN : Number(row.value));
  const formatPoint = (value:number) => Number.isFinite(value) ? formatValue(value) : "N/A";
  const unavailable = loading || !!error;
  const currentValue=loading ? <PendingValue/> : error ? "N/A" : points.length ? formatPoint(points.at(-1)!) : "N/A";
  return <article ref={chartRef} className={cx("stat-chart", detailed && "stat-chart-detail")} aria-label={title} aria-busy={loading}>
    <div className="stat-chart-heading">
      {enableData ? <h2 className={detailed ? "sr-only" : undefined}>{title}</h2> : <h3>{title}</h3>}
      {detailed && <strong className="stat-chart-value">{currentValue}</strong>}
      <ChartRange title={title} value={period} onChange={setPeriod} options={enableData && (!resolutions || resolutions.includes("WEEK")) ? [...chartRanges,[0,"All time"]] : chartRanges} />
    </div>
    {!detailed && <strong className="stat-chart-value">{currentValue}</strong>}
    <div ref={plotRef} className="stat-chart-plot" style={{minHeight: unavailable ? plotHeight : undefined}}>
    {loading ? <div style={{minHeight:plotHeight}} className="chart-loading" role="status">{t("loadingRecords")}</div>
      : error ? <div style={{minHeight:plotHeight}} className="chart-error" role="status"><span>{t("Data source unavailable")}</span><button onClick={() => setRetry(value => value + 1)}>{t("retry")}</button></div>
      : <Sparkline key={period} points={points} labels={data.map(row => row.date)} endLabels={data.map(row => row.date_to)} approximatePoints={data.map(row => row.is_approximate)} color={color} height={130}
          formatValue={formatValue} ariaLabel={title} approximateLast={Boolean(data.at(-1)?.is_approximate)} detailed={detailed} tickMultiplier={tickMultiplier} />}
    </div>
    <div className={cx("chart-axis",unavailable && "chart-axis-unavailable")} aria-hidden={unavailable || undefined}><span>{data.some(row=>row.is_approximate) ? t("Incomplete interval") : ""}</span><span>{data.length ? `${dateText(data[0].date)} – ${dateText(data.at(-1)?.date_to)}` : ""}</span></div>
    {note && !enableData && <Info label={title}>{note}</Info>}
    {enableData && <div className="chart-period-summary">{additiveCharts.has(metric) ? <><div><span>{t("Period total")}</span><strong>{loading ? <PendingValue small/> : error || !points.length ? "N/A" : formatPoint(points.reduce((sum,value)=>sum+value,0))}</strong></div><div><span>{t("Period average")}</span><strong>{loading ? <PendingValue small/> : error || !points.length ? "N/A" : formatPoint(points.reduce((sum,value)=>sum+value,0)/points.length)}</strong></div></> : <div><span>{t("Latest value")}</span><strong>{loading ? <PendingValue small/> : error ? "N/A" : formatPoint(points.at(-1)!)}</strong></div>}<div><span>{t("Period high")}</span><strong>{loading ? <PendingValue small/> : error ? "N/A" : formatPoint(Math.max(...points))}</strong></div></div>}
    {enableData && <details className="chart-data" onToggle={event => setShowData(event.currentTarget.open)}><summary>{t("Data")}</summary><button className="text-link" aria-label={t("exportPage")} title={t("exportPage")} disabled={loading || !!error || !data.length} onClick={()=>downloadCsv(`ink-${network.chainId}-${metric}.csv`,["date","date_to","value","approximate"],data.map(item=>[item.date,item.date_to,item.value,item.is_approximate ?? false]))}><Download size={16}/>{t("exportPage")}</button>{showData && data.length>0 && <table><caption className="sr-only">{title}</caption><thead><tr><th>{t("Date")}</th><th>{t("Raw value")}</th></tr></thead><tbody>{data.map(row=><tr key={`${row.date}:${row.date_to}`}><td>{dateText(row.date)}{row.date_to!==row.date && ` – ${dateText(row.date_to)}`}</td><td className="mono"><span className="chart-value-cell"><span className={unavailable ? "chart-value-mask" : undefined} aria-hidden={unavailable || undefined}>{row.value===null ? "N/A" : String(row.value)}{row.is_approximate ? ` · ${t("Incomplete interval")}` : ""}</span>{unavailable && <span className="chart-value-unavailable">N/A</span>}</span></td></tr>)}</tbody></table>}</details>}
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
  const observation = useNetworkObservation(live, network.chainId);
  const data = observation || {};
  const metricValue = (value: unknown) => observation && finiteNumber(value) !== null ? num(value) : "N/A";
  const intro = <PageIntro eyebrow={t("LOCAL NODE")} title={t("Network health")} text={t("OP-Reth and OP Node status reported by this machine.")} />;
  if (!observation && live.initialPending) return <>{intro}<Loading /></>;
  const used = data.disk ? data.disk.total - data.disk.free : 0,
    pct = data.disk ? (used / data.disk.total) * 100 : 0;
  const rpcUpstreams = data.l1Rpc?.upstreams || [],
    rpcReady = rpcUpstreams.filter((item: any) => item.available).length;
  return (
    <>
      {intro}
      <section className="health-banner" data-network-observation={observation ? data.sampledAt : ""}>
        <div>
          <Activity />
          <div>
            <span>{t("STATUS")}</span>
            <h2>{!observation ? t("Data source unavailable") : data.online ? data.synced ? data.derivation?.synced === false ? t("rollupBehind") : tf("Synced to {network}", { network: network.name }) : data.stale ? tf("{network} node behind", { network: network.name }) : tf("Syncing {network}", { network: network.name }) : tf("{network} node unavailable", { network: network.name })}</h2>
            <p>{t("Observation")} · {observation ? <time dateTime={data.sampledAt}>{new Date(data.sampledAt).toLocaleTimeString(activeLocale)}</time> : "N/A"}</p>
          </div>
        </div>
        {observation ? <StatusPill ok={data.online && data.synced && data.derivation?.synced !== false}>{data.online ? data.synced ? data.derivation?.synced === false ? t("Behind") : t("Operational") : data.stale ? t("Behind") : t("Syncing") : t("Unavailable")}</StatusPill> : <span className="status">N/A</span>}
      </section>
      {data.derivation?.synced === false && <section className="sync-progress" aria-label={t("rollupBehind")}>
        <h2>{t("rollupBehind")}</h2>
        <p>{t("rollupBehindNote")}</p>
        <dl><div><dt>{t("L1 head observed")}</dt><dd>{metricValue(data.derivation.l1Head)}</dd></div><div><dt>{t("l1Processed")}</dt><dd>{metricValue(data.derivation.l1Block)}</dd></div><div><dt>{t("Behind")}</dt><dd>{metricValue(data.derivation.lag)}</dd></div></dl>
      </section>}
      {data.online && data.sync && data.syncProgress && <section className="sync-progress" aria-label={t("Node synchronization progress")}>
        <h2>{t("Downloading and executing chain history")}</h2>
        <p>{t("The explorer index remains available while this local node synchronizes. These counters measure downloads since the node started, not overall synchronization completion.")}</p>
        <dl><div><dt>{t("Headers received")}</dt><dd>{metricValue(data.syncProgress.headersDownloaded)}</dd></div><div><dt>{t("Block bodies received")}</dt><dd>{metricValue(data.syncProgress.bodiesDownloaded)}</dd></div><div><dt>{t("Rollup target")}</dt><dd>{metricValue(data.syncProgress.target)}</dd></div></dl>
      </section>}
      <section className="health-grid">
        <Metric
          label={t("Chain head")}
          value={metricValue(data.head)}
          note={tf("safe at {block}", { block: metricValue(data.safeBlock) })}
          icon={<Blocks />}
        />
        <Metric
          label={t("Finalized")}
          value={metricValue(data.finalizedBlock)}
          note={tf("{count} block lag", { count: metricValue(data.finalityLag) })}
          icon={<ShieldCheck />}
        />
        <Metric
          label={t("Rollup peers")}
          value={metricValue(data.rollupPeers)}
          note={tf("{count} on Ink block topic", { count: metricValue(data.topicPeers) })}
          icon={<Network />}
        />
        <Metric
          label={t("Known peers")}
          value={metricValue(data.knownPeers)}
          note={tf("{count} in routing table", { count: metricValue(data.routingTablePeers) })}
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
            {metricValue(data.rollupPeers)}
            <small>{t("Rollup peers")}</small>
          </span>
        </div>
        <div className="network-facts">
          <SectionTitle eyebrow={t("NODE DETAILS")} title={t("OP-Reth full node")} />
          <dl>
            <div>
              <dt>{t("Execution client")}</dt>
              <dd>OP-Reth</dd>
            </div>
            <div>
              <dt>{t("Rollup client")}</dt>
              <dd>OP Node</dd>
            </div>
            <div>
              <dt>{t("Chain ID")}</dt>
              <dd>{metricValue(data.chainId)}</dd>
            </div>
            <div>
              <dt>{t("Execution peers")}</dt>
              <dd>{metricValue(data.executionPeers)}</dd>
            </div>
            <div>
              <dt>{t("Sync state")}</dt>
              <dd>{!observation ? "N/A" : data.online ? data.synced ? t("At head") : data.stale ? tf("Last block {count} seconds ago", { count: metricValue(data.blockAgeSeconds) }) : t("Synchronizing") : t("Unavailable")}</dd>
            </div>
            <div>
              <dt>{t("L1 head observed")}</dt>
              <dd>{metricValue(data.l1Head)}</dd>
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
          {observation ? <StatusPill ok={Boolean(data.l1Rpc?.online)}>
            {isTestnet ? t("Direct connection") : data.l1Rpc?.online ? t("Available") : t("Degraded")}
          </StatusPill> : <span className="status">N/A</span>}
          <small>
            {!observation ? "N/A" : isTestnet ? t("See L1 head observed above") : tf("{ready}/{total} upstreams ready", { ready: num(rpcReady), total: num(rpcUpstreams.length) })}
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
      <div className="footer-brand">
        <Brand />
        <p>{t("independent")}</p>
      </div>
      <nav className="footer-links" aria-label={t("explore")}>
        <h2>{t("explore")}</h2>
        <ExplorerLink to={"/blocks"}>{t("blocks")}</ExplorerLink>
        <ExplorerLink to={"/txs"}>{t("transactions")}</ExplorerLink>
        <ExplorerLink to={"/pools"}>{t("pools")}</ExplorerLink>
        <ExplorerLink to={"/analytics"}>{t("analytics")}</ExplorerLink>
        <ExplorerLink to={"/advanced"}>{t("Explorer tools")}</ExplorerLink>
      </nav>
      <nav className="footer-links" aria-label={t("build")}>
        <h2>{t("build")}</h2>
        <ExplorerLink to={"/developers"}>
          {t("developerAccess")}
        </ExplorerLink>
        <a href="https://docs.inkonchain.com" target="_blank" rel="noreferrer">
          {t("documentation")} <ExternalLink />
        </a>
        <a href={`/${activeLocale === "en" ? "" : `?lang=${activeLocale}`}`}>Ink Mainnet</a>
        <a href={`/testnet/${activeLocale === "en" ? "" : `?lang=${activeLocale}`}`}>Ink Sepolia</a>
      </nav>
      {!isCurrentNetwork(live) && <div className="footer-status data-unavailable" role="status"><span>{network.name}</span><bdi>N/A</bdi></div>}
    </footer>
  );
}

function initialLocale(): Locale {
  const query = new URLSearchParams(location.search).get("lang");
  // Keep the original storage key so existing visitors retain their choice.
  const saved = savedLanguage();
  const browser = navigator.language?.split("-")[0];
  return isLocale(query)
    ? query
    : isLocale(saved)
      ? saved
      : isLocale(browser)
        ? browser
        : "en";
}


export default function App() {
  const live = useLiveStream();
  const rollingStatistics=useRollingStatistics(live,network.chainId);
  const [locale, setLocale] = useState<Locale>(() => {
    const value = initialLocale();
    activeLocale = value;
    return value;
  });
  const [view, setView] = useState(() => {
    const initial = route();
    if (initial.name === "apps" && initial.id && !isEcosystemAppId(initial.id)) {
      preloadApps(API, get);
    }
    return initial;
  });
  const navigationFocus = useRef(false);
  const localeGeneration=useRef(0);
  const [localeError,setLocaleError]=useState(document.documentElement.dataset.localeFallback === "true");
  useEffect(() => {
    const f = async () => {
      const generation=++localeGeneration.current;
      cancelAppsPreload();
      resetDataFreshness();
      const requestedLocale = new URLSearchParams(location.search).get("lang");
      const nextLocale = isLocale(requestedLocale) ? requestedLocale : "en";
      try {await loadLocale(nextLocale);if(generation!==localeGeneration.current)return;setLocaleError(false);} catch {if(generation!==localeGeneration.current)return;setLocaleError(true);}
      activeLocale = nextLocale;
      setLocale(nextLocale);
      navigationFocus.current = true;
      setView(route());
    };
    addEventListener("popstate", f);
    addEventListener("pagehide", cancelAppsPreload);
    return () => {
      removeEventListener("popstate", f);
      removeEventListener("pagehide", cancelAppsPreload);
      cancelAppsPreload();
    };
  }, []);
  useLayoutEffect(() => {
    if (navigationFocus.current) {
      document.getElementById("main-content")?.focus({ preventScroll: true });
      navigationFocus.current = false;
    }
  }, [view]);
  useEffect(() => {
    activeLocale = locale;
    const routeUrl = new URL(location.href);
    routeUrl.pathname = location.pathname.slice(basePath.length) || "/";
    const [title, description] = explorerPageMetadata(routeUrl, { basePath, locale, translate: t, format: tf });
    updatePageMetadata({
      doc: document, url: new URL(location.href), origin: canonicalOrigin, basePath,
      locale, title, description,
      routeName: view.name, forceNoindex,
    });
  }, [locale, view]);
  const chooseLocale = async (next: Locale) => {
    const generation=++localeGeneration.current;
    try {await loadLocale(next);if(generation!==localeGeneration.current)return;setLocaleError(false);} catch {if(generation!==localeGeneration.current)return;setLocaleError(true);return;}
    activeLocale = next;
    setLocale(next);
    saveLanguage(next);
    const url = new URL(location.href);
    if (next === "en") url.searchParams.delete("lang");
    else url.searchParams.set("lang", next);
    history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  };
  const contentLive = ["home","blocks","transactions","block","transaction","address","gas-tracker","network"].includes(view.name) ? live : undefined;
  const navigation = useMemo(() => ({ href: localizedPath, navigate: go }), [locale]);
  const content = useMemo(() => {
  let content: ReactNode;
  if (view.name === "home") content = <Home live={contentLive!} />;
  else if (view.name === "search")
    content = <SearchResults query={view.query || ""} />;
  else if (view.name === "blocks")
    content = <LedgerList key="blocks" type="blocks" live={contentLive!} />;
  else if (view.name === "transactions")
    content = <LedgerList key="transactions" type="transactions" live={contentLive!} />;
  else if (["internal-txs", "accounts", "deposits", "withdrawals"].includes(view.name))
    content = <Suspense fallback={<Loading/>}><LedgerPages key={view.name} {...explorerProps(view.name, view.id, contentLive)}/></Suspense>;
  else if (view.name === "token-transfers") content = <Suspense fallback={<Loading/>}><TokenTransfers {...explorerProps("token-transfers")} locale={locale}/></Suspense>;
  else if (view.name === "block" && view.id)
    content = <BlockDetail key={view.id} id={view.id} live={contentLive!} />;
  else if (view.name === "transaction" && view.id)
    content = <TxDetail key={view.id} id={view.id} live={contentLive!} />;
  else if (view.name === "address" && view.id)
    content = <AddressDetail id={view.id} live={contentLive!} />;
  else if (view.name === "approvals") content = <Suspense fallback={<Loading />}><Approvals address={view.id || ""} locale={activeLocale} /></Suspense>;
  else if (view.name === "tokens") content = <Tokens />;
  else if (view.name === "token" && view.id)
    content = <TokenDetail key={view.id} id={view.id} />;
  else if (view.name === "nft" && view.id && view.tokenId)
    content = <NftDetail id={view.id} tokenId={view.tokenId} />;
  else if (view.name === "pools") content = <Pools />;
  else if (view.name === "pool" && view.id)
    content = <PoolDetail id={view.id} />;
  else if (view.name === "contracts") content = <Contracts />;
  else if (view.name === "analytics") content = <Statistics {...explorerProps("stats")}/>;
  else if (view.name === "advanced") content = <AdvancedPage />;
  else if (["deposits", "withdrawals", "ops"].includes(view.name)) content = <AdvancedPage key={view.name} initialMode={view.name === "ops" ? "userops" : view.name} />;
  else if (view.name === "apps") content = <Apps key={`${view.name}/${view.id || ""}`} {...explorerProps(view.name, view.id, contentLive)} />;
  else if (view.name === "stats") content = <Statistics key={`${view.name}/${view.id || ""}`} {...explorerProps(view.name, view.id, contentLive)} />;
  else if (["accounts", "batches", "dispute-games", "gas-tracker", "name-services", "contract-verification", "public-tags", "op"].includes(view.name)) content = <Suspense fallback={<div className="explorer-route-loading"><Loading /></div>}><ExplorerPages key={`${view.name}/${view.id || ""}`} {...explorerProps(view.name, view.id, contentLive)} /></Suspense>;
  else if (view.name === "developers") content = <Suspense fallback={<Loading/>}><ApiDocs t={t}/></Suspense>;
  else if (view.name === "network") content = <NetworkPage live={contentLive!} />;
  else
    content = (
      <div className="not-found">
        <Hash />
        <h1>{t("pageNotFound")}</h1>
        <ExplorerLink to={"/"}>{t("returnHome")}</ExplorerLink>
      </div>
    );
  return content;
  }, [view, locale, contentLive]);
  return (
    <>
      <ExplorerNavigationProvider value={navigation}>

      <a className="skip-link" href="#main-content">{t("Skip to content")}
      </a>
      <Header
        current={view.name}
        live={live}
        locale={locale}
        onLocale={chooseLocale}
      />
      {localeError && <div role="alert" className="error-state"><p>{t("Data source unavailable")}</p><button onClick={()=>location.reload()}>{t("retry")}</button></div>}
      <main id="main-content" tabIndex={-1}><PageDataNotice locale={locale}/><IndexedHeadContext.Provider value={indexedHead(live,network.chainId)}><CanonicalBlockCountContext.Provider value={canonicalBlockCount(live,network.chainId)}><RollingStatisticsContext.Provider value={rollingStatistics}>{content}</RollingStatisticsContext.Provider></CanonicalBlockCountContext.Provider></IndexedHeadContext.Provider></main>
      <Footer live={live} />
      </ExplorerNavigationProvider>
    </>
  );
}
