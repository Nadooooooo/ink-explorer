export class ParentSourceBusyError extends Error {
  constructor(delayMs) {
    super('Transaction search is busy; retry shortly');
    this.name='ParentSourceBusyError';
    this.retryAfter=Math.max(1,Math.ceil(delayMs/1000));
  }
}
function sleep(ms,signal) {
  return new Promise((resolve,reject)=>{
    const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(signal.reason);};
    const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  });
}
function interruptible(promise,signal) {
  if(!signal)return promise;
  return new Promise((resolve,reject)=>{
    const abort=()=>{signal.removeEventListener('abort',abort);reject(signal.reason);};
    signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
    promise.then(value=>{signal.removeEventListener('abort',abort);resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
  });
}
const number=value=>value!=null&&value.length<=32&&/^\d+(?:\.\d+)?$/.test(value)&&Number.isFinite(Number(value))?Number(value):null;

// Shared by bulk transaction searches within one network process. Cached and
// coalesced reads bypass this gate in fetchJson. Only actual parent HTTP reads
// consume a slot; the index's response headers can slow them further.
export function createParentRequestGate({now=Date.now,wait=sleep,spacingMs=500}={}) {
  let tail=Promise.resolve(),nextAt=0,blockedUntil=0,budget;
  return {
    observe(headers,status) {
      const time=now(),remaining=number(headers.get('x-ratelimit-remaining')),reset=number(headers.get('x-ratelimit-reset'));
      // Blockscout defines X-RateLimit-Reset as a duration in milliseconds.
      // A -1 header means disabled/unknown and must not become an exhausted limit.
      if(Number.isSafeInteger(remaining)&&reset!==null&&reset>0&&reset<=3600000){
        const until=time+reset;
        budget={until,remaining:budget&&budget.until>time&&Math.abs(budget.until-until)<2000?Math.min(budget.remaining,remaining):remaining};
      }
      if(status===429){
        const header=headers.get('retry-after'),seconds=number(header),date=header?Date.parse(header):NaN;
        const retry=seconds!==null?seconds*1000:Number.isFinite(date)?Math.max(0,date-time):reset!==null&&reset>0?reset:3000;
        blockedUntil=Math.max(blockedUntil,time+Math.max(1000,retry));
      }
    },
    acquire(signal,deadline=Infinity) {
      const task=tail.then(async()=>{
        for(;;){
          signal?.throwIfAborted();const time=now();
          if(budget&&budget.until<=time)budget=undefined;
          const start=Math.max(nextAt,blockedUntil,budget?.remaining===0?budget.until:0),delay=Math.max(0,start-time);
          if(delay&&time+delay>=deadline)throw new ParentSourceBusyError(delay);
          if(delay){await wait(delay,signal);continue;}
          const pace=budget?Math.max(spacingMs,(budget.until-time)/Math.max(1,budget.remaining-5)):spacingMs;
          if(budget)budget.remaining=Math.max(0,budget.remaining-1);
          nextAt=time+pace;return;
        }
      });
      tail=task.catch(()=>{});
      return interruptible(task,signal);
    },
  };
}
