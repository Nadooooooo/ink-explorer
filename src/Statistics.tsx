import { useEffect, useState } from "react";
import { Activity, ArrowDownUp, BarChart3, Blocks, ChevronDown, ChevronRight, Coins, FileCode2, Fuel, Search, WalletCards } from "lucide-react";
import { ExplorerLink } from "./ExplorerLink";
import { Info } from "./Info";
import { formatCounterValue } from "./counter-format";
import { useStatisticsCounters } from "./useCurrentStatistics";
import { statisticsDefinitions } from "./statistics-definitions";
import { StatisticsRetry } from "./StatisticsRetry";
import {RollingCount} from "./RollingCount";
import CanonicalBlockCounter from "./CanonicalBlockCounter";
import { normalizeChartCatalogue, type ChartSection } from "./chart-data";
import { observePageResource } from "./page-resource";
import { ResultCountStatus } from "./ResultCountStatus";
import type { ExplorerPageProps } from "./ExplorerPages";

type Row = Record<string, any>;
const icons: Record<string, typeof Activity> = { accounts:WalletCards, transactions:ArrowDownUp, blocks:Blocks, tokens:Coins, gas:Fuel, contracts:FileCode2, user_ops:Activity };
const featured = ["newTxns24h", "txnsFee24h", "averageTxnFee24h", "averageBlockTime"];
const counterOrder = [...featured,"totalAccounts","totalAddresses","totalBlocks","completedTxns","totalTxns","totalContracts","lastNewContracts","totalVerifiedContracts","lastNewVerifiedContracts","totalNativeCoinTransfers","totalTokens","totalUserOps","totalAccountAbstractionWallets","pendingTxns30m"];
function display(counter: Row) {
  return formatCounterValue(counter.value, document.documentElement.lang, counter.units);
}

