import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createIndexedObserver,indexedHead,INDEXED_UPDATE_INTERVAL} from '../src/indexed-updates.ts';
function harness(){
 let time=0,id=0;const timers=new Map(),jobs=[],states=[];
 const clock={now:()=>time,schedule:(run,ms)=>{timers.set(++id,{run,at:time+ms});return id;},cancel:id=>timers.delete(id)};
 const advance=async ms=>{time+=ms;for(const[id,timer]of [...timers])if(timer.at<=time){timers.delete(id);timer.run();}await Promise.resolve();await Promise.resolve();};
 const observer=createIndexedObserver({clock,publish:s=>states.push(s),load:signal=>new Promise((resolve,reject)=>jobs.push({signal,resolve,reject}))});
 return {observer,jobs,states,timers,advance,state:()=>states.at(-1)};
}
const snapshot=n=>({items:[{hash:n,value:'900719925474099312345'}],next_page_params:{index:0,foo:null}});
test('chain identity, health and canonical hash are required, including same-height replacements',()=>{
 const live={connected:true,network:{online:true,synced:true,chainId:57073,expectedChainId:57073},block:{height:123,hash:'0x'+'a'.repeat(64)}};
 assert.equal(indexedHead(live,57073),`57073:123:${live.block.hash}`);
 for(const n of [{online:false},{synced:false},{stale:true},{chainId:763373},{expectedChainId:763373}])assert.equal(indexedHead({...live,network:{...live.network,...n}},57073),undefined);
 assert.equal(indexedHead({...live,connected:false},57073),undefined);assert.equal(indexedHead({...live,block:{height:1,hash:'bad'}},57073),undefined);
 assert.notEqual(indexedHead({...live,block:{...live.block,hash:'0x'+'b'.repeat(64)}},57073),indexedHead(live,57073));
});
test('head bursts coalesce, no idle polling, rows wait for explicit acceptance',async()=>{
 const h=harness();h.observer.baseline(snapshot(1));h.observer.observe('h1');for(let i=2;i<100;i++)h.observer.observe('h'+i);
 await h.advance(INDEXED_UPDATE_INTERVAL-1);assert.equal(h.jobs.length,0);await h.advance(1);assert.equal(h.jobs.length,1);
 h.jobs[0].resolve(snapshot(2));await h.advance(0);assert.deepEqual(h.state().candidate,snapshot(2));assert.deepEqual(h.observer.take(),snapshot(2));assert.equal(h.observer.take(),undefined);
 await h.advance(100000);assert.equal(h.jobs.length,1);h.observer.observe('h100');await h.advance(0);assert.equal(h.jobs.length,2);h.jobs[1].resolve(snapshot(2));await h.advance(0);assert.equal(h.state().candidate,undefined);h.observer.dispose();
});
test('one in-flight read, a later head is checked after completion',async()=>{
 const h=harness();h.observer.baseline(snapshot(1));h.observer.observe('h1');await h.advance(16000);h.observer.observe('h2');await h.advance(20000);assert.equal(h.jobs.length,1);
 h.jobs[0].resolve(snapshot(2));await h.advance(0);await h.advance(0);assert.equal(h.jobs.length,2);h.jobs[1].resolve(snapshot(3));await h.advance(0);assert.deepEqual(h.observer.take(),snapshot(3));h.observer.dispose();
});
test('disconnect, hidden page and disposed scopes cancel reads and ignore delayed responses',async()=>{
 for(const operation of ['suspend','dispose','disconnect']){
  const h=harness();h.observer.baseline(snapshot(1));h.observer.observe('h1');await h.advance(16000);if(operation==='disconnect')h.observer.observe(undefined);else h.observer[operation]();
  assert(h.jobs[0].signal.aborted);const before=h.states.length;h.jobs[0].resolve(snapshot(2));await h.advance(90000);assert.equal(h.states.length,before);assert.equal(h.observer.take(),undefined);assert.equal(h.timers.size,0);h.observer.dispose();
 }
});
test('failed or stale reads discard the candidate, back off, and recover on a new head',async()=>{
 const h=harness();h.observer.baseline(snapshot(1));h.observer.observe('h1');await h.advance(16000);h.jobs[0].resolve(snapshot(2));await h.advance(0);
 h.observer.observe('h2');await h.advance(16000);h.jobs[1].reject(Error('stale'));await h.advance(0);assert.equal(h.state().unavailable,true);assert.equal(h.observer.take(),undefined);
 h.observer.observe('h3');await h.advance(31999);assert.equal(h.jobs.length,2);await h.advance(1);assert.equal(h.jobs.length,3);h.jobs[2].resolve(snapshot(3));await h.advance(0);assert.equal(h.state().unavailable,false);assert.deepEqual(h.observer.take(),snapshot(3));h.observer.dispose();
});
test('same rows with changed values or cursor offer an update; metadata alone does not',async()=>{
 const h=harness();h.observer.baseline(snapshot(1));h.observer.observe('h1');await h.advance(16000);h.jobs[0].resolve({...snapshot(1),sampledAt:'later'});await h.advance(0);assert.equal(h.state().candidate,undefined);
 h.observer.observe('h2');await h.advance(16000);h.jobs[1].resolve({...snapshot(1),items:[{hash:1,value:'900719925474099312346'}]});await h.advance(0);assert(h.state().candidate);h.observer.dispose();
});
