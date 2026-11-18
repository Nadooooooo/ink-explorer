import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
registerHooks({resolve(s,c,next){try{return next(s,c)}catch(error){if(s.startsWith('.')&&!/\.[a-z]+$/.test(s))return next(s+'.ts',c);throw error;}}});
const {message,locales,catalogueKeys}=await import('../src/i18n.ts');
const {statisticsCopy}=await import('../src/statistics-copy.ts');
const sources=JSON.parse(await readFile('reports/stat-copy/sources.json','utf8'));
const keys=new Set(JSON.parse(await readFile('reports/stat-copy/source-keys.json','utf8')));
for(const source of Object.values(sources)){
 for(const counter of source.counters.counters)for(const k of ['title','description'])keys.add(counter[k]);
 for(const section of source.lines.sections){keys.add(section.title);for(const chart of section.charts)for(const k of ['title','description'])keys.add(chart[k]);}
}
const allowed={fr:['Gas','Transactions'],zh:['Gas'],es:['Gas','Tokens'],pt:['Tokens']};
const report={sourceKeys:keys.size,authoredKeys:Object.keys(statisticsCopy.en).length,locales:[],duplicates:[]};
// Catch duplicate keys before Object.fromEntries could silently discard a row.
const source=await readFile('src/statistics-copy.ts','utf8');
const authored=[...source.matchAll(/^\['([^']+)',/gm)].map(match=>match[1]);
assert.equal(authored.length,Object.keys(statisticsCopy.en).length);
assert.equal(new Set(authored).size,authored.length,'Duplicate source phrase');
for(const locale of locales){
 const catalogue=JSON.parse(await readFile(`src/locales/${locale}.json`,'utf8'));
 for(const key of catalogueKeys())assert.equal(catalogue[key],message(locale,key),`${locale}: browser/server catalogue drift: ${key}`);
 for(const key of keys){assert.equal(typeof catalogue[key],'string',`${locale}: missing ${key}`);assert(catalogue[key].trim());if(locale!=='en'&&!allowed[locale]?.includes(key))assert.notEqual(catalogue[key],message('en',key),`${locale}: English fallback: ${key}`);}
 for(const [key,value] of Object.entries(statisticsCopy[locale]))for(const code of ['UTC','EOA','ETH','Gwei','ERC-4337','EIP-7702','L1','L2'])if(key.includes(code))assert(value.includes(code),`${locale}: lost ${code} in ${key}`);
 const lastDay='Number of new transactions within the last 24 hours';assert(message(locale,lastDay).includes('24'));
 assert.notEqual(message(locale,lastDay),message(locale,'Number of deployed contracts today (UTC)'));
 assert.equal(message(locale,'A future upstream definition'), 'A future upstream definition');
 report.locales.push({locale,keys:keys.size,passed:true});
}
report.passed=true;await writeFile('reports/stat-copy/catalogue-validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
