/** Page-side rAF polling can stop with JavaScript disabled. Keep the same paint
 * predicate but poll from the test runner, including no-JS and background tabs. */
export async function waitRecordPaint(page,timeout=30000) {
 const started=Date.now();let last;
 while(Date.now()-started<timeout){
  last=await page.evaluate(()=>({
   styles:[...document.querySelectorAll('link[rel="stylesheet"]')].every(link=>link.sheet),
   loaded:[...document.fonts].some(font=>font.status==='loaded'),
   settled:[...document.fonts].every(font=>font.status!=='loading'),
  }));
  if(last.styles&&last.loaded&&last.settled)return last;
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 throw new Error('Record paint did not become ready: '+JSON.stringify(last));
}
