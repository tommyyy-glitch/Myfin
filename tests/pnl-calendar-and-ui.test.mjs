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
assert.match(html,/id="pnl-filter-drawer"/);
assert.match(html,/\.pnl-sec-body\.collapsed>:not\(:first-child\)\{display:none!important\}/);
assert.doesNotMatch(html,/\.pnl-sec-body\.collapsed\{display:none\}/);
assert.doesNotMatch(html,/\.settle-record-choice\.sel::before/);
assert.doesNotMatch(html,/id="friends-mgr"/);
assert.match(html,/body\{[\s\S]*?-webkit-user-select:none;user-select:none;/);
assert.match(html,/input,textarea,select,\[contenteditable="true"\]\{-webkit-user-select:text;user-select:text\}/);

const code=`
${declaration('pnlUnrealizedEvents')}
${declaration('pnlCalendarEvents')}
const S={
  pnlPieFilters:[],
  accounts:[],
  priceHist:[
    {t:new Date(2026,7,1,12).getTime(),p:{stock:10,crypto:-5}},
    {t:new Date(2026,7,2,12).getTime(),p:{stock:25,crypto:5}}
  ],
  portfolio:[{name:'Stock gain',exitPrice:12,exitDate:'2026-08-03',valueHKD:120,costHKD:100,type:'stock'}],
  gamble:[{venue:'Game',open:false,date:'2026-08-04',cashoutHKD:80,buyinHKD:100}],
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
globalThis.physical=pnlCalendarEvents();
`;
const context={};vm.createContext(context);vm.runInContext(code,context);
assert.equal(context.all.length,6);
assert.equal(context.all.reduce((n,e)=>n+e.value,0),155);
assert.deepEqual([...context.unreal].map(e=>[e.date,e.kind,e.value]),[['2026-08-02','stock',15],['2026-08-02','crypto',10]]);
assert.deepEqual([...context.physical].map(e=>e.value),[100]);

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
