import {isCurrentNetwork, mergeLiveBlocks, mergeLiveTransactions} from './live-ledger';

type Row = Record<string, any>;
export type LedgerPage = {items: Row[]; next_page_params?: Record<string, unknown> | null};
export type LedgerFrame = {connected: boolean; sequence?: number; network?: Row; block?: Row; blocks?: Row[]; transactions?: Row[]};
export type LedgerContext = {key: string; kind: 'blocks' | 'transactions'; streaming: boolean; holding: boolean; retainObserved?: boolean; live?: LedgerFrame};
type BlockStreamInput = Readonly<{
  key: string; kind: LedgerContext['kind']; streaming: boolean; holding: boolean; retainObserved?: boolean;
  connected?: boolean; online: unknown; synced: unknown; stale: unknown; chainId: unknown; expectedChainId: unknown;
  rows: readonly Row[];
}>;
export type LedgerPageState = {key: string; indexed?: LedgerPage; visible?: LedgerPage; candidate?: LedgerPage; observed?: Row[]; invalidated?: string[]; pending: boolean; error: string; blockStreamInput?: BlockStreamInput};
export type LedgerAction = {type:'start' | 'stream' | 'accept'} | {type:'indexed'; page:LedgerPage} | {type:'error'; error:string};
export const emptyLedgerPage = (key: string): LedgerPageState => ({key, pending:true, error:''});
const identity = (row:Row) => String(row.hash || `height:${row.height}`);
const inclusion = (row:Row) => `${row.hash}:${row.block_number}`;
const sameRows = (a:Row[], b:Row[]) => a.length === b.length && a.every((row,index)=>identity(row)===identity(b[index]));

function blockStreamInput(context:LedgerContext):BlockStreamInput {
  const live=context.live, network=live?.network;
  return {key:context.key,kind:context.kind,streaming:context.streaming,holding:context.holding,retainObserved:context.retainObserved,
    connected:live?.connected,online:network?.online,synced:network?.synced,stale:network?.stale,chainId:network?.chainId,expectedChainId:network?.expectedChainId,
    // Keep the complete vector: metadata beyond the visible limit can enrich
    // an earlier beneficiary. JSON/frame producers replace changed row objects.
    rows:[...(live?.blocks?.length?live.blocks:live?.block?[live.block]:[])]};
}
function sameBlockStreamInput(previous:BlockStreamInput|undefined,next:BlockStreamInput):boolean {
  return !!previous && previous.key===next.key && previous.kind===next.kind && previous.streaming===next.streaming
    && previous.holding===next.holding && previous.retainObserved===next.retainObserved && previous.connected===next.connected
    && previous.online===next.online && previous.synced===next.synced && previous.stale===next.stale
    && previous.chainId===next.chainId && previous.expectedChainId===next.expectedChainId
    && previous.rows.length===next.rows.length && previous.rows.every((row,index)=>row===next.rows[index]);
}
function withoutBlockStreamInput(state:LedgerPageState):LedgerPageState {
  if(!state.blockStreamInput)return state;
  const next={...state};delete next.blockStreamInput;return next;
}

export function readLedgerPage(value: unknown): LedgerPage {
  const page = value as LedgerPage;
  if (!page || !Array.isArray(page.items) || page.items.some(row=>!row || typeof row!=='object' || Array.isArray(row))) throw new Error('invalidApiResponse');
  const cursor=page.next_page_params;
  if(cursor!=null && (typeof cursor!=='object' || Array.isArray(cursor) || Object.values(cursor).some(v=>v!=null&&!['number','string','boolean'].includes(typeof v)))) throw new Error('invalidApiResponse');
  return page;
}

