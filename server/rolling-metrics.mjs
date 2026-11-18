import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const hash = value => typeof value === 'string' && /^0x[0-9a-f]{64}$/i.test(value);
const quantity = value => {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value)) throw new Error('Invalid RPC quantity');
  return BigInt(value);
};
const integer = value => {
  const result = Number(quantity(value));
  if (!Number.isSafeInteger(result)) throw new Error('RPC quantity exceeds safe integer');
  return result;
};
const hex = value => '0x' + value.toString(16);
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

/** One row per complete block. Receipt membership and cumulative gas are checked
 * before any aggregate is saved. Fees remain unknown if their OP components
 * cannot be read exactly; unknown is never silently treated as zero. */
export function summarizeBlock(block, receipts) {
  if (!block || !hash(block.hash) || !hash(block.parentHash) || !Array.isArray(block.transactions) || !(receipts === null || Array.isArray(receipts))) throw new Error('Invalid block');
  const height = integer(block.number), timestamp = integer(block.timestamp), gasUsed = quantity(block.gasUsed);
  const txs = block.transactions.map(tx => typeof tx === 'string' ? tx : tx?.hash);
  if (txs.some(tx => !hash(tx)) || new Set(txs.map(tx => tx.toLowerCase())).size !== txs.length || receipts !== null && receipts.length !== txs.length) throw new Error('Incomplete block receipts');
  // Full nodes may have pruned older receipts. Header transaction membership is
  // still usable, but outcome/deposit/fee totals are explicitly unavailable.
  if (receipts === null && txs.length) return {height,hash:block.hash.toLowerCase(),parentHash:block.parentHash.toLowerCase(),timestamp,
    transactions:txs.length,successful:null,failed:null,deposits:null,feeWei:null,unknownFees:txs.length,gasUsed:gasUsed.toString()};
  receipts ||= [];
  const positions = new Map();
  for (const receipt of receipts) {
    if (!receipt || !same(receipt.blockHash, block.hash) || integer(receipt.blockNumber) !== height) throw new Error('Receipt belongs to another block');
    const index = integer(receipt.transactionIndex);
    if (index >= txs.length || positions.has(index) || !same(receipt.transactionHash, txs[index])) throw new Error('Invalid receipt membership');
    positions.set(index, receipt);
  }
  let fee = 0n, cumulative = 0n, unknownFees = 0, successful = 0, deposits = 0;
  for (let index = 0; index < txs.length; index++) {
    const receipt = positions.get(index), gas = quantity(receipt.gasUsed), price = quantity(receipt.effectiveGasPrice);
    const type = quantity(receipt.type), status = quantity(receipt.status);
    if (status !== 0n && status !== 1n) throw new Error('Invalid receipt status');
    successful += Number(status);
    const deposit = type === 126n;
    deposits += Number(deposit);
    cumulative += gas;
    if (quantity(receipt.cumulativeGasUsed) !== cumulative) throw new Error('Receipt gas does not reconcile');
    const l1 = receipt.l1Fee == null ? null : quantity(receipt.l1Fee);
    const operator = receipt.operatorFee == null ? null : quantity(receipt.operatorFee);
    const scalar = receipt.operatorFeeScalar == null ? 0n : quantity(receipt.operatorFeeScalar);
    const constant = receipt.operatorFeeConstant == null ? 0n : quantity(receipt.operatorFeeConstant);
    const refund = receipt.opGasRefund == null ? 0n : quantity(receipt.opGasRefund);
    if (deposit && (price !== 0n || (l1 ?? 0n) !== 0n || (operator ?? 0n) !== 0n)) throw new Error('Unexpected deposit fee');
    if ((!deposit && (l1 === null || (operator === null && (scalar > 0n || constant > 0n)))) || refund > 0n) unknownFees++;
    else fee += gas * price + (l1 ?? 0n) + (operator ?? 0n);
  }
  if (cumulative !== gasUsed) throw new Error('Block gas does not reconcile');
  return {height, hash:block.hash.toLowerCase(), parentHash:block.parentHash.toLowerCase(), timestamp,
    transactions:txs.length, successful, failed:txs.length-successful, deposits,
    feeWei:unknownFees ? null : fee.toString(), unknownFees, gasUsed:gasUsed.toString()};
}

