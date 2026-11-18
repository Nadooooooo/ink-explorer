type Snapshot = {items: unknown[]; next_page_params?: unknown};
type Live = {connected: boolean; network?: Record<string, any>; block?: Record<string, any>};
export const INDEXED_UPDATE_INTERVAL = 16_000; // Upstream snapshots have a 15 s cache.
export function indexedHead(live: Live | undefined, chainId: number): string | undefined {
  const n=live?.network,b=live?.block;
  if (!live?.connected || n?.online!==true || n.synced!==true || n.stale===true || n.chainId!==chainId || n.expectedChainId!==chainId) return;
  if (!Number.isSafeInteger(b?.height) || b!.height<0 || !/^0x[\da-f]{64}$/i.test(b?.hash||'')) return;
  return `${chainId}:${b!.height}:${b!.hash.toLowerCase()}`;
}
export type IndexedUpdateState<T> = {candidate?: T; unavailable: boolean};
type Clock = {now:()=>number; schedule:(run:()=>void,ms:number)=>unknown; cancel:(timer:unknown)=>void};
const systemClock:Clock={now:()=>Date.now(),schedule:(run,ms)=>setTimeout(run,ms),cancel:timer=>clearTimeout(timer as ReturnType<typeof setTimeout>)};
const signature=(value:Snapshot)=>JSON.stringify([value.items,value.next_page_params]);

// New heads trigger coalesced index reads. Only an indexed response can offer an
// update; rows are never synthesized from node events or changed during reading.
export function createIndexedObserver<T extends Snapshot>({load,publish,clock=systemClock,interval=INDEXED_UPDATE_INTERVAL}:{load:(signal:AbortSignal)=>Promise<T>;publish:(state:IndexedUpdateState<T>)=>void;clock?:Clock;interval?:number}) {
  let baseline='',candidate:T|undefined,head:string|undefined,requested:string|undefined;
  let timer:unknown,request:AbortController|undefined,generation=0,disposed=false,lastStart=clock.now(),failures=0;
  const emit=(unavailable=false)=>{if(!disposed)publish({candidate,unavailable});};
  const cancel=()=>{generation++;if(timer!=null)clock.cancel(timer);timer=undefined;request?.abort();request=undefined;};
  const schedule=()=>{
    if(disposed||!baseline||!head||head===requested||timer!=null||request)return;
    const delay=Math.max(0,lastStart+Math.min(60_000,interval*2**failures)-clock.now());
    timer=clock.schedule(()=>{timer=undefined;void run();},delay);
  };
  const run=async()=>{
    if(disposed||!baseline||!head||request)return;
    const current=++generation,controller=new AbortController();request=controller;requested=head;lastStart=clock.now();
    try{
      const value=await load(controller.signal);
      if(disposed||current!==generation||controller.signal.aborted)return;
      candidate=signature(value)===baseline?undefined:value;failures=0;emit();
    }catch{
      if(disposed||current!==generation||controller.signal.aborted)return;
      candidate=undefined;failures=Math.min(failures+1,2);emit(true);
    }finally{
      if(current===generation){request=undefined;schedule();}
    }
  };
  return {
    baseline(value:T){baseline=signature(value);candidate=undefined;lastStart=clock.now();emit();schedule();},
    observe(value:string|undefined){
      head=value;
      if(!head){cancel();requested=undefined;candidate=undefined;emit(true);return;}
      schedule();
    },
    suspend(){head=undefined;requested=undefined;candidate=undefined;cancel();emit(true);},
    take(){const value=candidate;if(!value||!head)return;baseline=signature(value);candidate=undefined;emit();return value;},
    dispose(){disposed=true;cancel();},
  };
}
