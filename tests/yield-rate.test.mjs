import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const html=fs.readFileSync(path.join(here,'..','index.html'),'utf8');

function declaration(name){
  const start=html.indexOf(`function ${name}(`);
  assert.notEqual(start,-1,`missing function ${name}`);
  const next=html.indexOf('\nfunction ',start+10);
  return html.slice(start,next<0?html.length:next);
}

const fields={
  rate:{value:'8'},
  frequency:{value:'none'}
};
const toasts=[];
const context={
  Math,
  Number,
  parseFloat,
  parseInt,
  document:{getElementById(id){return fields[id]||null;}},
  showToast(message,error){toasts.push({message,error});},
  t(key){return key;}
};
vm.createContext(context);
vm.runInContext([
  declaration('effectivePeriodicPct'),
  declaration('divQuick')
].join('\n'),context);

const cases=[
  {periods:365,expected:0.021087439837685906},
  {periods:12,expected:0.643403011000343},
  {periods:4,expected:1.94265469082735},
  {periods:2,expected:3.9230484541326494},
  {periods:1,expected:8}
];

for(const {periods,expected} of cases){
  const periodic=context.effectivePeriodicPct(8,periods);
  assert.ok(Math.abs(periodic-expected)<1e-12,`wrong ${periods}-period conversion`);
  const roundTrip=(Math.pow(1+periodic/100,periods)-1)*100;
  assert.ok(Math.abs(roundTrip-8)<1e-10,`APY round-trip failed for ${periods}`);
}

const daily=context.effectivePeriodicPct(8,365);
assert.ok(Math.abs(daily-(8/365))>0.0008,'daily conversion must not use nominal division');

context.divQuick('rate',365,'frequency','day');
assert.equal(fields.rate.value,0.0210874398);
assert.equal(fields.frequency.value,'day');
assert.deepEqual(toasts,[]);

fields.rate.value='';
context.divQuick('rate',12,'frequency','month');
assert.equal(fields.frequency.value,'day','invalid input must not change frequency');
assert.deepEqual(toasts,[{message:'yieldrateerr',error:1}]);

assert.doesNotMatch(html,/onclick="divQuick\('[^']+',365\)"/);
assert.doesNotMatch(html,/>÷(?:365|12|4)</);
assert.match(html,/data-i="apyday"/);
assert.match(html,/data-i="apyhalf"/);
assert.match(html,/data-i="apyyear"/);
assert.match(html,/uses a 365-day year and the compound formula/);

console.log('Effective APY-to-period yield conversion tests passed.');
