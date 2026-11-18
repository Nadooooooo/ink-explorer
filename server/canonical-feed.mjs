import { WebSocket } from "ws";
import { id } from "ethers";

const number = value => value == null ? null : Number(BigInt(value));
const decimal = value => value == null ? null : BigInt(value).toString();
const transferTopics = new Set(["Transfer(address,address,uint256)","TransferSingle(address,address,address,uint256,uint256)","TransferBatch(address,address,address,uint256[],uint256[])"].map(id));

export function receiptFee(receipt) {
  if (receipt.gasUsed == null || receipt.effectiveGasPrice == null) return null;
  const execution = BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice);
  // Do not invent an operator fee from a version-dependent scalar formula.
  if (receipt.operatorFee == null && (BigInt(receipt.operatorFeeScalar || 0) > 0n || BigInt(receipt.operatorFeeConstant || 0) > 0n)) return null;
  if (receipt.l1Fee == null && receipt.type !== "0x7e") return null;
  return { value: String(execution + BigInt(receipt.l1Fee || 0) + BigInt(receipt.operatorFee || 0)), type:"actual", execution: String(execution), l1: decimal(receipt.l1Fee), operator: decimal(receipt.operatorFee) };
}

export function normalizedBlock(block) {
  return { hash:block.hash, parent_hash:block.parentHash, height:number(block.number), timestamp:new Date(number(block.timestamp)*1000).toISOString(),
    transactions_count:block.transactions.length, gas_used:decimal(block.gasUsed), gas_limit:decimal(block.gasLimit),
    gas_used_percentage:Number(block.gasLimit) ? Number(block.gasUsed) / Number(block.gasLimit) * 100 : null,
    size:number(block.size), transaction_fees:null, _live:true, miner:block.miner,
    transaction_hashes:block.transactions.map(tx => typeof tx === "string" ? tx : tx.hash),
  };
}

export function normalizedTransactions(block, receipts = []) {
  const byHash = new Map(receipts.filter(receipt => receipt.blockHash === block.hash).map(receipt => [receipt.transactionHash, receipt]));
  return block.transactions.filter(tx => tx && typeof tx === "object").map(tx => {
    const receipt = byHash.get(tx.hash), creation = !tx.to, input = tx.input || "0x";
    const tokenTransfer = receipt?.logs?.some(log => transferTopics.has(log.topics?.[0]));
    const kind = creation ? "contract_creation" : tokenTransfer ? "token_transfer" : input !== "0x" ? "contract_interaction" : "coin_transfer";
    return { hash:tx.hash, block_hash:block.hash, block_number:number(block.number), position:number(tx.transactionIndex), timestamp:new Date(number(block.timestamp)*1000).toISOString(),
      status:receipt ? (number(receipt.status) === 1 ? "ok" : number(receipt.status) === 0 ? "error" : null) : null,
      result:receipt ? (number(receipt.status) === 1 ? "success" : number(receipt.status) === 0 ? "execution reverted" : "confirmed") : "confirmed",
      from:{hash:tx.from}, to:tx.to ? {hash:tx.to} : null, created_contract:receipt?.contractAddress ? {hash:receipt.contractAddress,is_contract:true} : null,
      value:decimal(tx.value), method:input.length >= 10 ? input.slice(0,10) : creation ? "contract_creation" : "transfer",
      transaction_types:[kind], gas_used:decimal(receipt?.gasUsed), gas_price:decimal(receipt?.effectiveGasPrice), fee:receipt ? receiptFee(receipt) : null, _live:true,
    };
  });
}

export function utilization(blocks, window = 30) {
  const sorted = [...blocks].sort((a,b) => a.height-b.height);
  if (sorted.length !== window || sorted.some((b,i) => i > 0 && (b.height !== sorted[i-1].height+1 || b.parent_hash !== sorted[i-1].hash))) return null;
  const gasUsed = sorted.reduce((sum,b) => sum+BigInt(b.gas_used), 0n), gasLimit = sorted.reduce((sum,b) => sum+BigInt(b.gas_limit),0n);
  return { percentage:gasLimit ? Number(gasUsed*100000000n/gasLimit)/1000000 : null, gasUsed:String(gasUsed), gasLimit:String(gasLimit), blocks:window, fromBlock:sorted[0].height, toBlock:sorted.at(-1).height, sampledAt:sorted.at(-1).timestamp };
}

/** Keeps a bounded, contiguous canonical window. Parent hashes repair gaps and
 * same-height reorganizations before publishing. Slow receipts cannot reinsert
 * orphaned transactions. No historical index is implied by this rolling feed. */
