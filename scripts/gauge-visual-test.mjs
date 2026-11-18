import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';

// Exercise the production component through live frames, then inspect painted SVG
// bounds (including stroke), rather than relying on page overflow alone.
const base = process.env.BASE_URL || 'http://127.0.0.1:4310';
const output = process.env.GAUGE_OUTPUT || 'reports/gauge/local';
const publicLive = process.env.PUBLIC_LIVE === '1';
const touch = process.env.GAUGE_TOUCH === '1';
const widths = (process.env.GAUGE_WIDTHS || '320,390,768,1440').split(',').map(Number);
const results = [];
await mkdir(output, { recursive: true });

function inspectGauge(svg) {
  const viewBox = svg.viewBox.baseVal;
  const inverse = svg.getScreenCTM().inverse();
  const project = (node, point) => new DOMPoint(point.x, point.y).matrixTransform(inverse.multiply(node.getScreenCTM()));
  const shapes = [...svg.querySelectorAll('path,circle')].map(node => {
    const box = node.getBBox(), style = getComputedStyle(node);
    const halfStroke = style.stroke === 'none' ? 0 : parseFloat(style.strokeWidth) / 2;
    const corners = [
      [box.x - halfStroke, box.y - halfStroke], [box.x + box.width + halfStroke, box.y - halfStroke],
      [box.x - halfStroke, box.y + box.height + halfStroke], [box.x + box.width + halfStroke, box.y + box.height + halfStroke],
    ].map(([x, y]) => project(node, {x, y}));
    return { name: node.getAttribute('class') || node.tagName, left: Math.min(...corners.map(p => p.x)),
      top: Math.min(...corners.map(p => p.y)), right: Math.max(...corners.map(p => p.x)), bottom: Math.max(...corners.map(p => p.y)) };
  });
  const needle = svg.querySelector('.gauge-needle'), arc = svg.querySelector('.gauge-value');
  let alignment = null;
  if (needle && arc) {
    const pivot = project(needle, needle.getPointAtLength(0));
    const tip = project(needle, needle.getPointAtLength(needle.getTotalLength()));
    const fraction = Number(arc.getAttribute('stroke-dasharray').split(' ')[0]) / 100;
    const target = project(arc, arc.getPointAtLength(arc.getTotalLength() * fraction));
    const a = {x: tip.x - pivot.x, y: tip.y - pivot.y}, b = {x: target.x - pivot.x, y: target.y - pivot.y};
    alignment = (a.x * b.x + a.y * b.y) / (Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y));
  }
  const card = svg.closest('.utilization-metric');
  const rect = node => {const r = node.getBoundingClientRect(); return {left:r.left, top:r.top, right:r.right, bottom:r.bottom};};
  const text = document.createRange(); text.selectNodeContents(card.querySelector('strong'));
  const start = new DOMPoint(Math.min(...shapes.map(s=>s.left)),Math.min(...shapes.map(s=>s.top))).matrixTransform(svg.getScreenCTM());
  const end = new DOMPoint(Math.max(...shapes.map(s=>s.right)),Math.max(...shapes.map(s=>s.bottom))).matrixTransform(svg.getScreenCTM());
  return {viewBox:{x:viewBox.x, y:viewBox.y, width:viewBox.width, height:viewBox.height}, shapes, alignment,
    gauge:rect(svg), card:rect(card), label:rect(card.querySelector('div > span:first-child')),
    value:rect(text),painting:{left:start.x,top:start.y,right:end.x,bottom:end.y},
    displayed:card.querySelector('strong').textContent,
    overflow:document.documentElement.scrollWidth > innerWidth + 1};
}

