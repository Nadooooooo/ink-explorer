import test from 'node:test';
import assert from 'node:assert/strict';
import { transferNfts } from '../src/transfer-data.ts';
test('NFT IDs and ERC1155 quantities retain integer precision and zero',()=>{
 const id='900719925474099312345',quantity='900719925474099399999';
 assert.deepEqual(transferNfts({token:{type:'ERC-1155'},total:{token_ids:[id,'0'],values:[quantity,'0']}}).map(({id,quantity})=>({id,quantity})),[{id,quantity},{id:'0',quantity:'0'}]);
 assert.equal(transferNfts({token:{type:'ERC-721'},total:{token_id:'8'}})[0].quantity,'1');
 assert.equal(transferNfts({token:{type:'ERC-1155'},total:{token_id:'8'}})[0].quantity,undefined);
 for(const value of ['../1','-1','1e6',Number.MAX_SAFE_INTEGER+1])assert.equal(transferNfts({total:{token_id:value}}).length,0);
});
test('batch quantities remain paired after invalid IDs and images match their NFT',()=>{
 const item={total:{token_ids:['2','bad','3'],values:['4','999','6'],token_instance:{id:'3',image_url:'https://example.test/3.png'}}};
 const values=transferNfts(item);assert.equal(values[0].quantity,'4');assert.equal(values[1].quantity,'6');assert.equal(values[0].record,undefined);assert.equal(values[1].record.id,'3');
 assert.equal(transferNfts({total:{token_ids:['2','3'],token_instance:{image_url:'ambiguous'}}})[0].record,undefined);
 assert.deepEqual(transferNfts({total:{value:'12'},token:{type:'ERC-20'}}),[]);
});
