import test from 'node:test';
import assert from 'node:assert/strict';
import { blockFinality, executionFee, cursorQuery, transactionState, stateChangeText, formatWei, formatChainAmount, mergeIndexedBlocks } from '../src/explorer-data.ts';

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
  for (const override of [{online:false},{synced:false},{stale:true},{chainId:763373},{finalizedBlock:null,safeBlock:null}]) assert.equal(blockFinality({height:70},{...snapshot,...override}),'confirmed');
  assert.equal(blockFinality({height:70}), 'confirmed');
});
test('a reorganized block is never claimed canonical or finalized based on its height',()=>{
 const snapshot={online:true,synced:true,chainId:57073,expectedChainId:57073,safeBlock:100,finalizedBlock:80};
 for(const height of [70,90,110])assert.equal(blockFinality({height,type:'reorg'},snapshot),'Forked block');
 assert.equal(blockFinality({height:70,type:'reorg'}),'Forked block');
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

test('detail ETH values preserve single wei and integers beyond floating point precision',()=>{
  assert.equal(formatWei('9007199254740993000000000000000001'),'9,007,199,254,740,993.000000000000000001');
  assert.equal(formatWei('1'),'0.000000000000000001');
  assert.equal(formatWei('-1'),'−0.000000000000000001');
  assert.equal(formatWei('1000000000000000000'),'1');
  assert.equal(formatWei('0'),'0');
  assert.equal(formatWei('1000000000000000001','fr'),'1,000000000000000001');
  assert.equal(formatWei(undefined),'—');assert.equal(formatWei('not-wei'),'—');
});

test('rounded chain amounts never claim a nonzero fee or holding is zero', () => {
  assert.equal(formatChainAmount('24003533088', 18, 'en', 7), '< 0.0000001');
  assert.equal(formatChainAmount('1', 18, 'fr', 5), '< 0,00001');
  assert.equal(formatChainAmount('-1', 18, 'en', 5), '> −0.00001');
  assert.equal(formatChainAmount('0', 18, 'en', 7), '0');
  assert.equal(formatChainAmount('100000000000', 18, 'en', 7), '0.0000001');
  assert.equal(formatChainAmount('9007199254740993123456789000000000', 18, 'en', 6), '9,007,199,254,740,993.123457');
  assert.equal(formatChainAmount('1999999999999999999', 18, 'en', 5), '2');
  assert.equal(formatChainAmount('123456789', 6, 'fr', 4), '123,4568');
  assert.equal(formatChainAmount('9007199254740993', 0), '9,007,199,254,740,993');
  assert.equal(formatChainAmount('1', 18, 'ar-u-nu-arab', 5), '< ٠٫٠٠٠٠١');
});

test('amount formatting preserves locale digits after repeated calls and language changes', () => {
  const cases = [
    ['en-US', '1,234.56789'],
    ['fr', '1\u202f234,56789'],
    ['ar-u-nu-arab', '١٬٢٣٤٫٥٦٧٨٩'],
  ];
  for (const [locale, expected] of [...cases, ...cases.slice().reverse()]) {
    assert.equal(formatChainAmount('1234567890', 6, locale), expected);
    assert.equal(formatChainAmount('1234567890', 6, locale), expected);
    assert.equal(formatChainAmount('1234567890', 6, 'invalid_locale'), '—');
    assert.equal(formatChainAmount('1234567890', 6, locale), expected);
  }
});

test('chain amount metadata and base units must be valid before scaling', () => {
  for (const decimals of [null, undefined, '', -1, 1.5, 256, 'invalid']) assert.equal(formatChainAmount('1', decimals), '—');
  for (const value of [null, undefined, '', ' ', '1.5', '1e18', 'invalid', Number.MAX_SAFE_INTEGER + 1]) assert.equal(formatChainAmount(value, 18), '—');
  assert.equal(formatChainAmount('1', '18'), '0.000000000000000001');
  assert.equal(formatChainAmount(1n, 255), `0.${'0'.repeat(254)}1`);
});

test('indexed blocks enrich live rows without retaining duplicate or reorged heights', () => {
  const live = { height: 103, hash: 'head', _live: true, transaction_fees: null };
  const current = [live, { height: 102, hash: 'same', _live: true, transaction_fees: null }, { height: 101, hash: 'reorged' }];
  const indexed = [{ height: 102, hash: 'same', transaction_fees: '24003533088' }, { height: 101, hash: 'canonical' }];
  assert.deepEqual(mergeIndexedBlocks(current, indexed), [live, ...indexed]);
  assert.equal(current[1]._live, true);
  assert.deepEqual(mergeIndexedBlocks([], indexed), indexed);
});
