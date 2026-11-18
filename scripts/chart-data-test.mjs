import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){try{return next(s,c)}catch(error){if(s.startsWith('.')&&!/\.[a-z]+$/.test(s))return next(s+'.ts',c);throw error}}});
const {normalizeChartCatalogue,normalizeChartSeries,chartRequest,chartRequestQuery,additiveCharts}=await import('../src/chart-data.ts');
const info={id:'newTxns',title:'New transactions',description:'Transactions per interval',units:null,resolutions:['DAY','WEEK']};
const catalogue={sections:[{id:'transactions',title:'Transactions',charts:[info]}]};
const daily={metric:'newTxns',resolution:'DAY',from:'2026-10-01',to:'2026-10-18',units:null};
const row=(date,value,extra={})=>({date,value,...extra});
const series=(rows,request=daily,meta=info)=>normalizeChartSeries({chart:rows,info:meta},request);
test('Catalogue retains declared units and resolution; ambiguous or malformed records are rejected',()=>{
 assert.equal(normalizeChartCatalogue(catalogue)[0].charts[0].id,'newTxns');
 const native={...info,id:'newNativeCoinTransfers',title:'Number of ETH transfers',description:'Completed token transfers'};
 const corrected=normalizeChartCatalogue({sections:[{id:'tokens',title:'Tokens',charts:[native]}]})[0].charts[0];
 assert.equal(corrected.description,'Number of ETH transfers completed in each period.');
 assert.equal(native.description,'Completed token transfers');
 assert.deepEqual(normalizeChartCatalogue({sections:[]}),[]);
 for(const value of [null,[],{}, {sections:[null]},{sections:[{...catalogue.sections[0],charts:{}}]},{sections:[catalogue.sections[0],catalogue.sections[0]]},{sections:[{...catalogue.sections[0],charts:[info,info]}]},{sections:[{...catalogue.sections[0],charts:[{...info,id:'../other'}]}]},{sections:[{...catalogue.sections[0],charts:[{...info,resolutions:['NONSENSE']}]}]}])assert.throws(()=>normalizeChartCatalogue(value),/invalidApiResponse/);
});
test('Chart identity, units and declared resolution must agree with the request',()=>{
 assert.equal(series([row('2026-10-16','0')])[0].value,'0');
 for(const meta of [{...info,id:'other'},{...info,units:'ETH'},{...info,resolutions:['WEEK']},false])assert.throws(()=>series([],daily,meta),/invalidApiResponse/);
 for(const value of [null,[],{}, {chart:null},{chart:{}},{chart:[null]}])assert.throws(()=>normalizeChartSeries(value,daily),/invalidApiResponse/);
});
test('Invalid observations remain missing; zero, decimal and large raw values retain their meaning',()=>{
 for(const value of [true,false,'', ' ',{},[],['1'],'0x10','NaN','-1',-1,Infinity,'1e-4000',null,undefined,'1.5'])assert.equal(series([row('2026-10-16',value)])[0].value,null,String(value));
 for(const value of [0,'0','9007199254740993'])assert.equal(series([row('2026-10-16',value)])[0].value,value);
 const fee={...daily,metric:'averageTxnFee',units:'ETH'},meta={...info,id:fee.metric,units:'ETH'};
 assert.equal(series([row('2026-10-16','0.000000000000000001')],fee,meta)[0].value,'0.000000000000000001');
 const ratio={...daily,metric:'txnsSuccessRate'},ratioInfo={...info,id:ratio.metric};
 assert.equal(series([row('2026-10-16','1.1')],ratio,ratioInfo)[0].value,null);
 assert.equal(series([row('2026-10-16','0.95')],ratio,ratioInfo)[0].value,'0.95');
});
test('Dates are real UTC dates; duplicate, overlapping and out-of-window observations never enter totals',()=>{
 for(const rows of [[row('2026-10-16','1'),row('2026-10-16','1')],[row(undefined,'1')],[row('2026-02-30','1')],[row('2026-10-16T00:00:00Z','1')],[row('2026-10-16','1',{date_to:'2026-10-17'})],[row('2026-10-16','1',{date_to:'2026-10-15'})],[row('2026-10-16','1',{is_approximate:'false'})],[row('2026-10-19','1')],[row('2026-09-30','1')]])assert.throws(()=>series(rows),/invalidApiResponse/);
});
test('Internal gaps remain gaps on the UTC cadence, rather than compressed time or invented zeros',()=>{
 const input=[row('2026-10-18','300',{is_approximate:true}),row('2026-10-16','100')],original=JSON.stringify(input);
 const result=series(input);
 assert.equal(JSON.stringify(input),original);
 assert.deepEqual(result.map(x=>[x.date,x.value]),[['2026-10-16','100'],['2026-10-17',null],['2026-10-18','300']]);
 assert(result.at(-1).is_approximate);assert.equal(result[1].date_to,'2026-10-17');
 assert.deepEqual(series([]),[]);
});
test('Whole weekly buckets may intersect date bounds; interval ends and gaps stay explicit',()=>{
 const req={...daily,from:'2026-10-03',resolution:'WEEK'};
 const result=series([row('2026-09-28','100',{date_to:'2026-10-04'}),row('2026-10-12','300',{date_to:'2026-10-18',is_approximate:true})],req);
 assert.deepEqual(result.map(r=>[r.date,r.date_to,r.value]),[['2026-09-28','2026-10-04','100'],['2026-10-05','2026-10-11',null],['2026-10-12','2026-10-18','300']]);
 assert.throws(()=>series([row('2026-10-05','1'),row('2026-10-08','2')],req),/invalidApiResponse/);
});
test('Monthly and yearly cadences respect calendar boundaries and leap years',()=>{
 const m={...info,resolutions:['MONTH','YEAR']};
 assert.deepEqual(series([row('2024-01-01','1'),row('2024-03-01','3')],{metric:'newTxns',resolution:'MONTH'},m).map(x=>x.date_to),['2024-01-31','2024-02-29','2024-03-31']);
 assert.deepEqual(series([row('2024-01-01','1'),row('2026-01-01','3')],{metric:'newTxns',resolution:'YEAR'},m).map(x=>x.date_to),['2024-12-31','2025-12-31','2026-12-31']);
});
test('Only additive interval metrics get totals; requests obey advertised resolution',()=>{
 assert(additiveCharts.has('newAccounts'));assert(!additiveCharts.has('activeAccounts'));assert(!additiveCharts.has('accountsGrowth'));
 const date=new Date('2026-10-18T00:30:00Z');
 assert.deepEqual(chartRequest('newTxns',30,['DAY','WEEK'],date),{metric:'newTxns',resolution:'DAY',from:'2026-09-19',to:'2026-10-18'});
 assert.equal(chartRequest('activeBundlers',365,['DAY'],date).resolution,'DAY');
 assert.equal(chartRequest('newTxns',365,['DAY','WEEK'],date).resolution,'WEEK');
 assert.equal(chartRequestQuery(chartRequest('newTxns',0,['DAY','WEEK'],date)),'?resolution=WEEK');
});
