import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const html=fs.readFileSync(path.join(here,'..','index.html'),'utf8');
function declaration(name){const start=html.indexOf(`function ${name}(`);assert.notEqual(start,-1,`missing function ${name}`);const next=html.indexOf('\nfunction ',start+10);return html.slice(start,next<0?html.length:next);}

assert.doesNotMatch(html,/<canvas id="trend-chart"/);
assert.match(html,/id="pnl-calendar-card"/);
assert.match(html,/id="pnl-cal-mode-year"/);
assert.match(html,/id="pnl-import-file"/);
assert.match(html,/id="m-crypto-est"/);
assert.match(html,/id="pnl-filter-drawer"/);
assert.match(html,/id="pnl-currency-btn"/);
assert.match(html,/id="pnl-cal-filter-drawer"/);
assert.match(html,/id="pnl-calendar-filters"/);
assert.match(html,/function quickCyclePnlCurrency\(/);
assert.match(html,/function pnlCalendarBlockAmount\(/);
assert.ok(html.indexOf('id="pnl-cal-summary"')<html.indexOf('id="pnl-cal-grid"'),'period summary should appear above the calendar grid');
assert.match(html,/onclick="togglePnlCalendarMonth\(\$\{i\}\)"/);
assert.match(html,/\.pnl-sec-body\.collapsed>:not\(:first-child\)\{display:none!important\}/);
assert.doesNotMatch(html,/\.pnl-sec-body\.collapsed\{display:none\}/);
assert.doesNotMatch(html,/\.settle-record-choice\.sel::before/);
assert.doesNotMatch(html,/id="friends-mgr"/);
assert.match(html,/body\{[\s\S]*?-webkit-user-select:none;user-select:none;/);
assert.match(html,/input,textarea,select,\[contenteditable="true"\]\{-webkit-user-select:text;user-select:text\}/);

const code=`
${declaration('pnlUsMarketCloseDate')}
${declaration('pnlSnapshotUsesUsMarketClose')}
${declaration('pnlSnapshotCalendarDate')}
${declaration('pnlUnrealizedEvents')}
${declaration('pnlCalendarSectionEnabled')}
${declaration('pnlCalendarSourceText')}
${declaration('pnlCalendarAllowsMoneyPlus')}
${declaration('pnlCalendarRecordKind')}
${declaration('pnlShiftIsoDate')}
${declaration('pnlImportBatchDateOffset')}
${declaration('pnlImportCalendarRows')}
${declaration('pnlCalendarEvents')}
const S={
  pnlPieFilters:[],
  pnlCalendarFilters:[],
  pnlCalendarSections:{},
  pnlImports:[],
  customSections:[],
  accounts:[],
  priceHist:[
    {t:Date.parse('2026-08-03T19:00:00Z'),p:{stock:10,crypto:-5}},
    {t:Date.parse('2026-08-03T20:05:00Z'),p:{stock:25,crypto:5}}
  ],
  portfolio:[{name:'Stock gain',exitPrice:12,exitDate:'2026-08-03',valueHKD:120,costHKD:100,type:'stock'},{name:'Legacy import',exitPrice:1,exitDate:'2026-08-03',valueHKD:999,costHKD:0,type:'crypto',acctLabel:'N8 polymarket',imported:'mp'},{name:'FuTu⭐',exitPrice:1,exitDate:'2024-12-14',valueHKD:6274.02,costHKD:0,type:'stock',acctLabel:'Futu',imported:'mp',_mpKey:'mp|2024-12-14|income|6274.02|理財投資|Futu|FuTu⭐'}],
  gamble:[{venue:'Game',open:false,date:'2026-08-04',cashoutHKD:80,buyinHKD:100},{venue:'14',open:false,date:'2026-08-04',cashoutHKD:999,buyinHKD:0,imported:'mp',_mpKey:'mp|2026-08-04|income|999|賭|HSBC|14'},{venue:'14',open:false,date:'2026-08-04',cashoutHKD:55,buyinHKD:0,imported:'mp',_mpKey:'mp|2026-08-04|income|55|賭|N8|14'}],
  privateLoans:[{borrower:'Alex',payments:[{date:'2026-08-05',interestHKD:30}]}],
  physicalAssets:[{name:'Watch',cur:'HKD',valuationHistory:[{date:'2026-01-01',value:500},{date:'2026-08-06',value:600}]}]
};
function acctIsPhysical(){return false;}
function loanPayments(l){return l.payments||[];}
function ensurePhysicalAssetHistory(a){return a.valuationHistory||[];}
function toHKD(v){return Number(v)||0;}
function t(k){return k;}
function tt(zh){return zh;}
function today(){return '2026-08-23';}
function ymd(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
globalThis.all=pnlCalendarEvents();
globalThis.unreal=pnlUnrealizedEvents();
S.pnlPieFilters=['physical'];
globalThis.pageFilterIgnored=pnlCalendarEvents();
S.pnlPieFilters=[];
S.pnlCalendarFilters=['physical'];
globalThis.physical=pnlCalendarEvents();
S.pnlCalendarFilters=[];
S.pnlImports=[{id:'draft',active:false,kind:'stock',rows:[{date:'2026-08-07',kind:'stock',nativeAmount:99,currency:'HKD'}]},{id:'live',active:true,dateBasis:'date-only-v2',kind:'stock',rows:[{date:'2026-08-08',kind:'stock',nativeAmount:12,currency:'HKD'},{date:'2026-08-03',kind:'stock',nativeAmount:40,currency:'HKD'}]}];
globalThis.withImports=pnlCalendarEvents();
S.pnlImports=[{id:'legacy-futu',active:true,kind:'stock',rows:[{date:'2026-07-05',kind:'stock',nativeAmount:5.14,currency:'USD'},{date:'2026-07-06',kind:'stock',nativeAmount:7.78,currency:'USD'},{date:'2026-07-09',kind:'stock',nativeAmount:-49.4,currency:'USD'}]}];globalThis.legacyShift=pnlCalendarEvents();
S.pnlCalendarFilters=['polymarket'];globalThis.polymarket=pnlCalendarEvents();S.pnlCalendarFilters=['poker'];globalThis.poker=pnlCalendarEvents();S.pnlCalendarFilters=[];
S.customSections=[{id:'cs_test',base:'stock'}];S.pnlImports=[{id:'custom',active:true,kind:'cs_test',rows:[{date:'2026-08-09',kind:'cs_test',nativeAmount:50,currency:'HKD'}]}];
globalThis.customOff=pnlCalendarEvents();S.pnlCalendarSections.cs_test=true;globalThis.customOn=pnlCalendarEvents();
`;
const context={};vm.createContext(context);vm.runInContext(code,context);
assert.equal(context.all.length,8);
assert.equal(context.pageFilterIgnored.length,8);
assert.equal(context.all.reduce((n,e)=>n+(e.value||0),0),1209);
assert.deepEqual([...context.unreal].map(e=>[e.date,e.kind,e.value]),[['2026-08-03','stock',15],['2026-08-04','crypto',10]]);
assert.deepEqual([...context.physical].map(e=>e.value),[100]);
assert.equal(context.withImports.length,9);
assert.equal(context.withImports.some(e=>e.date==='2026-08-03'&&e.kind==='stock'&&e.label==='未實現損益變動'),false);
assert.equal(context.withImports.some(e=>e.date==='2026-08-03'&&e.kind==='stock'&&e.importBatch==='live'&&e.nativeAmount===40),true);
assert.equal(context.legacyShift.some(e=>e.importBatch==='legacy-futu'&&e.date==='2026-07-05'),false);
assert.equal(context.legacyShift.some(e=>e.importBatch==='legacy-futu'&&e.date==='2026-07-06'&&e.nativeAmount===5.14&&e.dateCorrected),true);
assert.equal(context.legacyShift.some(e=>e.importBatch==='legacy-futu'&&e.date==='2026-07-10'&&e.nativeAmount===-49.4&&e.dateCorrected),true);
assert.deepEqual([...context.polymarket].map(e=>e.value),[999]);
assert.deepEqual([...context.poker].map(e=>e.value),[-20,55]);
assert.equal(context.customOff.length,8);
assert.equal(context.customOn.length,9);

const marketDateCode=`
${declaration('pnlUsMarketCloseDate')}
globalThis.beforeSummerClose=pnlUsMarketCloseDate(Date.parse('2026-08-03T19:59:00Z'));
globalThis.atSummerClose=pnlUsMarketCloseDate(Date.parse('2026-08-03T20:00:00Z'));
globalThis.beforeWinterClose=pnlUsMarketCloseDate(Date.parse('2026-01-05T20:59:00Z'));
globalThis.atWinterClose=pnlUsMarketCloseDate(Date.parse('2026-01-05T21:00:00Z'));
globalThis.weekend=pnlUsMarketCloseDate(Date.parse('2026-08-09T22:00:00Z'));
`;
const marketDateContext={Date,Intl,Number,String};vm.createContext(marketDateContext);vm.runInContext(marketDateCode,marketDateContext);
assert.equal(marketDateContext.beforeSummerClose,'2026-07-31');
assert.equal(marketDateContext.atSummerClose,'2026-08-03');
assert.equal(marketDateContext.beforeWinterClose,'2026-01-02');
assert.equal(marketDateContext.atWinterClose,'2026-01-05');
assert.equal(marketDateContext.weekend,'2026-08-07');

const compactCode=`
${declaration('pnlCalendarBlockAmount')}
const S={privacy:false};
globalThis.values=[pnlCalendarBlockAmount(258.62),pnlCalendarBlockAmount(-396.84),pnlCalendarBlockAmount(6274.02),pnlCalendarBlockAmount(1250000)];
`;
const compactContext={Number,Math};vm.createContext(compactContext);vm.runInContext(compactCode,compactContext);
assert.deepEqual([...compactContext.values],['+259','−397','+6.3K','+1.3M']);

const snapshotCode=`
${declaration('portfolioUnrealizedSnapshot')}
${declaration('recordPriceSnapshot')}
const S={accounts:[{id:'regular',secondaryKind:'none'},{id:'mpf',secondaryKind:'physical'}],portfolio:[{type:'stock',acctId:'regular',costHKD:100,valueHKD:110},{type:'crypto',acctId:'mpf',costHKD:100,valueHKD:80}],priceHist:[]};
function acctIsPhysical(id){return id==='mpf';}
function pnlSecForPort(p){return p.secId||p.type;}
recordPriceSnapshot(100000);
recordPriceSnapshot(110000);
S.portfolio[0].valueHKD=115;
recordPriceSnapshot(120000);
globalThis.snapshots=S.priceHist;
`;
const snapshotContext={};vm.createContext(snapshotContext);vm.runInContext(snapshotCode,snapshotContext);
assert.equal(snapshotContext.snapshots.length,2);
assert.deepEqual({...snapshotContext.snapshots[0].p},{stock:10,physical:-20});
assert.deepEqual({...snapshotContext.snapshots[1].p},{stock:15,physical:-20});

console.log('P&L calendar replacement, compact filters, collapse, and text-selection tests passed.');
