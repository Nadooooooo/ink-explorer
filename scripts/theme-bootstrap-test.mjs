import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {documentHeaders,renderPage} from '../server/page-document.mjs';
import {themeBootstrapHash} from '../server/theme-bootstrap-policy.mjs';
const template=await readFile('dist/index.html','utf8');
const script=await readFile('public/theme.js','utf8');
const digest=s=>'sha256-'+createHash('sha256').update(s).digest('base64');
test('the exact early theme bytes are allowed without permitting arbitrary inline scripts',()=>{
 assert.equal(digest(script),themeBootstrapHash);
 assert.deepEqual(documentHeaders['content-security-policy'].match(/(?:^|; )script-src ([^;]+)/)[1].split(' '),["'self'",`'${themeBootstrapHash}'`]);
 const inline=template.match(/<script data-theme-bootstrap>([\s\S]*?)<\/script>/g);
 assert.equal(inline?.length,1);assert.equal(inline[0],`<script data-theme-bootstrap>${script}</script>`);
 assert.doesNotMatch(template,/<script[^>]+src=["']\/theme.js/);
 assert(template.indexOf('data-theme-bootstrap')<template.indexOf('rel="stylesheet"'));
 assert(template.indexOf('data-theme-bootstrap')<template.indexOf('type="module"'));
});
test('localized, network-scoped and missing documents preserve the approved bootstrap',()=>{
 for(const prefix of['','/testnet'])for(const lang of['en','fr','ar','hi','bn'])for(const path of['/','/blocks','/unknown-fixture']){
  const response=renderPage(template,new URL(path+'?lang='+lang,'https://inkexplorer.xyz'),{origin:'https://inkexplorer.xyz',basePath:prefix});
  const html=response.body.toString(),inline=html.match(/<script data-theme-bootstrap>([\s\S]*?)<\/script>/);
  assert.equal(inline?.[1],script);assert.equal(digest(inline[1]),themeBootstrapHash);assert.equal(response.status,path==='/unknown-fixture'?404:200);
 }
});
