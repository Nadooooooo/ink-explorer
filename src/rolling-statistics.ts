type Row=Record<string,any>;
export type RollingStatistics={
  status:'ready';chainId:number;source:'local-canonical-window';sampledAt:string;
  window:{from:string;to:string;seconds:number;startExclusive:true;endInclusive:true;fromBlock:number;toBlock:number;toBlockHash:string;boundaryBlock:number;boundaryHash:string;blocks:number};
  transactions:number;unknownFees:number;missingReceipts:number;feeWei:string|null;
};
export type RollingFrame={connected:boolean;sentAt?:string;network?:Row;block?:Row;blocks?:Row[];rolling24h?:unknown};
const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const hash=(v:unknown):v is string=>typeof v==='string'&&/^0x[\da-f]{64}$/i.test(v);
const object=(v:unknown):v is Row=>!!v&&typeof v==='object'&&!Array.isArray(v);

/** A recent file/HTTP response alone does not establish a current aggregate.
 * Its end block must still belong to this frame's canonical chain. */
export function currentRollingStatistics(frame:RollingFrame|undefined,chainId:number):RollingStatistics|null {
  const n=frame?.network,b=frame?.block,r=frame?.rolling24h;
  if(!frame?.connected||n?.online!==true||n.synced!==true||n.stale===true||n.chainId!==chainId||n.expectedChainId!==chainId||!integer(b?.height)||n.head!==b.height||!hash(b.hash))return null;
  if(!object(r)||r.status!=='ready'||r.chainId!==chainId||r.source!=='local-canonical-window'||!object(r.window))return null;
  const w=r.window,sent=Date.parse(frame.sentAt||''),sampled=Date.parse(r.sampledAt),from=Date.parse(w.from),to=Date.parse(w.to),head=Date.parse(b.timestamp);
  if([sent,sampled,from,to,head].some(t=>!Number.isFinite(t))||sent-sampled>5000||sampled-sent>1000||sent-to>5000||to-sent>1000||sent-head>5000||head-sent>1000)return null;
  if(w.seconds!==86400||to-from!==86400000||w.startExclusive!==true||w.endInclusive!==true||!integer(w.fromBlock)||!integer(w.toBlock)||!integer(w.boundaryBlock)||!integer(w.blocks)||!w.blocks||w.fromBlock!==w.boundaryBlock+1||w.blocks!==w.toBlock-w.boundaryBlock||w.toBlock>b.height||!hash(w.toBlockHash)||!hash(w.boundaryHash))return null;
  const anchor=frame.blocks?.find(row=>row.height===w.toBlock);
  if(!anchor||anchor.hash?.toLowerCase()!==w.toBlockHash.toLowerCase()||Date.parse(anchor.timestamp)!==to)return null;
  if(!integer(r.transactions)||!integer(r.unknownFees)||!integer(r.missingReceipts)||r.unknownFees>r.transactions||r.missingReceipts>r.unknownFees)return null;
  if(r.feeWei!==null&&(typeof r.feeWei!=='string'||!/^\d+$/.test(r.feeWei)||r.unknownFees!==0))return null;
  return {status:'ready',chainId,source:'local-canonical-window',sampledAt:r.sampledAt,
    window:{from:w.from,to:w.to,seconds:86400,startExclusive:true,endInclusive:true,fromBlock:w.fromBlock,toBlock:w.toBlock,toBlockHash:w.toBlockHash,boundaryBlock:w.boundaryBlock,boundaryHash:w.boundaryHash,blocks:w.blocks},
    transactions:r.transactions,unknownFees:r.unknownFees,missingReceipts:r.missingReceipts,feeWei:r.feeWei};
}
