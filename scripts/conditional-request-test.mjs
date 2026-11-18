import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchesIfNoneMatch} from '../server/conditional-request.mjs';
test('strong, weak, list and wildcard conditions match the same representation',()=>{
  for(const value of ['"abc"','W/"abc"','*','"other", W/"abc"','W/"other", "abc"',' "other,quoted",\tW/"abc" '])
    for(const etag of ['"abc"','W/"abc"'])assert.equal(matchesIfNoneMatch(value,etag),true,value);
});
test('another representation and malformed conditions never match',()=>{
  for(const value of [undefined,'','"different"','abc','w/"abc"','"abc",','"abc", *','"abc" garbage','"abc","unterminated','"bad space", "abc"','"abc", "bad\nvalue"'])
    assert.equal(matchesIfNoneMatch(value,'"abc"'),false,String(value));
  assert.equal(matchesIfNoneMatch('*',undefined),false);
});
