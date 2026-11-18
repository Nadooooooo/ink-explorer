import test from 'node:test';import assert from 'node:assert/strict';import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context)}catch(error){if(specifier.startsWith('.')&&!/\.[a-z]+$/.test(specifier))return next(specifier+'.ts',context);throw error;}}});
const {readTransferFilters,transferValidation,transferRequest,transferFilterUrl,normalizeTransfers}=await import('../src/transfer-directory.ts');
const {tokenFiatValue,tokenUsd}=await import('../src/token-data.ts');
test('transfer criteria restore legacy URLs, retain invalid inputs for correction and reset empty relations',()=>{
 const {filters}=readTransferFilters('?type=ERC-404&methods=bad&address_relation=or&lang=fr');assert.equal(filters.transaction_types,'ERC-404');assert.equal(filters.address_relation,undefined);assert.equal(transferValidation(filters).field,'methods');
 assert.equal(transferValidation({transaction_types:'COIN_TRANSFER'}).field,'transaction_types');assert.equal(transferValidation({transaction_types:'ERC-404'}),null);
 assert.equal(transferValidation({age_from:'garbage'}).field,'age_from');
 const url=transferFilterUrl(new URL('https://example.test/testnet/token-transfers?lang=fr&type=ERC-20&methods=old'),{transaction_types:'ERC-1155'});assert.equal(url,'/testnet/token-transfers?lang=fr&type=ERC-1155');
});
test('opaque transfer cursors keep null and zero fields while applied criteria remain authoritative',()=>{
 const filters={transaction_types:'ERC-20',methods:'0xA9059CBB',from_address_hashes_to_include:'0x'+'a'.repeat(40),to_address_hashes_to_include:'0x'+'b'.repeat(40)};
 const request=transferRequest(filters,'?internal_transaction_index=null&token_transfer_index=0&methods=wrong&type=ERC-721');const query=new URL('https://example.test'+request).searchParams;
 assert(request.startsWith('/explorer/advanced-filters?'));assert.equal(query.get('internal_transaction_index'),'null');assert.equal(query.get('token_transfer_index'),'0');assert.equal(query.get('methods'),'0xa9059cbb');assert.equal(query.get('transaction_types'),'ERC-20');assert.equal(query.get('type'),null);assert.equal(query.get('address_relation'),'and');
 assert.equal(transferRequest({transaction_types:'ERC-404'}),'/explorer/token-transfers?type=ERC-404');
});
test('advanced transfer records preserve zero indexes and reject mismatched or malformed identities',()=>{
 const item={hash:'0x'+'a'.repeat(64),token:{address_hash:'0x'+'b'.repeat(40),type:'ERC-20'},token_transfer_index:0};
 const d=normalizeTransfers({items:[item],next_page_params:{internal_transaction_index:null,token_transfer_index:0}},'ERC-20');assert.equal(d.items[0].transaction_hash,item.hash);assert.equal(d.items[0].log_index,0);assert(d.next.includes('=null'));
 for(const malformed of [null,{}, {items:[null]}, {items:['bad']}, {items:[[]]}])assert.throws(()=>normalizeTransfers(malformed),/invalidApiResponse/);
 assert.throws(()=>normalizeTransfers({items:[item]},'ERC-721'));assert.throws(()=>normalizeTransfers({items:[{...item,hash:'invalid'}]}));
});
test('transfer USD values retain nonzero fractions, reject unknown quotes and avoid intermediate overflow',()=>{
 assert.equal(tokenFiatValue('1','18','2500'),2.5e-15);assert.equal(tokenUsd(tokenFiatValue('1','18','2500'),'en'),'< $0.01');assert.equal(tokenFiatValue('0',18,'2500'),0);assert.equal(tokenFiatValue('1',18,null),undefined);assert.equal(tokenFiatValue('1',255,'1e-100'),undefined);assert.equal(tokenFiatValue('1'+'0'.repeat(320),255,'1'),1e65);
});