export class RollingStore {
  constructor(file, chainId) {
    if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error('Invalid chain ID');
    if (file !== ':memory:') mkdirSync(dirname(file), {recursive:true});
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS blocks (height INTEGER PRIMARY KEY, hash TEXT UNIQUE NOT NULL, parent_hash TEXT NOT NULL, timestamp INTEGER NOT NULL, transactions INTEGER NOT NULL, successful INTEGER, failed INTEGER, deposits INTEGER, fee_wei TEXT, unknown_fees INTEGER NOT NULL, gas_used TEXT NOT NULL); CREATE INDEX IF NOT EXISTS blocks_timestamp ON blocks(timestamp);');
    this.db.exec('CREATE INDEX IF NOT EXISTS blocks_missing_recent ON blocks(timestamp,height) WHERE successful IS NULL;');
    const existing = this.db.prepare("SELECT value FROM metadata WHERE key='chainId'").get();
    if (existing && existing.value !== String(chainId)) {this.db.close(); throw new Error('Stored chain mismatch');}
    this.db.prepare("INSERT OR IGNORE INTO metadata VALUES ('chainId',?)").run(String(chainId));
    this.chainId = chainId;
    this.insert = this.db.prepare('INSERT INTO blocks VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  }
  tip() { return this.db.prepare('SELECT height,hash,timestamp FROM blocks ORDER BY height DESC LIMIT 1').get(); }
  first() { return this.db.prepare('SELECT height,hash,timestamp FROM blocks ORDER BY height LIMIT 1').get(); }
  at(height) { return this.db.prepare('SELECT height,hash,timestamp FROM blocks WHERE height=?').get(height); }
  boundary(timestamp) {return this.db.prepare('SELECT height,hash,timestamp FROM blocks WHERE timestamp<=? ORDER BY height DESC LIMIT 1').get(timestamp);}
  rewind(height) { this.db.prepare('DELETE FROM blocks WHERE height>?').run(height);this.windowCache=undefined; }
  clear() { this.db.exec('DELETE FROM blocks');this.windowCache=undefined; }
  append(rows) {
    if (!rows.length) return;
    let previous = this.tip();
    for (const row of rows) {
      if (previous && (row.height !== previous.height+1 || row.parentHash !== previous.hash || row.timestamp <= previous.timestamp)) throw new Error('Non-contiguous canonical window');
      previous = row;
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const r of rows) this.insert.run(r.height,r.hash,r.parentHash,r.timestamp,r.transactions,r.successful,r.failed,r.deposits,r.feeWei,r.unknownFees,r.gasUsed);
      this.db.exec('COMMIT');
    } catch (error) {this.db.exec('ROLLBACK'); throw error;}
  }
  snapshot(head, now = Date.now(), windowSeconds = 86400) {
    const tip = this.tip(), end = integer(head.timestamp), height = integer(head.number), from = end-windowSeconds;
    if (!tip || tip.height !== height || !same(tip.hash,head.hash) || now/1000-end > 120 || end-now/1000 > 5) throw new Error('Current canonical head unavailable');
    const boundary = this.db.prepare('SELECT height,hash,timestamp FROM blocks WHERE timestamp<=? ORDER BY height DESC LIMIT 1').get(from);
    if (!boundary) throw new Error('Incomplete 24-hour coverage');
    const count=this.db.prepare('SELECT count(*) count FROM blocks WHERE height>?').get(boundary.height).count;
    if (!count || count !== height-boundary.height) throw new Error('Incomplete 24-hour coverage');
    let cache=this.windowCache;
    if(!cache || cache.tip.height>height || cache.boundary>boundary.height || cache.windowSeconds!==windowSeconds) {
      cache={rows:new Map(),tip:boundary,boundary:boundary.height,windowSeconds,transactions:0,successful:0,deposits:0,unknownFees:0,missingReceipts:0,fee:0n,gas:0n};
    }
    const adjust=(row,direction)=>{
      cache.transactions+=direction*row.transactions;cache.successful+=direction*(row.successful??0);cache.deposits+=direction*(row.deposits??0);cache.unknownFees+=direction*row.unknown_fees;
      if(row.successful===null)cache.missingReceipts+=direction*row.transactions;
      if(row.fee_wei!==null)cache.fee+=BigInt(direction)*BigInt(row.fee_wei);else if(!row.unknown_fees)throw new Error('Invalid stored fee');
      cache.gas+=BigInt(direction)*BigInt(row.gas_used);
    };
    const additions=this.db.prepare('SELECT * FROM blocks WHERE height>? ORDER BY height').all(cache.tip.height);
    for(const row of additions){
      if(row.height!==cache.tip.height+1 || row.parent_hash!==cache.tip.hash || row.timestamp<=cache.tip.timestamp || row.timestamp>end)throw new Error('Incomplete canonical ancestry');
      cache.rows.set(row.height,row);adjust(row,1);cache.tip=row;
    }
    for(const [n,row] of cache.rows){if(n>boundary.height)break;adjust(row,-1);cache.rows.delete(n);}
    cache.boundary=boundary.height;
    if(cache.rows.size!==count || cache.tip.hash!==tip.hash)throw new Error('Incomplete canonical ancestry');
    this.windowCache=cache;
    const {transactions,successful,deposits,unknownFees,missingReceipts,fee,gas}=cache;
    return {chainId:this.chainId,source:'local-canonical-window',sampledAt:new Date(now).toISOString(),
      window:{from:new Date(from*1000).toISOString(),to:new Date(end*1000).toISOString(),seconds:windowSeconds,startExclusive:true,endInclusive:true,fromBlock:boundary.height+1,toBlock:height,toBlockHash:tip.hash,boundaryBlock:boundary.height,boundaryHash:boundary.hash,blocks:count},
      transactions,successful:missingReceipts ? null : successful,failed:missingReceipts ? null : transactions-successful,deposits:missingReceipts ? null : deposits,unknownFees,missingReceipts,
      feeWei:unknownFees ? null : fee.toString(),gasUsed:gas.toString()};
  }
  prune(end, windowSeconds=86400) {this.db.prepare('DELETE FROM blocks WHERE timestamp<?').run(end-windowSeconds-3600);}
  missingRecent(since, limit=32) {return this.db.prepare('SELECT height,hash FROM blocks INDEXED BY blocks_missing_recent WHERE successful IS NULL AND timestamp>=? ORDER BY height DESC LIMIT ?').all(since,limit);}
  repair(row) {
    // A late receipt cannot write a replaced branch back into the store.
    this.db.prepare('UPDATE blocks SET successful=?,failed=?,deposits=?,fee_wei=?,unknown_fees=? WHERE height=? AND hash=?').run(row.successful,row.failed,row.deposits,row.feeWei,row.unknownFees,row.height,row.hash);
    this.windowCache=undefined;
  }
  close() {this.db.close();}
}

/** Bounded JSON-RPC batches. No external API, transaction submission or secrets. */
export function localRpc(url) {
  const parsed = new URL(url);
  if (!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname)) throw new Error('Rolling metrics require a local RPC');
  let id = 0;
  const batch = async calls => {
    if (!calls.length || calls.length > 32) throw new Error('Invalid RPC batch size');
    const requests = calls.map(([method,params]) => ({jsonrpc:'2.0',id:++id,method,params}));
    const response = await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(requests),signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error(`Local RPC HTTP ${response.status}`);
    const values = await response.json();
    if (!Array.isArray(values) || values.length !== requests.length) throw new Error('Incomplete RPC batch');
    const byId = new Map(values.map(value => [value.id,value]));
    if (byId.size !== requests.length) throw new Error('Duplicate RPC response');
    return requests.map(request => {const value=byId.get(request.id);if (!value || value.error || value.result == null && request.method !== 'eth_getBlockReceipts') throw new Error(value?.error?.message || `Missing RPC result: ${request.method}`);return value.result;});
  };
  const rpc = async (method,params) => (await batch([[method,params]]))[0];
  rpc.batch = batch;
  return rpc;
}

