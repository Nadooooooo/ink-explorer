import assert from 'node:assert/strict';
import {test} from 'node:test';
import {defaultPageMetadata,explorerPageMetadata} from '../src/page-metadata.ts';

test('NFT documents identify both token and collection rather than sharing one title',()=>{
  const contract='0x'+'a'.repeat(40),other='0x'+'b'.repeat(40);
  const paths=[`/token/${contract}/instance/0`,`/token/${contract}/instance/207`,`/token/${other}/instance/207`];
  const metadata=paths.map(defaultPageMetadata);
  assert.equal(new Set(metadata.map(m=>m[0])).size,3);
  assert.equal(new Set(metadata.map(m=>m[1])).size,3);
  assert(metadata[0][0].includes('#0'));assert(metadata[1][1].includes(contract));
  for(const locale of ['fr','ar','ja'])for(const basePath of ['','/testnet']){
    const titles=paths.map(path=>explorerPageMetadata(new URL('https://inkexplorer.xyz'+path),{locale,basePath})[0]);
    assert.equal(new Set(titles).size,3);assert(titles[0].includes('#0'));if(basePath)assert(titles.every(title=>title.includes('Ink Sepolia')));
  }
});

test('uint256 NFT identifiers remain lossless in localized document titles',()=>{
  const id=(2n**256n-1n).toString(),path=`/token/0x${'a'.repeat(40)}/instance/${id}`;
  for(const locale of ['en','fr','ar'])assert(explorerPageMetadata(new URL('https://inkexplorer.xyz'+path),{locale})[0].includes(id));
  assert(defaultPageMetadata(path)[1].includes(id));
});

test('statistic and application details identify the validated URL record without inventing a name',()=>{
  for(const [kind,ids] of [['stats',['newAccounts','activeAccounts']],['apps',['bridge','another-app']]]){
    const metadata=ids.map(id=>defaultPageMetadata(`/${kind}/${id}`));
    assert.equal(new Set(metadata.map(value=>value[0])).size,2);
    assert.equal(new Set(metadata.map(value=>value[1])).size,2);
    for(const [index,id] of ids.entries()){
      assert(metadata[index].every(value=>value.includes(id)));
      for(const basePath of['','/testnet']){
        const actual=explorerPageMetadata(new URL(`https://inkexplorer.xyz/${kind}/${id}`),{basePath});
        assert(actual.every(value=>value.includes(id)));
        if(basePath)assert.match(actual[0],/Ink Sepolia/);
      }
    }
  }
  for(const path of ['/apps/'+ 'a'.repeat(161),'/stats/path.extra'])assert.match(defaultPageMetadata(path)[0],/Page not found/);
});
