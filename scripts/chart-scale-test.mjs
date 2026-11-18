import test from 'node:test';
import assert from 'node:assert/strict';
import {chartScale,chartTickLabels} from '../src/chart-scale.ts';

test('A visible finite scale contains every observation, including constant and extreme values',()=>{
  for(const values of [[641,653,1791],[0,0],[.01,.06,NaN],[1e-18,3e-18],[1e15,1e15+1],[Number.MIN_VALUE,Number.MIN_VALUE],[Number.MAX_VALUE,Number.MAX_VALUE]]){
    const scale=chartScale(values);
    assert(Number.isFinite(scale.min) && Number.isFinite(scale.max) && scale.max>scale.min);
    assert(values.filter(Number.isFinite).every(value=>value>=scale.min && value<=scale.max));
    assert(scale.ticks.length>=2 && scale.ticks.length<=7);
    assert(scale.ticks.every((value,index)=>Number.isFinite(value) && value>=scale.min && value<=scale.max && (!index || value>scale.ticks[index-1])));
  }
});
test('Axis labels remain distinct, localized and scaled to percentage units',()=>{
  for(const locale of ['en','fr','ar','bn'])for(const values of [[500,1000,1500,2000],[1e-18,2e-18,3e-18],[1e15,1e15+.5,1e15+1]]){
    const labels=chartTickLabels(values,locale);
    assert.equal(new Set(labels).size,values.length);
    assert(labels.every(label=>label.length>0));
  }
  assert.deepEqual(chartTickLabels([0,.25,.5],'en',100),['0','25','50']);
  assert.deepEqual(chartTickLabels([.5,1,1.5],'fr'),['0,5','1','1,5']);
  assert.equal(chartTickLabels([0,1e-18,2e-18],'en')[0],'0');
});
