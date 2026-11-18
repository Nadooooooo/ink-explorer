import test from 'node:test';
import assert from 'node:assert/strict';
import {validPoolPath} from '../server/pool-path.mjs';
import {validPoolMarket,poolContractAddress} from '../src/pool-identity.ts';
import {publicApiPath,allowedPublicMethod} from '../server/public-proxy.mjs';
const address='0x'+'1'.repeat(40),other='0x'+'2'.repeat(40),id='0x'+'a'.repeat(64);

test('pool paths accept contract addresses and bytes32 pool IDs without widening address probes',()=>{
 for(const path of ['pools','pools/'+address,'pools/'+address+'/check','pools/'+id])assert(validPoolPath(path),path);
 for(const path of ['pools/'+id+'/check','pools/not-an-address','pools/0x'+'a'.repeat(41),'pools/0x'+'a'.repeat(63),'pools/'+id+'/transactions','pools/../health'])assert.equal(validPoolPath(path),false,path);
 for(const prefix of ['', '/testnet']){const path=prefix+'/api/contract-info/pools/'+id;assert.equal(publicApiPath(path),path);assert(allowedPublicMethod(path,'GET'));assert.equal(allowedPublicMethod(path,'POST'),false);}
});
test('market payloads retain exact pool and network identity',()=>{
 assert(validPoolMarket({pool_id:id,chain_id:'57073'},id,57073));
 assert(validPoolMarket({pool_id:address,chain_id:'763373'},address,763373));
 for(const pool of [null,{}, {pool_id:other,chain_id:57073},{pool_id:id,chain_id:763373}])assert.equal(validPoolMarket(pool,id,57073),false);
});
test('singleton pool IDs are never used as address endpoints or contract-specific activity',()=>{
 assert.equal(poolContractAddress({pool_id:address,contract_address:address,is_contract:true},address),address);
 assert.equal(poolContractAddress({pool_id:address,is_contract:true},address),address);
 assert.equal(poolContractAddress({pool_id:address,contract_address:other,is_contract:true},address),undefined);
 assert.equal(poolContractAddress({pool_id:address,contract_address:address,is_contract:false},address),undefined);
 assert.equal(poolContractAddress({pool_id:id,contract_address:id,is_contract:false},id),undefined);
 assert.equal(poolContractAddress({pool_id:id,contract_address:address,is_contract:true},id),undefined,'A manager contract does not make its totals pool-specific');
});
