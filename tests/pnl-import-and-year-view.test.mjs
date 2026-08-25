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

assert.match(html,/pnlImports:\[\]/);
assert.match(html,/pnlCalendarSections:\{\}/);
assert.match(html,/pnlCalendarFilters:\[\]/);
assert.match(html,/sheet_to_json\(ws,\{raw:true,defval:'',range:3\}\)/);
assert.match(html,/active:false,kind:kinds\[0\],kinds,rows/);
assert.match(html,/\.pnl-calendar-grid\.year/);
assert.match(html,/\.pnl-cal-month\.sel/);
assert.match(html,/function togglePnlCalendarMonth\(/);
assert.match(html,/pnlCalendarSummaryHtml\(months\.flat\(\),tt\('全年','Full year'\)\)/);
assert.match(html,/2026-08-22/);
assert.match(html,/date:'2026-08-23'.*boundary:true/);
assert.match(html,/function pnlCalendarRecordKind\(/);
assert.match(html,/function pnlCalendarAllowsMoneyPlus\(/);
assert.match(html,/function togglePnlCalendarFilter\(/);
assert.match(html,/function renderPnlCalendarFilters\(/);
assert.match(html,/Array\.isArray\(S\.pnlCalendarFilters\)\?S\.pnlCalendarFilters:\[\]/);
assert.match(html,/p\.exitPrice&&pnlCalendarAllowsMoneyPlus\(p\)/);
assert.match(html,/meta\.polymarket=\['◈','Polymarket'\]/);
assert.match(html,/record&&record\._mpKey/);
assert.match(html,/function pnlHistoricalFxForDate\(/);
assert.match(html,/nativeAmount:fx\?value\/fx\.HKD:value/);

const code=`
${declaration('pnlImportDate')}
${declaration('pnlImportBatchSignature')}
${declaration('pnlEventDisplayValue')}
const S={dispCur:'HKD'};
const FX={USD:7.8,RMB:1.08,JPY:0.052};
function ymd(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function toHKD(n,cur){return cur==='USD'?n*FX.USD:n;}
globalThis.iso=pnlImportDate('2026/08/23 00:00:00');
globalThis.sig1=pnlImportBatchSignature([{date:'2026-08-01',kind:'stock',nativeAmount:1,currency:'USD'}]);
globalThis.sig2=pnlImportBatchSignature([{date:'2026-08-01',kind:'stock',nativeAmount:1,currency:'USD'}]);
const row={nativeAmount:10,currency:'USD',fx:{HKD:7.77,CNY:7.2,JPY:150}};
globalThis.hkd=pnlEventDisplayValue(row);S.dispCur='USD';globalThis.usd=pnlEventDisplayValue(row);S.dispCur='RMB';globalThis.rmb=pnlEventDisplayValue(row);S.dispCur='JPY';globalThis.jpy=pnlEventDisplayValue(row);
`;
const context={Date,Number,String,Math};vm.createContext(context);vm.runInContext(code,context);
assert.equal(context.iso,'2026-08-23');
assert.equal(context.sig1,context.sig2);
assert.ok(Math.abs(context.hkd-77.7)<1e-9);
assert.equal(context.usd,10);
assert.equal(context.rmb,72);
assert.equal(context.jpy,1500);

const fxLookupCode=`
${declaration('pnlHistoricalFxForDate')}
const S={pnlImports:[{rows:[{date:'2026-08-22',fx:{HKD:7.8,CNY:7.1,JPY:148}}]}]};
globalThis.hit=pnlHistoricalFxForDate('2026-08-22');
globalThis.miss=pnlHistoricalFxForDate('2026-08-21');
`;
const fxLookupContext={Number};vm.createContext(fxLookupContext);vm.runInContext(fxLookupCode,fxLookupContext);
assert.deepEqual({...fxLookupContext.hit},{HKD:7.8,CNY:7.1,JPY:148});
assert.equal(fxLookupContext.miss,null);

console.log('P&L import contract, deterministic dedup, historical FX, and year-view tests passed.');
