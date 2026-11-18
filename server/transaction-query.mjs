import { activityFilters, validateActivity, activityQuery } from "../src/activity-data.ts";

const address = value => (typeof value === "string" ? value : value?.hash || "").toLowerCase();
const cursorKeys = new Set(["block_number","transaction_index","internal_transaction_index","token_transfer_batch_index","token_transfer_index","items_count"]);
const eventCursorKeys=["block_number","transaction_index","internal_transaction_index","token_transfer_batch_index","token_transfer_index"];
const rootTypes="COIN_TRANSFER,CONTRACT_INTERACTION,CONTRACT_CREATION";
function parentStatus(status) {
  if(status === 'success' || status === 'ok')return 'ok';
  if(status === 'pending')return 'pending';
  if(typeof status !== 'string' || !status.trim() || status === 'awaiting_internal_transactions')return null;
  // Blockscout AdvancedFilterView uses TransactionView.format_status:
  // {:error, reason} becomes the reason string, e.g. "execution reverted".
  // Only the reserved successful/pending/indexing states above are non-errors.
  return 'error';
}
export function parentMatches(row,filters,status,{methodFiltered=false}={}) {
  const from=filters.from_address_hashes_to_include, to=filters.to_address_hashes_to_include;
  const fromMatches=!from || address(row.from)===from.toLowerCase(), toMatches=!to || address(row.to || row.created_contract)===to.toLowerCase();
  if (from && to && filters.address_relation === "or" ? !fromMatches && !toMatches : !fromMatches || !toMatches) return false;
  if (filters.methods) {
    const input=row.raw_input ?? row.input;
    const encoded=typeof input === "string" ? input : typeof row.method === "string" && /^0x[\da-f]+$/i.test(row.method) ? row.method : null;
    // Root calls have already been selected by this exact selector upstream.
    // Their display method may be decoded ("approve") without raw calldata.
    // Token events need independent parent verification, as their method
    // filter is deliberately removed before the upstream request.
    if(encoded !== null ? !encoded.toLowerCase().startsWith(filters.methods.toLowerCase()) : !methodFiltered)return false;
  }
  const timestamp=Date.parse(row.timestamp);
  if (filters.age_from && (!Number.isFinite(timestamp) || timestamp < Date.parse(filters.age_from))) return false;
  if (filters.age_to && (!Number.isFinite(timestamp) || timestamp > Date.parse(filters.age_to))) return false;
  const state=parentStatus(row.status);
  const failed=state === "error";
  const success=state === "ok";
  if (status === "failed" && !failed || status === "success" && !success) return false;
  return true;
}
export function normalizeParent(row) {
  return {...row,status:parentStatus(row.status),
    transaction_types:row.transaction_types || [row.type],fee:typeof row.fee === "object" ? row.fee : row.fee != null ? {value:String(row.fee),type:"actual"} : null};
}
export function decodeTransactionCursor(value) {
  if (!value) return {next:{},last:null};
  if (value.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid cursor");
  let parsed;try {parsed=JSON.parse(Buffer.from(value,"base64url").toString());}catch {throw new Error("Invalid cursor");}
  if (!parsed || !parsed.next || typeof parsed.next!=="object" || Array.isArray(parsed.next)) throw new Error("Invalid cursor");
  for(const [key,value] of Object.entries(parsed.next)) if(!cursorKeys.has(key) || value!=null && !/^\d{1,18}$/.test(String(value))) throw new Error("Invalid cursor");
  if(parsed.last!=null && !/^0x[\da-f]{64}$/i.test(parsed.last))throw new Error("Invalid cursor");
  return parsed;
}
export function eventCursorAfter(row) {
  const next=Object.fromEntries(eventCursorKeys.map(key=>[key,row[key]??null]));
  if(next.block_number==null || next.transaction_index==null || next.token_transfer_index==null)return null;
  if(Object.values(next).some(value=>value!=null && !/^\d{1,18}$/.test(String(value))))return null;
  return next;
}
export async function queryTransactions(params,{get}) {
  const filters=activityFilters(params),status=params.get("status") || "";
  const allowed=new Set([...Object.keys(filters),"cursor","status"]);
  for(const key of params.keys())if(!allowed.has(key))throw new Error("Unsupported transaction parameter");
  const invalid=validateActivity(filters);if(invalid)throw new Error(invalid);
  if(status && !["success","failed"].includes(status))throw new Error("Invalid status");
  // Native amounts and token amounts have different semantics; this endpoint
  // exposes parent from/to/method/time, not event-value filtering.
  if(filters.amount_from || filters.amount_to || filters.token_contract_address_hashes_to_include)throw new Error("Use token transfers for token and amount filters");
  const cursor=decodeTransactionCursor(params.get("cursor"));
  const tokenMode=filters.transaction_types?.startsWith("ERC-");
  // Token types represent emitted transfer events. Reverted parent calls have
  // no persisted transfer logs, so advancing an event cursor cannot match one.
  if(tokenMode && status==="failed")return {items:[],next_page_params:null};
  const upstreamFilters={...filters,transaction_types:filters.transaction_types || rootTypes};
  if(tokenMode)for(const key of ["from_address_hashes_to_include","to_address_hashes_to_include","address_relation","methods"])delete upstreamFilters[key];
  const seen=new Set(cursor.last ? [cursor.last.toLowerCase()] : []),items=[];
  let next=cursor.next,last=cursor.last,parentReads=0;
  const finish=()=>({items,next_page_params:next ? {cursor:Buffer.from(JSON.stringify({next,last})).toString("base64url")} : null});
  // A bounded scan preserves a resumable cursor even for sparse filters.
  for(let page=0;page<3;page++) {
    const data=await get(`/advanced-filters?${activityQuery(upstreamFilters,next)}`);
    if(!Array.isArray(data?.items))throw new Error("Invalid transaction source response");
    const candidates=data.items.flatMap((row,sourceIndex)=>{
      if(!row || typeof row!=='object' || Array.isArray(row))throw new Error('Invalid transaction source response');
      if(!tokenMode && (row.internal_transaction_index!=null || row.token_transfer_index!=null || row.token_transfer_batch_index!=null))return [];
      if(!/^0x[\da-f]{64}$/i.test(row.hash) || seen.has(row.hash.toLowerCase()))return [];
      seen.add(row.hash.toLowerCase());return [{row,sourceIndex}];
    });
    // Resolve independent parents in small batches. Preserve the source order
    // (and therefore its pagination boundary), regardless of response timing.
    // Wait for the entire batch before advancing or reporting a source failure.
    const batchSize=tokenMode ? 2 : candidates.length || 1;
    for(let offset=0;offset<candidates.length;) {
      const batch=candidates.slice(offset,offset+Math.min(batchSize,tokenMode ? Math.max(1,25-parentReads) : batchSize));
      offset+=batch.length;
      const results=await Promise.allSettled(batch.map(async ({row})=>{
        const source=tokenMode ? await get(`/transactions/${row.hash}`) : row;
        if(!source || typeof source!=='object' || Array.isArray(source) || typeof source.hash!=='string' || source.hash.toLowerCase()!==row.hash.toLowerCase())throw new Error('Invalid transaction source response');
        return normalizeParent(source);
      }));
      const failure=results.find(result=>result.status==='rejected');if(failure)throw failure.reason;
      for(const result of results) {
        const parent=result.value;
        if(parentMatches(parent,filters,status,{methodFiltered:!tokenMode}))items.push(parent);
        last=parent.hash;
        if(tokenMode)parentReads++;
      }
      if(tokenMode && parentReads>=25) {
        const boundary=batch.at(-1);
        if(boundary.sourceIndex<data.items.length-1) {
          const resume=eventCursorAfter(boundary.row);
          if(resume){next=resume;return finish();}
        } else {next=data.next_page_params;return finish();}
      }
    }
    next=data.next_page_params;
    if(!next || items.length>=25)break;
  }
  return finish();
}
