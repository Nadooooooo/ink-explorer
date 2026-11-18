import { Fuel, Gauge, Timer, Zap } from "lucide-react";
import { Info } from "./Info";
import { useGasOracle } from "./useCurrentStatistics";
import { StatisticsRetry } from "./StatisticsRetry";
import type { ExplorerPageProps } from "./ExplorerPages";
import { isCurrentNetwork } from "./live-ledger";

type Row = Record<string,any>;
const number = (value: unknown,digits=3) => value == null || !Number.isFinite(Number(value)) ? "N/A" : new Intl.NumberFormat(document.documentElement.lang,{maximumFractionDigits:digits}).format(Number(value));
export default function GasTracker(props: ExplorerPageProps) {
  const {t,live}=props, ready=isCurrentNetwork(live);
  const oracle=useGasOracle(t),stats=oracle.data;
  const blocks=ready ? live?.blocks || [] : [], utilization=ready ? live?.utilization : null;
  const blockTimes=blocks.slice(0,-1).map((b:Row,i:number)=>(Date.parse(b.timestamp)-Date.parse(blocks[i+1].timestamp))/1000);
  const avgTime=blockTimes.length ? blockTimes.reduce((sum:number,n:number)=>sum+n,0)/blockTimes.length : null;
  const barScale=Math.max(10,Math.ceil(Math.max(0,...blocks.map((b:Row)=>Number(b.gas_used_percentage) || 0))/10)*10);
  const gasPrice=ready && live?.network?.gasPriceWei != null ? Number(live.network.gasPriceWei)/1e9 : null;
  return <div className="gas-page"><div className="stats-heading"><h1>{t("Gas tracker")}</h1></div>
    <section className="gas-live-summary">
      <article><Gauge size={26}/><div><span>{t("Network utilization")}</span><strong>{number(utilization?.percentage,2)}{utilization?.percentage != null ? "%" : ""}</strong></div><Info label={t("Network utilization")}>{t("Gas used divided by gas capacity across the latest 30 canonical blocks.")}</Info>{utilization?.percentage!=null && <meter min="0" max="100" value={utilization.percentage} aria-label={t("Network utilization")}/>}</article>
      <article><Fuel size={26}/><div><span>{t("Gas price")}</span><strong>{number(gasPrice,9)}{gasPrice != null && <small> Gwei</small>}</strong></div></article>
      <article><Zap size={26}/><div><span>{t("Average gas used")}</span><strong>{number(utilization ? Number(utilization.gasUsed)/utilization.blocks : null,0)}</strong></div></article>
      <article><Timer size={26}/><div><span>{t("Average block time")}</span><strong>{number(avgTime)}{avgTime != null && <small> s</small>}</strong></div></article>
    </section>
    <section className="gas-recent"><div className="section-title"><h2>{t("Recent block utilization")}</h2><span>{blocks.length ? `#${number(blocks.at(-1)?.height,0)} – #${number(blocks[0].height,0)}` : "N/A"}</span></div>{blocks.length > 0 && <div className="gas-chart-scale"><span>{number(barScale,0)}%</span><span>0%</span></div>}<div className={blocks.length ? "gas-block-bars" : "gas-chart-unavailable"} role={blocks.length ? "img" : "status"} aria-label={t("Gas utilization for recent blocks")}>{blocks.length ? [...blocks].reverse().map((block:Row)=><div key={block.hash} title={`#${block.height} · ${number(block.gas_used_percentage,2)}%`}><span style={{height:`${Math.max(1,Math.min(100,(block.gas_used_percentage || 0)/barScale*100))}%`}}/></div>) : "N/A"}</div></section>
    <div className="section-title gas-estimates-title"><h2>{t("Gas estimates")}</h2><Info label={t("How gas fees work")}>{t("Gas estimates describe L2 execution. The total transaction fee also includes the L1 data fee.")}{stats?.updatedAt && <> · {t("Updated")}: {new Date(stats.updatedAt).toLocaleString(document.documentElement.lang)}</>}{oracle.error && <> · {oracle.error}</>}</Info>{oracle.error && <StatisticsRetry label={t("retry")} pending={oracle.pending} onRetry={oracle.retry}/>}</div>
    {oracle.error && <span className="sr-only" role="status">{t("Data source unavailable")}</span>}
    <section className="gas-estimates" aria-busy={oracle.pending&&!oracle.lastData}>{(["slow","average","fast"] as const).map(speed=>{
      const estimate=stats?.estimates[speed];
      return <article key={speed}><span>{t(speed)}</span><strong>{number(estimate?.gwei,9)}{estimate?.gwei!=null && <small> Gwei</small>}</strong><span>{t("Estimated inclusion")} · {number(estimate?.seconds)}{estimate?.seconds!=null && " s"}</span></article>;
    })}</section>
    <section className="stat-chart-grid gas-chart-grid">{[["averageGasPrice","Gas price history","Gwei"],["networkUtilization","Network utilization","%"],["averageGasLimit","Average gas limit",""],["gasUsedGrowth","Total gas usage",""]].map(([metric,title,unit])=><div key={metric}>{props.chart(metric,t(title),unit)}</div>)}</section>
  </div>;
}
