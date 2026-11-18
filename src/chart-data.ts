import {statisticNumber} from './statistics-data';
import {chartDescription} from './chart-descriptions';

export const chartResolutions = ['DAY', 'WEEK', 'MONTH', 'YEAR'] as const;
export type ChartResolution = typeof chartResolutions[number];
export type ChartDefinition = {id:string; title:string; description:string; units?:string; resolutions:ChartResolution[]};
export type ChartSection = {id:string; title:string; charts:ChartDefinition[]};
export type ChartPoint = {date:string; date_to:string; value:string|number|null; is_approximate:boolean};
export type ChartRequest = {metric:string; resolution:ChartResolution; from?:string; to?:string; units?:string|null};
const object = (value:unknown):value is Record<string,unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const id = (value:unknown):value is string => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/.test(value);
const text = (value:unknown):value is string => typeof value === 'string' && !!value.trim();
const invalid = ():never => {throw new Error('invalidApiResponse');};

function definition(value:unknown):ChartDefinition {
  if (!object(value) || !id(value.id) || !text(value.title) || typeof value.description !== 'string' || (value.units != null && typeof value.units !== 'string') || !Array.isArray(value.resolutions) || !value.resolutions.length) return invalid();
  const resolutions = value.resolutions;
  if (resolutions.some(item => !chartResolutions.includes(item as ChartResolution)) || new Set(resolutions).size !== resolutions.length) return invalid();
  return {id:value.id, title:value.title, description:chartDescription(value.id,value.description), units:value.units as string|undefined ?? undefined, resolutions:resolutions as ChartResolution[]};
}

export function normalizeChartCatalogue(value:unknown):ChartSection[] {
  if (!object(value) || !Array.isArray(value.sections)) return invalid();
  const sections = new Set<string>(), charts = new Set<string>();
  return value.sections.map(section => {
    if (!object(section) || !id(section.id) || sections.has(section.id) || !text(section.title) || !Array.isArray(section.charts)) return invalid();
    sections.add(section.id);
    return {id:section.id, title:section.title, charts:section.charts.map(row => {
      const chart = definition(row);
      if (charts.has(chart.id)) return invalid();
      charts.add(chart.id);
      return chart;
    })};
  });
}

function validDate(value:unknown):value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value+'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === value;
}
const dayAfter = (date:string, days=1) => new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
function nextPeriod(date:string,resolution:ChartResolution):string {
  const point = new Date(date+'T00:00:00Z');
  if (resolution === 'MONTH') {point.setUTCDate(1); point.setUTCMonth(point.getUTCMonth()+1);}
  else if (resolution === 'YEAR') {point.setUTCMonth(0,1); point.setUTCFullYear(point.getUTCFullYear()+1);}
  else return dayAfter(date,resolution==='WEEK'?7:1);
  return point.toISOString().slice(0,10);
}
const ratios = new Set(['txnsSuccessRate','networkUtilization']);
const counts = new Set(['accountsGrowth','activeAccounts','newAccounts','newTxns','txnsGrowth','newEip7702Auths','eip7702AuthsGrowth','newBlocks','newNativeCoinTransfers','gasUsedGrowth','contractsGrowth','newContracts','newVerifiedContracts','verifiedContractsGrowth','userOpsGrowth','newUserOps','newAccountAbstractionWallets','accountAbstractionWalletsGrowth','activeAccountAbstractionWallets','activeBundlers','activePaymasters']);
export const additiveCharts = new Set(['newAccounts','newTxns','txnsFee','newBlocks','newContracts','newVerifiedContracts','newNativeCoinTransfers','newEip7702Auths','newUserOps','newAccountAbstractionWallets']);

export function chartRequest(metric:string,days:number,resolutions:readonly string[]=chartResolutions,now=new Date()):ChartRequest {
  const resolution = (days===0 || days>=365) && resolutions.includes('WEEK') ? 'WEEK' : chartResolutions.find(item=>resolutions.includes(item));
  if (!id(metric) || !resolution || !Number.isInteger(days) || days<0) return invalid();
  return {metric,resolution,...(days ? {from:dayAfter(now.toISOString().slice(0,10),1-days),to:now.toISOString().slice(0,10)} : {})};
}
export function chartRequestQuery(request:ChartRequest):string {
  const query = new URLSearchParams({resolution:request.resolution});
  if (request.from) query.set('from',request.from);
  if (request.to) query.set('to',request.to);
  return '?'+query.toString();
}

// Preserve raw decimals for the data table/CSV. Invalid numeric observations
// become gaps, never zero. Ambiguous dates or overlapping intervals invalidate
// the whole response because their place in a time series cannot be inferred.
export function normalizeChartSeries(value:unknown,request:ChartRequest):ChartPoint[] {
  if (!object(value) || !Array.isArray(value.chart) || value.chart.length>20000) return invalid();
  if (value.info != null) {
    const info = definition(value.info);
    if (info.id!==request.metric || !info.resolutions.includes(request.resolution) || (request.units!==undefined && (info.units||null)!==(request.units||null))) return invalid();
  }
  const rows = value.chart.map(row => {
    if (!object(row) || !validDate(row.date) || (row.is_approximate!=null && typeof row.is_approximate!=='boolean')) return invalid();
    const end = dayAfter(nextPeriod(row.date,request.resolution),-1);
    const dateTo = row.date_to ?? end;
    if (!validDate(dateTo) || dateTo<row.date || dateTo>end || (request.from && dateTo<request.from) || (request.to && row.date>request.to)) return invalid();
    const number = statisticNumber(row.value);
    const valid = number!==null && (!ratios.has(request.metric) || number<=1) && (!counts.has(request.metric) || Number.isInteger(number));
    return {date:row.date,date_to:dateTo,value:valid?row.value as string|number:null,is_approximate:row.is_approximate===true};
  }).sort((a,b)=>a.date.localeCompare(b.date));
  const result:ChartPoint[] = [];
  for (const row of rows) {
    const previous = result.at(-1);
    if (previous) {
      if (row.date<=previous.date_to) return invalid();
      let date = nextPeriod(previous.date,request.resolution);
      while (date<row.date) {
        if (result.length>=20000) return invalid();
        const next = nextPeriod(date,request.resolution);
        result.push({date,date_to:dayAfter(next,-1),value:null,is_approximate:false});
        date = next;
      }
      if (date!==row.date) return invalid();
    }
    result.push(row);
  }
  return result;
}
