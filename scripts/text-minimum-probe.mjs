import {firefox} from 'playwright';
for(const size of [0,24]){
 const b=await firefox.launch({firefoxUserPrefs:{'font.minimum-size.x-western':size}}),p=await b.newPage();
 await p.setContent('<span style="font:12px sans-serif">Readable address labels</span>');
 console.log(size,await p.locator('span').evaluate(e=>({css:getComputedStyle(e).fontSize,height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width})));
 await b.close();
}
