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
${declaration('pnlCalendarEvents')}
const S={
  pnlPieFilters:[],
  accounts:[],
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
function today(){return '2026-08-23';}
globalThis.all=pnlCalendarEvents();
S.pnlPieFilters=['physical'];
globalThis.physical=pnlCalendarEvents();
`;
const context={};vm.createContext(context);vm.runInContext(code,context);
assert.equal(context.all.length,4);
assert.equal(context.all.reduce((n,e)=>n+e.value,0),130);
assert.deepEqual([...context.physical].map(e=>e.value),[100]);

console.log('P&L calendar replacement, compact filters, collapse, and text-selection tests passed.');
