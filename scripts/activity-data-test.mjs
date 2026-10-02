import test from 'node:test';
import assert from 'node:assert/strict';
import {activityFilters,activityQuery,validateActivity,csvText,activityCsvRows,activityState} from '../src/activity-data.ts';
import {activityCopy} from '../src/activity-copy.ts';
const a='0x'+'a'.repeat(40), b='0x'+'b'.repeat(40);
test('Address/date/amount/method filters reject silently ignored or reversed conditions',()=>{
 assert.equal(validateActivity({from_address_hashes_to_include:a,to_address_hashes_to_include:b,methods:'0xa9059cbb',amount_from:'0',amount_to:'9007199254740993'}),'');
 assert.equal(validateActivity({amount_from:'0.000000000000000001',amount_to:'0.000000000000000002'}),'');
 assert.equal(validateActivity({amount_from:'9007199254740993.1',amount_to:'9007199254740993.2'}),'');
 for(const invalid of [{methods:'transfer'},{from_address_hashes_to_include:'0x123'},{amount_from:'1e3'},{amount_from:'-1'},{amount_from:'1.00',amount_to:'1'},{amount_to:'0.0'},{amount_from:'9007199254740993.2',amount_to:'9007199254740993.1'},{age_from:'bad'},{age_from:'2026-02-02',age_to:'2026-02-01'},{transaction_types:'unsupported'}])assert.ok(validateActivity(invalid));
 const f=activityFilters(new URLSearchParams('methods=0xa9059cbb&lang=fr&evil=1'));
 assert.deepEqual(f,{methods:'0xa9059cbb'});
 const q=new URLSearchParams(activityQuery({from_address_hashes_to_include:a,to_address_hashes_to_include:b},{index:0,internal_transaction_index:null}));
 assert.equal(q.get('address_relation'),'and');assert.equal(q.get('index'),'0');assert.equal(q.get('internal_transaction_index'),'null');
 assert.equal(new URLSearchParams(activityQuery({methods:'0xA9059CBB',amount_from:'0.000000000000000001'})).get('methods'),'0xa9059cbb');
});
test('Activity status distinguishes indexer delay, pending, success and revert reasons',()=>{
 assert.equal(activityState({status:'awaiting_internal_transactions',block_number:1}),'confirmed');
 assert.equal(activityState({status:'success',block_number:1}),'success');
 assert.equal(activityState({status:'execution reverted',block_number:1}),'failed');
 assert.equal(activityState({status:'pending',block_number:null}),'pending');
});
test('CSV keeps raw large amounts and defuses executable names, quotes and newlines',()=>{
 const csv=csvText(['name','amount'],[['=SUM(1,2)','900719925474099312345'],['  @command','0'],['a"b\nc',null]]);
 assert.ok(csv.startsWith('\ufeff'));assert.ok(csv.includes('"\'=SUM(1,2)"'));assert.ok(csv.includes('"\'  @command"'));assert.ok(csv.includes('"900719925474099312345"'));assert.ok(csv.includes('"a""b\nc"'));
 assert.equal(activityCsvRows([{hash:'h',total:{value:'900719925474099312345',decimals:'6'},token:{symbol:'TEST'},fee:'0'}])[0][8],'900719925474099312345');
});
test('Every new activity label and validation message exists in all ten languages',()=>{
 const expected=Object.keys(activityCopy.en).sort();assert.equal(Object.keys(activityCopy).length,10);
 for(const [locale,copy] of Object.entries(activityCopy)){assert.deepEqual(Object.keys(copy).sort(),expected,locale);assert.ok(Object.values(copy).every(value=>typeof value==='string'&&value.length>0),locale);}
});
