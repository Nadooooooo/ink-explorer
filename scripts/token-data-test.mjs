import test from 'node:test';import assert from 'node:assert/strict';import{readTokenFilters,tokenCursorQuery,tokenListQuery,tokenOnchainCap,tokenUsd,normalizeTokenProfile,normalizeTokenDirectory}from'../src/token-data.ts';
test('token queries keep applied filters across cursors and normalize unsupported URL inputs',()=>{
 const filters=readTokenFilters(new URLSearchParams('type=ERC-404&q=  NFT &sort=holders_count&order=asc'));
 assert.deepEqual(filters,{standard:'ERC-404',search:'NFT',sort:'holders_count',order:'desc'});
 const query=new URLSearchParams(tokenListQuery(filters,'?q=wrong&type=ERC-20&sort=fiat_value&order=desc&value=0&name=A%26B'));
 assert.equal(query.get('value'),'0');assert.equal(query.get('name'),'A&B');assert.equal(query.get('q'),'NFT');assert.equal(query.get('type'),'ERC-404');assert.equal(query.get('sort'),'holders_count');assert.equal(query.get('order'),'desc');
 assert.deepEqual(readTokenFilters(new URLSearchParams('type=garbage&sort=x&order=x')),{standard:'',search:'',sort:'circulating_market_cap',order:'desc'});
 assert.equal(readTokenFilters(new URLSearchParams('q='+'x'.repeat(300))).search.length,256);
});
test('token market values preserve zero and small nonzero amounts and reject malformed source data',()=>{
 assert.equal(tokenUsd('2384.12','en','price'),'$2,384.12');assert.equal(tokenUsd('0.9998','en','price'),'$0.9998');assert.equal(tokenUsd('0.000000001','en','price'),'< $0.00000001');assert.equal(tokenUsd('0.000000019','en','price'),'$0.000000019');
 assert.equal(tokenUsd(0,'en','price'),'$0.00');assert.equal(tokenUsd('0.000004','en','cap'),'< $0.01');assert.equal(tokenUsd('24879454.618','en','cap'),'$24.9M');
 for(const value of [null,undefined,'',true,{},NaN,Infinity,-1,'0x10','1e-400'])assert.equal(tokenUsd(value),'N/A');
 assert.match(tokenUsd('0.000000001','fr','price'),/^< 0,00000001/);
});
test('on-chain cap uses valid network supply and its decimals without intermediate overflow',()=>{
 assert.equal(tokenOnchainCap({exchange_rate:'2',total_supply:'1000000000000000000',decimals:'18'}),2);
 assert.equal(tokenOnchainCap({exchange_rate:'2',total_supply:'0',decimals:'18'}),0);
 const large='1'+'0'.repeat(320);assert.equal(tokenOnchainCap({exchange_rate:'1',total_supply:large,decimals:255}),1e65);
 for(const overrides of [{exchange_rate:null},{decimals:null},{decimals:256},{decimals:1.2},{total_supply:'garbage'},{total_supply:'-1'},{exchange_rate:'-2'}])assert.equal(tokenOnchainCap({exchange_rate:'1',total_supply:'10',decimals:0,...overrides}),undefined);
 assert.equal(tokenOnchainCap({exchange_rate:'1e-100',total_supply:'1',decimals:255}),undefined);
});

test('token pagination preserves null sort fields required by the upstream cursor',()=>{
 const query=new URLSearchParams(tokenCursorQuery({fiat_value:null,market_cap:null,holders_count:0,is_name_null:false,name:'A & B',absent:undefined}));
 assert.equal(query.get('fiat_value'),'null');assert.equal(query.get('market_cap'),'null');assert.equal(query.get('holders_count'),'0');assert.equal(query.get('is_name_null'),'false');assert.equal(query.get('name'),'A & B');assert.equal(query.has('absent'),false);assert.equal(tokenCursorQuery(null),'');
});

test('token profiles reject mismatched identities and keep large and zero totals exact',()=>{
 const address='0x'+'a'.repeat(40),profile={address_hash:address,name:'Token',symbol:'TOK',type:'ERC-20',decimals:'18',total_supply:'9007199254740993123456789',holders_count:'9007199254740993'};
 const value=normalizeTokenProfile(profile,address,57073);
 assert.equal(value.total_supply,profile.total_supply);assert.equal(value.holders_count,profile.holders_count);assert.equal(value.decimals,18);
 const zero=normalizeTokenProfile({...profile,total_supply:0,holders_count:0,decimals:0},address,57073);
 assert.equal(zero.total_supply,'0');assert.equal(zero.holders_count,'0');assert.equal(zero.decimals,0);
 for(const invalid of [null,[],{}, {...profile,address_hash:'0x'+'b'.repeat(40)}, {...profile,chain_id:763373}])assert.throws(()=>normalizeTokenProfile(invalid,address,57073),/invalidApiResponse/);
 assert.equal(normalizeTokenProfile({...profile,chain_id:'57073'},address,57073).name,'Token');
});

test('malformed profile totals and precision never become zero or render untrusted objects',()=>{
 const address='0x'+'a'.repeat(40),profile={address_hash:address};
 for(const invalid of [null,'',false,{},-1,'1.2','0x10',9007199254740992]){
  const value=normalizeTokenProfile({...profile,total_supply:invalid,holders_count:invalid},address,57073);
  assert.equal(value.total_supply,undefined);assert.equal(value.holders_count,undefined);
 }
 for(const decimals of [null,'',false,{},-1,1.2,256,'0x12']){
  const value=normalizeTokenProfile({...profile,decimals,total_supply:'1'},address,57073);
  assert.equal(value.decimals,null);assert.equal(value.total_supply,'1');
 }
 const value=normalizeTokenProfile({...profile,name:{bad:true},symbol:[],type:42},address,57073);
 assert.equal(value.name,undefined);assert.equal(value.symbol,undefined);assert.equal(value.type,undefined);
});

test('ranked token pages reject duplicates and malformed cursors while retaining opaque values',()=>{
 const token={address_hash:'0x'+'a'.repeat(40),holders_count:'9007199254740993'};
 const cursor={fiat_value:null,market_cap:null,holders_count:0,is_name_null:false,name:'A & B'};
 const value=normalizeTokenDirectory({items:[token],next_page_params:cursor},57073);
 assert.equal(value.items[0].holders_count,token.holders_count);assert.deepEqual(value.next_page_params,cursor);
 assert.equal(normalizeTokenDirectory({items:[],next_page_params:{}},57073).next_page_params,null);
 for(const data of [null,[],{}, {items:[null]}, {items:[token,{...token,address_hash:token.address_hash.toUpperCase().replace('0X','0x')}]}, {items:[token],chain_id:763373}, ...[[],false,'cursor',{invalid:{}},{invalid:Infinity}].map(next_page_params=>({items:[token],next_page_params}))])
  assert.throws(()=>normalizeTokenDirectory(data,57073),/invalidApiResponse/);
});