export async function collectRollingWindow({store,rpc,windowSeconds=86400,batchSize=16,onProgress=()=>{},signal}) {
  const checkAbort = () => {if (signal?.aborted) throw signal.reason;};
  const getBlock = height => rpc('eth_getBlockByNumber',[hex(height),false]);
  checkAbort();
  const [chain,sync,head] = await rpc.batch([['eth_chainId',[]],['eth_syncing',[]],['eth_getBlockByNumber',['latest',false]]]);
  if (integer(chain) !== store.chainId || sync !== false) throw new Error('Local node is not synchronized to the expected chain');
  const height = integer(head.number), end = integer(head.timestamp), from = end-windowSeconds;
  if (Math.abs(Date.now()/1000-end)>120) throw new Error('Local node head is stale');
  // Find the final block outside the requested open-left/closed-right interval.
  const knownBoundary=store.boundary(from);
  let low=knownBoundary?.height??0, high=height;
  // A previous boundary is only a search hint, never evidence after a fork.
  if(knownBoundary){const block=await getBlock(low);if(integer(block.timestamp)>from)low=0;}
  while (low<high) {
    checkAbort();const middle=Math.ceil((low+high)/2), block=await getBlock(middle);
    if (integer(block.timestamp)<=from) low=middle;else high=middle-1;
  }
  const start = low, boundary=await getBlock(start);
  if (integer(boundary.timestamp)>from) throw new Error('Chain is younger than requested window');
  let first=store.first(), tip=store.tip();
  // Old, disconnected or incomplete generations cannot supply an aggregate.
  if (first && (first.height>start || tip.height<start)) {store.clear();first=tip=undefined;}
  if (tip) {
    const upper=Math.min(tip.height,height), canonical=await getBlock(upper);
    if (!same(store.at(upper)?.hash,canonical.hash)) {
      let left=first.height-1,right=upper;
      while(left<right) {
        checkAbort();const middle=Math.ceil((left+right)/2),block=await getBlock(middle);
        if(same(store.at(middle)?.hash,block.hash))left=middle;else right=middle-1;
      }
      store.rewind(left);
    } else if(tip.height>height) store.rewind(height);
    tip=store.tip();
  }
  for(let next=tip ? tip.height+1 : start;next<=height;next+=batchSize) {
    checkAbort();
    const numbers=Array.from({length:Math.min(batchSize,height-next+1)},(_,i)=>next+i);
    const blocks=await rpc.batch(numbers.map(n=>['eth_getBlockByNumber',[hex(n),false]]));
    if(blocks.some((block,index)=>integer(block.number)!==numbers[index]))throw new Error('Wrong RPC block height');
    const receipts=await rpc.batch(blocks.map(block=>['eth_getBlockReceipts',[block.hash]]));
    checkAbort();store.append(blocks.map((block,index)=>summarizeBlock(block,receipts[index])));
    onProgress({height: numbers.at(-1), target:height, fromBlock:start, blocks:numbers.length});
    // Let the node and event loop continue serving interactive explorer traffic.
    await new Promise(resolve=>setTimeout(resolve,5));
  }
  checkAbort();
  const missing=store.missingRecent(end-120);
  if(missing.length) {
    const blocks=await rpc.batch(missing.map(row=>['eth_getBlockByNumber',[hex(row.height),false]]));
    const receipts=await rpc.batch(blocks.map(block=>['eth_getBlockReceipts',[block.hash]]));
    blocks.forEach((block,index)=>{if(receipts[index]!==null)store.repair(summarizeBlock(block,receipts[index]));});
  }
  const confirmed = await getBlock(height);
  if(!same(confirmed.hash,head.hash))throw new Error('Canonical head changed during collection');
  const result=store.snapshot(head,Date.now(),windowSeconds);
  store.prune(end,windowSeconds);
  return result;
}