export default function Statistics(props: ExplorerPageProps) {
  const { t } = props;
  const [sections,setSections] = useState<ChartSection[]>(), [error,setError] = useState(""), [retry,setRetry] = useState(0);
  const counters=useStatisticsCounters(t);
  const [category,setCategory] = useState(() => new URLSearchParams(location.search).get("category") || "transactions");
  const [search,setSearch] = useState(""), [metric,setMetric] = useState("");
  useEffect(() => {
    return observePageResource({
      once: true,
      onStart: () => setError(""),
      load: async signal => normalizeChartCatalogue(await props.get("/stats/lines",signal)),
      onValue: setSections,
      onError: error => setError(t(error instanceof Error ? error.message : "Data source unavailable")),
    });
  },[retry]);
  const charts = (sections || []).flatMap(section=>section.charts.map(chart=>({...chart,category:section.id})));
  const selected = charts.filter(chart=>props.id ? chart.id===props.id : (!category || chart.category===category) && (!metric || chart.id===metric) && `${t(chart.title)} ${chart.title}`.toLowerCase().includes(search.toLowerCase()));
  const chooseCategory = (value:string) => {setCategory(value);setMetric("");const url=new URL(location.href);url.searchParams.set("category",value);history.replaceState({},"",url.pathname+url.search);};
  const available=counters.data?.counters;
  const metadata=counters.lastData?.counters || statisticsDefinitions;
  const all=[...metadata,...statisticsDefinitions.filter(item=>!metadata.some(row=>row.id===item.id))];
  const ordered=all.map(item=>({...item,value:available?.find(row=>row.id===item.id)?.value??null})).sort((a,b)=>{
    const order=(id:string)=>{const index=counterOrder.indexOf(id);return index<0?counterOrder.length:index;};
    return order(a.id)-order(b.id);
  });
  const renderCounter = (counter: Row) => counter.id === 'newTxns24h' ? <RollingCount key={counter.id} t={t} variant="statistics"/> : counter.id === 'totalBlocks' ? <CanonicalBlockCounter key={counter.id} t={t}/> : <article key={counter.id} data-counter={counter.id} className={featured.includes(counter.id) ? "featured-counter" : ""}>
    <div><span>{t(counter.title)}</span><Info label={t(counter.title)}>{t(counter.description)}{counter.units && <> · {t(counter.units)}</>}{counter.value===null && <><br/>{counters.error || t(counters.pending&&!counters.lastData ? "loadingRecords" : "Data source unavailable")}</>}</Info></div>
    <strong title={counter.value!==null?String(counter.value):undefined}><span>{counter.value===null ? counters.pending && !counters.error ? <span className="pending-value" role="img" aria-label={t("loadingRecords")}/> : "N/A" : display(counter)}</span>{counter.value!==null && counter.units && <small>{t(counter.units)}</small>}</strong>
  </article>;
  return <div className="statistics-page">
    <div className="stats-heading"><h1>{t(props.id ? charts.find(chart=>chart.id===props.id)?.title || "Chart" : "Chain stats")}</h1><ExplorerLink className="stats-gas-link" to={props.id ? "/analytics" : "/gas-tracker"} aria-label={t(props.id ? "All statistics" : "Gas tracker")} title={t(props.id ? "All statistics" : "Gas tracker")}>{props.id ? <BarChart3 size={18} aria-hidden="true"/> : <Fuel size={18} aria-hidden="true"/>}<span>{t(props.id ? "All statistics" : "Gas tracker")}</span><ChevronRight size={16} aria-hidden="true"/></ExplorerLink></div>
    {!props.id && <>
      <section className="stats-counters stats-essential" aria-label={t("Chain stats")} aria-busy={counters.pending&&!counters.lastData}>
        {ordered.filter(counter=>featured.includes(counter.id)).map(renderCounter)}
      </section>
      {counters.error && <div className="counter-source-state" role="status"><span>{t("Data source unavailable")}</span><StatisticsRetry label={t("retry")} pending={counters.pending} onRetry={counters.retry}/></div>}
      <details className="stats-totals">
        <summary><WalletCards size={19} aria-hidden="true"/><span>{t("Network totals")}</span><ChevronDown size={18} aria-hidden="true"/></summary>
        <section className="stats-counters" aria-label={t("Network totals")} aria-busy={counters.pending&&!counters.lastData}>
          {ordered.filter(counter=>!featured.includes(counter.id)).map(renderCounter)}
        </section>
      </details>
    </>}
    {error ? <div className="error-state" role="alert"><p>{error}</p><button onClick={()=>setRetry(n=>n+1)}>{t("retry")}</button></div> : !sections ? <div className="loading" role="status">{t("loadingRecords")}</div> : <>
      {!props.id && <div className="stats-filter-bar"><label className="stats-search"><Search size={18}/><input aria-label={t("Search charts")} placeholder={t("Search charts")} value={search} onChange={e=>setSearch(e.target.value)}/></label><label className="stats-category-select"><span>{t("Category")}</span><select value={category} onChange={e=>chooseCategory(e.target.value)}><option value="">{t("All categories")}</option>{sections.map(section=><option key={section.id} value={section.id}>{t(section.title)}</option>)}</select></label><label className="stats-chart-select"><span>{t("Chart")}</span><select value={metric} onChange={e=>setMetric(e.target.value)}><option value="">{t("All charts")}</option>{charts.filter(chart=>!category || chart.category===category).map(chart=><option key={chart.id} value={chart.id}>{t(chart.title)}</option>)}</select></label></div>}
      {!props.id && <ResultCountStatus count={selected.length} t={t} />}
      <div className={props.id ? "stats-layout single" : "stats-layout"}>
        {!props.id && <nav className="stats-categories" aria-label={t("Category")}><button data-category="" className={!category ? "active" : ""} aria-pressed={!category} onClick={()=>chooseCategory("")}><BarChart3 size={19} aria-hidden="true"/><span>{t("All categories")}</span></button>{sections.map(section=>{const Icon=icons[section.id] || BarChart3;return <button key={section.id} data-category={section.id} className={category===section.id ? "active" : ""} aria-pressed={category===section.id} onClick={()=>chooseCategory(section.id)}><Icon size={19}/><span>{t(section.title)}</span></button>;})}</nav>}
        <div className="stat-chart-grid">{selected.map(chart=><section key={chart.id} className="stats-chart-card"><div className="chart-card-actions"><Info label={t(chart.title)}>{t(chart.description)}</Info>{!props.id && <ExplorerLink to={`/stats/${chart.id}`} aria-label={`${t("View chart")} · ${t(chart.title)}`}><ChevronRight size={18}/></ExplorerLink>}</div>{props.chart(chart.id,t(chart.title),chart.units,chart.resolutions)}</section>)}{!selected.length && <div className="empty">{t("noRecords")}</div>}</div>
      </div>
    </>}
  </div>;
}
