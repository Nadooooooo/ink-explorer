import test from 'node:test';
import assert from 'node:assert/strict';
import {createParentRequestGate,ParentSourceBusyError} from '../server/parent-request-gate.mjs';
const harness=()=>{let time=0;const waits=[];const gate=createParentRequestGate({now:()=>time,wait:async ms=>{waits.push(ms);time+=ms;}});return {gate,waits,now:()=>time,set:value=>time=value};};
test('uncached reads share a paced queue rather than bursting per query',async()=>{
 const h=harness();const times=await Promise.all([1,2,3].map(async()=>{await h.gate.acquire();return h.now();}));assert.deepEqual(times,[0,500,1000]);assert.deepEqual(h.waits,[500,500]);
});
test('observed budget reserves capacity and reset uses milliseconds',async()=>{
 const h=harness();h.gate.observe(new Headers({'x-ratelimit-remaining':'8','x-ratelimit-reset':'9000'}),200);await h.gate.acquire();await h.gate.acquire();assert.equal(h.now(),3000);
 const empty=harness();empty.gate.observe(new Headers({'x-ratelimit-remaining':'0','x-ratelimit-reset':'1500'}),200);await empty.gate.acquire();assert.equal(empty.now(),1500);
});
test('unknown or disabled rate headers do not invent a budget',async()=>{
 for(const remaining of ['-1','NaN','Infinity','1e20','', '0.5','9'.repeat(400)]){const h=harness();h.gate.observe(new Headers({'x-ratelimit-remaining':remaining,'x-ratelimit-reset':'60000'}),200);await h.gate.acquire();await h.gate.acquire();assert.equal(h.now(),500,remaining);}
});
test('a 429 honors Retry-After seconds, HTTP dates and Blockscout reset duration',async()=>{
 for(const [headers,delay] of [[{'retry-after':'2'},2000],[{'retry-after':new Date(4000).toUTCString()},4000],[{'x-ratelimit-reset':'2500'},2500],[{},3000]]){const h=harness();h.gate.observe(new Headers(headers),429);await h.gate.acquire();assert.equal(h.now(),delay);}
});
test('an exhausted budget beyond the request deadline gives a useful retry delay without waiting',async()=>{
 const h=harness();h.gate.observe(new Headers({'x-ratelimit-remaining':'0','x-ratelimit-reset':'60000'}),429);await assert.rejects(h.gate.acquire(undefined,45000),error=>error instanceof ParentSourceBusyError&&error.retryAfter===60);assert.equal(h.now(),0);assert.deepEqual(h.waits,[]);h.set(60000);await h.gate.acquire(undefined,65000);
});
test('late responses cannot increase an already consumed budget in the same window',async()=>{
 const h=harness();h.gate.observe(new Headers({'x-ratelimit-remaining':'1','x-ratelimit-reset':'6000'}),200);h.gate.observe(new Headers({'x-ratelimit-remaining':'99','x-ratelimit-reset':'6000'}),200);await h.gate.acquire();await h.gate.acquire();assert.equal(h.now(),6000);
});
test('cancellation reaches queued callers immediately and does not consume future slots',async()=>{
 let time=0,release;const entered=new Promise(r=>release=r),controller=new AbortController(),queued=new AbortController();
 const gate=createParentRequestGate({now:()=>time,wait:(_ms,signal)=>new Promise((_r,reject)=>{release();signal.addEventListener('abort',()=>reject(signal.reason),{once:true});})});
 await gate.acquire();const first=gate.acquire(controller.signal);await entered;const second=gate.acquire(queued.signal);queued.abort(new Error('queued cancellation'));await assert.rejects(second,/queued cancellation/);controller.abort(new Error('head cancellation'));await assert.rejects(first,/head cancellation/);time=500;await gate.acquire();
});
test('an already cancelled request does not use a slot',async()=>{
 const h=harness(),controller=new AbortController();controller.abort(new Error('cancelled'));await assert.rejects(h.gate.acquire(controller.signal),/cancelled/);await h.gate.acquire();assert.equal(h.now(),0);
});
