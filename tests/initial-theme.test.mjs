import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=html.match(/<script id="initial-theme">([\s\S]*?)<\/script>/)[1];
function paint(store,hour=21,blocked=false){
  const root={dataset:{},style:{}},meta={};
  vm.runInNewContext(script,{localStorage:{getItem(key){if(blocked)throw Error('blocked');return store[key]||null;},setItem(){throw Error('must not write ledger');}},Date:class{getHours(){return hour;}},document:{documentElement:root,querySelector(){return meta;}}});
  return {mode:root.dataset.initialTheme,bg:root.style.background,scheme:root.style.colorScheme,meta:meta.content};
}
test('saved dark theme is ready before blocking resources even during daytime',()=>{
  assert.deepEqual(paint({fos8:JSON.stringify({theme:'dark'})},12),{mode:'dark',bg:'#0F6E56',scheme:'dark',meta:'#0F6E56'});
  assert.ok(html.indexOf('id="initial-theme"')<html.indexOf('cdn.jsdelivr.net'));
});
test('active profile preference wins over default ledger and clock',()=>{
  const p=paint({fos_profiles:JSON.stringify({active:'second'}),fos8:JSON.stringify({theme:'dark'}),fos8_p_second:JSON.stringify({theme:'light'})});
  assert.equal(p.mode,'light');assert.equal(p.bg,'#1D9E75');
});
test('auto first paint keeps existing 06:00 and 16:00 boundaries',()=>{
  for(const [hour,expected] of [[5,'dark'],[6,'light'],[15,'light'],[16,'dark']])assert.equal(paint({},hour).mode,expected);
});
test('blocked or malformed storage uses clock without writes or crash',()=>{
  assert.equal(paint({},21,true).mode,'dark');assert.equal(paint({fos_profiles:'broken'},12).mode,'light');
});
