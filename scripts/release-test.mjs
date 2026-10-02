import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Every suite runs even after a failure. A timeout or filtered run can never
// certify a release. Process groups keep timed-out browser children contained.
const suites = [
  ['check',['run','check'],120], ['build',['run','build'],120], ['dependencies',['audit','--include=dev','--audit-level=high'],120],
  ['data',['run','test:data'],120], ['node-readiness',['run','test:node-readiness'],120],
  ['upstream-cache',['run','test:upstream-cache'],120], ['security',['run','test:security'],120], ['integrity',['run','test:integrity'],180],
  ['activity',['run','test:activity'],600],
  ['activity-server',['run','test:activity-server'],120], ['activity-live',['run','test:activity-live'],480],
  ['contracts',['run','test:contracts'],300], ['ui',['run','test:ui'],900],
  ['a11y',['run','test:a11y'],300], ['i18n',['run','test:i18n'],300],
  ['assets',['run','test:assets'],180], ['charts',['run','test:charts'],300],
  ['identicons',['run','test:identicons'],180], ['content',['run','test:content'],300],
  ['address-loading',['run','test:address-loading'],180], ['loading',['run','test:loading'],180], ['performance',['run','test:performance'],180],
  ['layout',['run','test:layout'],1200], ['responsive',['run','test:responsive'],900],
  ['mobile',['run','test:mobile'],900], ['style',['run','test:style'],900],
  ['space',['run','test:space'],300], ['networks',['run','test:networks'],1800],
  ['ws',['run','test:ws'],30], ['network-live',['run','test:network-live'],60],
  ['node-testnet',['run','test:node-testnet'],60], ['chain-reconciliation',['run','test:chain-reconciliation'],180],
  ['lighthouse',['run','test:lighthouse'],1200],
];
const selected = process.env.RELEASE_SUITES?.split(',');
if (selected?.some(name=>!suites.some(([suite])=>name===suite)))throw new Error('Unknown RELEASE_SUITES entry');
const restricted = ['BROWSERS','NETWORK_ROUTES','MOBILE_BROWSERS','MOBILE_WIDTHS','MOBILE_INTERACTIONS','CHART_BROWSERS','LAYOUT_ROUTES','LAYOUT_WIDTHS','STYLE_WIDTHS','LIGHTHOUSE_ROUTES','LIGHTHOUSE_PROFILES'].filter(key=>process.env[key]);
const output=process.env.RELEASE_DIR || `reports/release-${new Date().toISOString().replace(/[:.]/g,'-')}`;
await mkdir(output,{recursive:true});
async function filesIn(directory) {
  const entries = await readdir(directory, {withFileTypes:true});
  return (await Promise.all(entries.map(entry=>entry.isDirectory()?filesIn(`${directory}/${entry.name}`):[`${directory}/${entry.name}`]))).flat();
}
const hashes=async()=>{
  // Enumerate again at the end so additions and deletions also invalidate a run.
  const sourceFiles=[...(await Promise.all(['src','server','scripts'].map(filesIn))).flat(),'package.json','package-lock.json','vite.config.ts','index.html'].sort();
  return Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
};
const report={startedAt:new Date().toISOString(),baseUrl:process.env.BASE_URL || 'http://127.0.0.1:4188',fullRun:!selected && !restricted.length,restrictions:restricted,source:await hashes(),results:[],passed:false};
const persist=()=>writeFile(`${output}/results.json`,JSON.stringify(report,null,2));
await persist();
for(const [name,args,seconds] of suites.filter(([name])=>!selected||selected.includes(name))){
  console.log(`START ${name}`);
  const started=Date.now();let log='',timedOut=false;
  const child=spawn('npm',args,{detached:true,env:{...process.env,WS_URL:process.env.WS_URL || `${report.baseUrl.replace(/^http/,'ws')}/api/live`,MOBILE_BROWSERS:process.env.MOBILE_BROWSERS || 'chromium,firefox,webkit',CHART_BROWSERS:process.env.CHART_BROWSERS || 'chromium,firefox,webkit'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',data=>log+=data);child.stderr.on('data',data=>log+=data);
  const kill=()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}};
  const timer=setTimeout(()=>{timedOut=true;kill();},seconds*1000);
  const code=await new Promise(resolve=>{child.once('error',error=>{log+=error.stack;resolve(-1);});child.once('close',code=>resolve(code));});
  clearTimeout(timer);kill();
  await writeFile(`${output}/${name}.log`,log);
  const result={name,code,timedOut,seconds:(Date.now()-started)/1000,passed:code===0&&!timedOut};
  if(name==='build' && result.passed) {
    try {
      const html=await readFile('dist/index.html','utf8');
      const assets=[...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map(match=>match[1]))];
      if(!assets.length)throw new Error('Built entry assets are missing');
      result.servedAssets=[];
      for(const asset of assets) {
        const response=await fetch(report.baseUrl+asset,{signal:AbortSignal.timeout(15000)});
        const expected=createHash('sha256').update(await readFile(`dist${asset}`)).digest('hex');
        const actual=createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
        result.servedAssets.push({asset,matches:response.ok&&expected===actual});
      }
      if(result.servedAssets.some(asset=>!asset.matches))result.passed=false;
    } catch(error) {result.passed=false;result.buildError=error.message;}
  }
  if(name==='lighthouse' && result.passed) {
    try {
      const audits=JSON.parse(await readFile(`${process.env.LIGHTHOUSE_DIR || 'reports/lighthouse'}/summary.json`,'utf8'));
      const minimums={performance:90,accessibility:95,'best-practices':95,seo:95};
      result.scoreFailures=audits.flatMap(audit=>Object.entries(minimums).filter(([category,minimum])=>!(audit.scores[category]>=minimum)).map(([category,minimum])=>({route:audit.route,profile:audit.profile,category,score:audit.scores[category],minimum})));
      if(audits.length!==12 || result.scoreFailures.length)result.passed=false;
    } catch(error) {result.passed=false;result.auditError=error.message;}
  }
  report.results.push(result);await persist();
  console.log(`${result.passed?'PASS':'FAIL'} ${name} (${result.seconds}s)${result.passed?'':'\n'+log.slice(-5000)}`);
}
report.finishedAt=new Date().toISOString();
report.sourceUnchanged=JSON.stringify(await hashes())===JSON.stringify(report.source);
report.passed=report.fullRun && report.sourceUnchanged && report.results.every(result=>result.passed);
await persist();
console.log(`Release ${report.passed?'PASSED':'NOT CERTIFIED'}: ${report.results.filter(r=>r.passed).length}/${report.results.length}. Report: ${output}/results.json`);
process.exitCode=report.passed?0:1;
