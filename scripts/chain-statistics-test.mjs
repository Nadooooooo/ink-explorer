import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canonicalBlockCount} from '../src/chain-statistics.ts';

const frame = {
  connected: true, sentAt: '2026-10-23T05:00:01Z',
  network: {online:true, synced:true, stale:false, head:100, chainId:57073, expectedChainId:57073},
  block: {height:100, hash:'0x'+'a'.repeat(64), timestamp:'2026-10-23T05:00:00Z'},
};
test('canonical total includes genesis and follows head replacements, including rollbacks', () => {
  assert.equal(canonicalBlockCount(frame,57073),101);
  for (const height of [0,101,99]) assert.equal(canonicalBlockCount({...frame,network:{...frame.network,head:height},block:{...frame.block,height}},57073),height+1);
  const sepolia={...frame,network:{...frame.network,chainId:763373,expectedChainId:763373}};
  assert.equal(canonicalBlockCount(sepolia,763373),101);
  assert.equal(canonicalBlockCount(sepolia,57073),null);
});
test('unavailable, unsynced, mismatched and malformed observations never retain the old total', () => {
  assert.equal(canonicalBlockCount(undefined,57073),null);
  assert.equal(canonicalBlockCount({...frame,connected:false},57073),null);
  for(const change of [{online:false},{synced:false},{stale:true},{head:101},{chainId:763373},{expectedChainId:763373}])assert.equal(canonicalBlockCount({...frame,network:{...frame.network,...change}},57073),null);
  for(const change of [{height:null},{height:-1},{height:1.5},{height:Number.MAX_SAFE_INTEGER},{height:'100'},{hash:'bad'},{timestamp:'invalid'}])assert.equal(canonicalBlockCount({...frame,block:{...frame.block,...change}},57073),null);
  for(const sentAt of [undefined,'invalid','2026-10-23T05:02:01Z','2026-10-23T04:59:54Z'])assert.equal(canonicalBlockCount({...frame,sentAt},57073),null);
  assert.equal(canonicalBlockCount({...frame,sentAt:'2026-10-23T05:02:00Z'},57073),101);
});
