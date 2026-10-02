import test from 'node:test';
import assert from 'node:assert/strict';
import { blockFinality, executionFee, cursorQuery, transactionState, stateChangeText } from '../src/explorer-data.ts';

test('Inclusion, success, revert and pending are distinct', () => {
  assert.equal(transactionState({ block_number: null, status: null }), 'pending');
  assert.equal(transactionState({ block_number: 0, status: 'ok' }), 'success');
  assert.equal(transactionState({ block_number: 1, _live: true }), 'confirmed');
  assert.equal(transactionState({ block_number: 1, status: 'error' }), 'failed');
  assert.equal(transactionState({ block_number: 1, result: 'reverted' }), 'failed');
});
test('NFT state changes preserve structured directions and token IDs',()=>{
 const value=[{direction:'from',total:{token_id:'9007199254740993',value:'1'}}];
 assert.deepEqual(JSON.parse(stateChangeText(value)),value);
 assert.equal(stateChangeText('-9007199254740993'),'-9007199254740993');
 assert.equal(stateChangeText(null),'—');assert.equal(stateChangeText('0'),'0');
});

test('Safe/finalized claims require a ready node on the expected chain', () => {
  const snapshot = {online:true, synced:true, chainId:57073, expectedChainId:57073, safeBlock:100, finalizedBlock:80};
  for (const [height, expected] of [[80,'finalized'],[81,'safe'],[100,'safe'],[101,'confirmed']]) assert.equal(blockFinality({height},snapshot),expected);
  for (const override of [{online:false},{synced:false},{chainId:763373},{finalizedBlock:null,safeBlock:null}]) assert.equal(blockFinality({height:70},{...snapshot,...override}),'confirmed');
  assert.equal(blockFinality({height:70}), 'confirmed');
});

test('OP execution fees preserve wei precision and unknown values', () => {
  const tx={fee:{type:'actual',value:'24003533088'}, l1_fee:'23371143287', gas_used:'264709', gas_price:'2389'};
  assert.equal(executionFee(tx), '632389801');
  assert.equal(executionFee({...tx,gas_price:'9007199254740993'}), '2384286707523233516037');
  assert.equal(executionFee({...tx,gas_price:null,gas_used:null}), '632389801');
  for (const invalid of [{}, {fee:{type:'maximum',value:'100'}}, {fee:{type:'actual',value:'100'}}, {fee:{type:'actual',value:'100'},l1_fee:'200'}, {...tx,gas_used:'invalid'}]) assert.equal(executionFee(invalid),undefined);
});

test('Cursors keep zero and escape query values', () => {
  assert.equal(cursorQuery({index:0,missing:null,token:'a&b'}),'?index=0&token=a%26b');
  assert.equal(cursorQuery(null),'');
});
