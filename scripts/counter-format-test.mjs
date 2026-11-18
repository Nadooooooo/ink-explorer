import test from 'node:test';import assert from 'node:assert/strict';
import {formatCounterValue as format,formatCompactGas} from '../src/counter-format.ts';
test('Large overview counts keep meaningful precision',()=>{assert.equal(format('1211478','en'),'1.21M');assert.equal(format('12277484','en'),'12.28M');assert.equal(format('1211478','fr'),'1,21 M');});
test('Fee summaries stay concise without rounding sub-nanounit nonzero fees to zero',()=>{assert.equal(format('0.141701014','en','ETH'),'0.1417');assert.equal(format('0.0000003066','fr','ETH'),'0,000000307');assert.equal(format('0.000000000000000001','en','ETH'),'1E-18');assert.equal(format('0','en','ETH'),'0');assert.equal(format('1000.123456789','en','ETH'),'1,000');});
test('Missing counters do not masquerade as zero',()=>{for(const value of [null,undefined,'',NaN,Infinity,'invalid'])assert.equal(format(value,'en'),'—');assert.equal(format(0,'en'),'0');});
test('Header gas stays concise without turning a nonzero wei price into zero',()=>{
 assert.equal(formatCompactGas('1000903','fr'),'0,001 Gwei');
 assert.equal(formatCompactGas('1234567890','en'),'1.23 Gwei');
 assert.equal(formatCompactGas('1','en'),'0.000000001 Gwei');
 assert.equal(formatCompactGas(0,'en'),'0 Gwei');
 for(const value of [null,undefined,'',NaN,Infinity,-1,'-1','1.5',{},true])assert.equal(formatCompactGas(value,'en'),'N/A');
});