for (const [engine, launcher] of Object.entries({chromium, firefox, webkit})) {
  const browser = await launcher.launch(engine === 'chromium' ? {args:['--no-sandbox']} : {});
  try {
    for (const theme of ['light', 'dark']) for (const prefix of ['', '/testnet']) {
      const lang = prefix ? 'ar' : 'fr';
      const context = await browser.newContext({viewport:{width:widths[0],height:1000},hasTouch:touch,colorScheme:theme,reducedMotion:'reduce'});
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.setDefaultTimeout(20000);
      let socket, sequence = 1, value = null;
      const chainId = prefix ? 763373 : 57073;
      const frame = () => ({type:'snapshot',protocol:'ink-observer.live.v1',sequence:sequence++,sentAt:new Date().toISOString(),
        network:{chainId,expectedChainId:chainId,online:true,synced:true,head:90000000,stale:false},
        utilization:{percentage:value},blocks:[],transactions:[]});
      if (!publicLive) {
        const socketUrl = base.replace(/^http/, 'ws') + prefix + '/api/live';
        await context.route(`**${prefix}/api/live/config`, route => route.fulfill({json:{url:socketUrl}}));
        await context.route(`**${prefix}/api/live/snapshot`, route => route.fulfill({json:frame()}));
        await page.routeWebSocket(socketUrl, ws => {socket = ws; ws.send(JSON.stringify(frame()));});
      }
      try {
        await page.goto(base + prefix + '/?lang=' + lang, {waitUntil:'domcontentloaded'});
        await page.locator('.utilization-gauge').waitFor();
        if (publicLive) await page.locator('.gauge-needle').waitFor();
        else {
          // The HTTP snapshot may render the gauge before the live configuration
          // request opens the socket. Wait for the actual transport under test.
          for(let attempt=0;!socket&&attempt<100;attempt++)await page.waitForTimeout(100);
          assert.ok(socket, 'Live test socket must be connected');
        }
        for (const width of widths) {
          await page.setViewportSize({width,height:1000});
          const row = {engine,theme,prefix,lang,width,touch,passed:false,states:[]};
          try {
            for (const next of publicLive ? ['live'] : [null, 0, 5, 50, 88.88, 99.99, 100, 110, -10]) {
              if (!publicLive) {
                value = next; socket.send(JSON.stringify(frame()));
                await page.waitForFunction(expected => {
                  const arc = document.querySelector('.gauge-value');
                  return expected === null ? !arc : arc?.getAttribute('stroke-dasharray') === `${Math.max(0,Math.min(100,expected))} 100`;
                }, next);
              }
              const measured = await page.locator('.utilization-gauge').evaluate(inspectGauge);
              const vb = measured.viewBox;
              for (const shape of measured.shapes) assert.ok(shape.left >= vb.x - .05 && shape.top >= vb.y - .05
                && shape.right <= vb.x + vb.width + .05 && shape.bottom <= vb.y + vb.height + .05,
                `Clipped painted shape: ${JSON.stringify(shape)}`);
              if (measured.alignment !== null) assert.ok(measured.alignment > .9999, `Needle/arc misalignment: ${measured.alignment}`);
              const {gauge,card,label} = measured;
              assert.ok(gauge.left >= card.left && gauge.right <= card.right && gauge.top >= card.top && gauge.bottom <= card.bottom, 'Gauge clipped by card');
              assert.ok(Math.min(gauge.right,label.right) - Math.max(gauge.left,label.left) <= 1, 'Gauge overlaps label');
              const {value:valueBounds,painting} = measured;
              assert.ok(Math.min(painting.right,valueBounds.right)-Math.max(painting.left,valueBounds.left)<=1 || Math.min(painting.bottom,valueBounds.bottom)-Math.max(painting.top,valueBounds.top)<=1,'Gauge overlaps utilization value');
              assert.equal(measured.overflow,false,'Page overflow');
              row.states.push({value:next,...measured});
              if (next === 5 || publicLive) {
                await page.locator('.utilization-metric').screenshot({path:`${output}/${engine}-${width}-${theme}-${prefix?'testnet':'mainnet'}.png`});
              }
            }
            await page.locator('.utilization-metric .info-button').click();
            const info = await page.locator('.info-floating').boundingBox();
            assert.ok(info && info.x >= 0 && info.x + info.width <= width + 1, 'Info popover clipped');
            await page.keyboard.press('Escape');
            assert.deepEqual(errors,[]);
            row.passed = true;
          } catch (error) {row.error = error.message;}
          results.push(row);
          console.log(JSON.stringify({engine,theme,prefix,width,passed:row.passed,error:row.error}));
          await writeFile(output + '/results.json', JSON.stringify({base,publicLive,complete:false,results},null,2));
        }
      } finally {await context.close();}
    }
  } finally {await browser.close();}
}
await writeFile(output + '/results.json', JSON.stringify({base,publicLive,complete:true,passed:results.every(row => row.passed),results},null,2));
if (results.some(row => !row.passed)) process.exitCode = 1;
