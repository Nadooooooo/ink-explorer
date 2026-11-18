import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currentNetworkObservation, networkObservationMaxAge } from '../src/network-observation.ts';
const now=Date.parse('2026-10-23T10:00:00Z');
for(const chainId of [57073,763373])test(`Network health observation ${chainId}`,()=>{
 const data={chainId,expectedChainId:chainId,online:true,synced:true,sampledAt:new Date(now).toISOString()},frame={connected:true,network:data};
 assert.equal(currentNetworkObservation(frame,chainId,now),data);
 assert.equal(currentNetworkObservation(frame,chainId,now+networkObservationMaxAge),data);
 assert.equal(currentNetworkObservation(frame,chainId,now+networkObservationMaxAge+1),null);
 assert.equal(currentNetworkObservation({...frame,connected:false},chainId,now),null);
 for(const sampledAt of [undefined,null,'invalid',new Date(now+30001).toISOString()])assert.equal(currentNetworkObservation({...frame,network:{...data,sampledAt}},chainId,now),null);
 assert.equal(currentNetworkObservation({...frame,network:{...data,expectedChainId:1}},chainId,now),null);
 assert.equal(currentNetworkObservation({...frame,network:{...data,chainId:1}},chainId,now),null);
 const behind={...data,synced:false,stale:true};assert.equal(currentNetworkObservation({...frame,network:behind},chainId,now),behind);
 const offline={...data,chainId:null,online:false};assert.equal(currentNetworkObservation({...frame,network:offline},chainId,now),offline);
});
