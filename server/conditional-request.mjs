// GET/HEAD If-None-Match uses weak comparison, including when a CDN
// compresses the representation and prefixes the origin tag with W/.
export function matchesIfNoneMatch(value, etag) {
  if (typeof value !== 'string' || typeof etag !== 'string') return false;
  const input=value.trim(), expected=etag.replace(/^W\//,'');
  if(input==='*')return true;
  let offset=0, matched=false;
  const space=()=>{while(input[offset]===' '||input[offset]==='\t')offset++;};
  while(offset<input.length){
    space();
    if(input.startsWith('W/',offset))offset+=2;
    if(input[offset]!== '"')return false;
    const start=offset++;
    while(offset<input.length&&input[offset]!=='"'){
      const code=input.charCodeAt(offset++);
      if(code<0x21||code>0xff)return false;
    }
    if(input[offset]!== '"')return false;
    offset++;
    if(input.slice(start,offset)===expected)matched=true;
    space();
    if(offset===input.length)return matched;
    if(input[offset++]!==',')return false;
    space();
    if(offset===input.length)return false;
  }
  return false;
}