// A full indexed page retains its cursor and every indexed row. Capping the
// combined result at 50 would silently skip its displaced tail on Next page.
function candidatePage(state:LedgerPageState, context:LedgerContext):LedgerPage|undefined {
  if(!context.streaming)return state.indexed;
  const current=isCurrentNetwork(context.live), live=current?context.live:undefined;
  const blocks=live?.blocks?.length?live.blocks:live?.block?[live.block]:[];
  const recent=current ? context.kind==='blocks'?mergeLiveBlocks([],blocks,50):mergeLiveTransactions(state.observed || [],live?.transactions || [],blocks,context.retainObserved?500:50) : (state.visible?.items || []).slice(0,context.retainObserved?500:50);
  const indexed=state.indexed?.items || [];
  if(!state.indexed && !recent.length)return undefined;
  const capacity=indexed.length+recent.length;
  const wanted=context.kind==='blocks'
    ? current?mergeLiveBlocks(indexed,recent,capacity):mergeLiveBlocks(recent,indexed,capacity)
    : mergeLiveTransactions(indexed,recent,blocks,capacity);
  // Enrich selected identities with already known names; never carry unrelated
  // rows from an earlier live window into this page's pagination boundary.
  const previous=state.candidate?.items || state.visible?.items || [];
  const enriched=context.kind==='blocks'
    ? mergeLiveBlocks(previous,wanted,previous.length+wanted.length)
    : mergeLiveTransactions(previous,wanted,blocks,previous.length+wanted.length);
  const map=new Map(enriched.map(row=>[identity(row),row]));
  return {...state.indexed,items:wanted.map(row=>map.get(identity(row)) || row)};
}

function showCandidate(state:LedgerPageState, context:LedgerContext):LedgerPageState {
  if(context.retainObserved && context.streaming && isCurrentNetwork(context.live)){
    const blocks=context.live?.blocks || [], head=Number(context.live?.block?.height);
    const known=[...(state.observed || []),...(state.indexed?.items || []),...(state.visible?.items || [])];
    const valid=new Set(mergeLiveTransactions(known,[],blocks,known.length).filter(row=>Number(row.block_number)<=head).map(inclusion));
    const invalidated=new Set(state.invalidated || []);
    for(const row of known)if(!valid.has(inclusion(row)))invalidated.add(inclusion(row));
    for(const row of context.live?.transactions || [])invalidated.delete(inclusion(row));
    const allowed=(row:Row)=>!invalidated.has(inclusion(row));
    // Once the index covers an older range, its real cursor owns that range.
    // Avoid keeping hundreds of redundant live rows on a long-open account.
    const heights=(state.indexed?.items || []).map(row=>Number(row.block_number)).filter(Number.isFinite);
    const indexedFloor=heights.length?Math.min(...heights):-Infinity;
    state={...state,invalidated:[...invalidated].slice(-2000),
      indexed:state.indexed?{...state.indexed,items:state.indexed.items.filter(allowed)}:undefined,
      observed:mergeLiveTransactions((state.observed || []).filter(allowed),context.live?.transactions || [],blocks,500).filter(row=>Number(row.block_number)<=head && Number(row.block_number)>=indexedFloor)};
  }
  const candidate=candidatePage(state,context);
  if(!candidate)return state;
  if(!context.holding || !state.visible?.items.length || sameRows(state.visible.items,candidate.items))return {...state,visible:candidate,candidate:undefined};
  // Late metadata can enrich the rows being read, but cannot change their
  // identities, ordering or pagination cursor until updates are accepted.
  const map=new Map(candidate.items.map(row=>[identity(row),row]));
  const held=context.retainObserved && isCurrentNetwork(context.live)
    ? mergeLiveTransactions(state.visible.items,[],context.live?.blocks || [],state.visible.items.length).filter(row=>Number(row.block_number)<=Number(context.live?.block?.height) && !state.invalidated?.includes(inclusion(row)))
    : state.visible.items;
  return {...state,visible:{...state.visible,items:held.map(row=>map.get(identity(row)) || row)},candidate};
}

export function updateLedgerPage(previous:LedgerPageState, action:LedgerAction, context:LedgerContext):LedgerPageState {
  let state=previous.key===context.key?previous:emptyLedgerPage(context.key);
  // Network-only frames still update the parent live state. This pure, local
  // snapshot avoids rebuilding the Blocks page when its immutable inputs agree.
  // Every non-stream or ineligible transition discards the snapshot first.
  const input=action.type==='stream' && context.kind==='blocks' && context.streaming && !context.retainObserved && isCurrentNetwork(context.live)
    ? blockStreamInput(context):undefined;
  if(input && sameBlockStreamInput(state.blockStreamInput,input))return state;
  state=withoutBlockStreamInput(state);
  if(action.type==='start')return {...state,pending:true};
  if(action.type==='error')return {...state,pending:false,error:action.error};
  if(action.type==='indexed')state={...state,indexed:action.page,pending:false,error:''};
  if(action.type==='stream' && (!context.streaming || !isCurrentNetwork(context.live)))return state;
  const next=showCandidate(state,action.type==='accept'?{...context,holding:false}:context);
  return input?{...next,blockStreamInput:input}:next;
}