export function createCanonicalFeed({ rpc, onUpdate, window = 30 }) {
  let raw = new Map(), receipts = new Map(), pending = null, running = null, revision = 0;
  const enriching = new Set();
  const retryAfter=new Map();
  const snapshot = () => {
    const chain = [...raw.values()].sort((a,b) => number(b.number)-number(a.number));
    const blocks = chain.map(normalizedBlock);
    const transactions = chain.flatMap(block => normalizedTransactions(block, receipts.get(block.hash))).slice(0,150);
    return { block:blocks[0] || null, blocks, transactions, utilization:utilization(blocks,window), revision };
  };
  const enrich = async block => {
    if (enriching.has(block.hash)) return;
    enriching.add(block.hash);
    try {
      const value = await rpc("eth_getBlockReceipts", [block.hash]);
      if (!Array.isArray(value) || !raw.has(block.hash)) return;
      const received=new Set(value.filter(item=>item.blockHash===block.hash).map(item=>item.transactionHash));
      if(block.transactions.some(tx=>!received.has(typeof tx==="string"?tx:tx.hash)))return;
      receipts.set(block.hash,value); revision++; onUpdate(snapshot(),"receipts");
    } catch { /* A later head/recovery retries missing receipts. */ }
    finally { enriching.delete(block.hash);if(raw.has(block.hash) && !receipts.has(block.hash))retryAfter.set(block.hash,Date.now()+2000);pumpReceipts(); }
  };
  const pumpReceipts=()=>{
    for(const block of raw.values()) {
      if(enriching.size>=3)break;
      if(!receipts.has(block.hash) && !enriching.has(block.hash) && (retryAfter.get(block.hash)||0)<=Date.now())void enrich(block);
    }
  };
  const process = async block => {
    if (!block?.hash || !Array.isArray(block.transactions)) return;
    if (snapshot().block?.height > number(block.number) && !raw.has(block.hash)) {
      // A delayed fork ancestor must not rewind the visible head. Reconcile
      // against the node's current tip, which also reconstructs the ancestry.
      const latest = await rpc("eth_getBlockByNumber", ["latest", true]);
      if (!latest || number(latest.number) < snapshot().block.height) return;
      block = latest;
    }
    const canonical = await rpc("eth_getBlockByNumber", [block.number,false]);
    if (canonical?.hash !== block.hash) return;
    if (snapshot().block?.height > number(block.number) && raw.has(block.hash)) return;
    if (snapshot().block?.hash === block.hash) {
      pumpReceipts();
      return;
    }
    const branch = [block];
    while (branch.length < window && number(branch.at(-1).number) > 0) {
      const last = branch.at(-1);
      const parent = raw.get(last.parentHash) || await rpc("eth_getBlockByHash", [last.parentHash,true]);
      if (!parent || parent.hash !== last.parentHash || number(parent.number) !== number(last.number)-1) throw new Error("Incomplete canonical block window");
      branch.push(parent);
    }
    // Re-check after ancestry fetching: another reorganization may have landed.
    const check = await rpc("eth_getBlockByNumber",[block.number,false]);
    if (check?.hash !== block.hash) return;
    raw = new Map(branch.map(item => [item.hash,item]));
    receipts = new Map([...receipts].filter(([hash]) => raw.has(hash)));
    for(const hash of retryAfter.keys())if(!raw.has(hash))retryAfter.delete(hash);
    revision++; onUpdate(snapshot(),"block");
    // Latest blocks lead, but a recovered gap also obtains receipts for older
    // blocks in the window. At most three receipt requests are in flight.
    pumpReceipts();
  };
  return { snapshot, accept(block) {
    if (!block?.hash || !Array.isArray(block.transactions) || !/^0x[\da-f]+$/i.test(block.number || "")) return Promise.resolve();
    // At most one pending tip. Missing intermediate heads are reconstructed by
    // parent hash, so slow RPC cannot accumulate an unbounded promise queue.
    if (!pending || number(block?.number) >= number(pending.number)) pending = block;
    if (!running) running = (async () => {
      let failure;
      try {
        while (pending) { const next=pending;pending=null;try {await process(next);failure=undefined;}catch(error){failure=error;} }
        if (failure) throw failure;
      } finally { running=null; }
    })();
    return running;
  } };
}

export function subscribeHeads({ url, rpc, chainId, onHead, onTransport }) {
  let socket, retry, closed=false, attempts=0, lastHead=0, subscription=null;
  const connect = async () => {
    if (closed) return;
    try { if (number(await rpc("eth_chainId",[])) !== chainId) throw new Error("Wrong RPC chain"); }
    catch { retry=setTimeout(connect,5000); retry.unref?.(); return; }
    if (closed) return;
    socket=new WebSocket(url,{handshakeTimeout:5000});
    const connection=socket;
    connection.on("open",()=>connection.send(JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_subscribe",params:["newHeads"]})));
    connection.on("message",data=>{
      if (closed || socket!==connection) return;
      try {
        const message=JSON.parse(String(data));
        if (message.id===1 && typeof message.result==="string") { subscription=message.result; attempts=0; onTransport("subscription"); }
        if (message.method==="eth_subscription" && message.params?.subscription===subscription && message.params.result?.hash) { lastHead=Date.now(); onHead(message.params.result); }
      } catch { /* Ignore malformed frames. */ }
    });
    connection.on("error",()=>connection.close());
    connection.on("close",()=>{ if (socket!==connection) return; subscription=null; onTransport("polling"); if (!closed) { retry=setTimeout(connect,Math.min(1000*2**attempts++,15000)); retry.unref?.(); } });
  };
  void connect();
  return { healthy:()=>Boolean(subscription && Date.now()-lastHead<5000), close:()=>{ closed=true;clearTimeout(retry);socket?.close(); } };
}
