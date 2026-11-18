export function chartScale(values:readonly number[]) {
  const finite=values.filter(Number.isFinite);
  if(!finite.length)return {min:0,max:1,ticks:[0,.5,1]};
  let min=Math.min(...finite),max=Math.max(...finite);
  if(min===max){const padding=max===0?1:Math.abs(max)*.1||Number.MIN_VALUE;min=Math.max(0,min-padding);max=Number.isFinite(max+padding)?max+padding:max;}
  const rough=(max-min)/4||Number.MIN_VALUE, power=10**Math.floor(Math.log10(rough))||Number.MIN_VALUE;
  const step=([1,2,5,10].find(factor=>factor*power>=rough)||10)*power;
  const lower=Math.floor(min/step)*step,roundedUpper=Math.ceil(max/step)*step;
  const upper=Number.isFinite(roundedUpper)?roundedUpper:max;
  const ticks=Array.from({length:Math.floor((upper-lower)/step)+1},(_,index)=>lower+index*step);
  if(ticks.at(-1)!<upper && upper-ticks.at(-1)!>step*1e-9)ticks.push(upper);
  return {min:lower,max:upper,ticks};
}

export function chartTickLabels(ticks:readonly number[],locale:string,multiplier=1) {
  const values=ticks.map(value=>value*multiplier),max=Math.max(...values.map(Math.abs));
  const notation=max>0 && (max<.001||max>=1e6)?'scientific':'standard';
  // A narrow range around a large number must not produce identical labels.
  for(let precision=3;precision<=17;precision++){
    const formatter=new Intl.NumberFormat(locale,{notation,maximumSignificantDigits:precision});
    const labels=values.map(value=>value===0?new Intl.NumberFormat(locale).format(0):formatter.format(value));
    if(new Set(labels).size===new Set(values).size)return labels;
  }
  return values.map(String);
}
