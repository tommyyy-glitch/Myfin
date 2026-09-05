import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function fn(n){const s=new RegExp('^function '+n+'\\(','m').exec(html).index;let e=html.indexOf('\n',s);while(e>=0){const c=html.slice(s,e);try{new vm.Script(c);return c;}catch{}e=html.indexOf('\n',e+1);}throw Error(n);}
const names=['checkAutopay','checkAutoincome','divFreqCode','divPerPost','divValCur'];
for(const n of ['recurringRunKey','migrateRecurringRuns','recurringWasRun','recurringRecord'])if(html.includes('function '+n+'('))names.push(n);
const data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v)),key:i=>[...data.keys()][i],get length(){return data.size;}};
const RealDate=Date;class FixedDate extends RealDate{constructor(...v){super(...(v.length?v:['2026-09-05T12:00:00Z']));}static now(){return new FixedDate().getTime();}}
const c=vm.createContext({assert,Date:FixedDate,localStorage:storage,console});
vm.runInContext(names.map(fn).join('\n')+`
const DIV_MB={month:1};let S,saves=0;
function dimM(y,m){return new Date(y,m+1,0).getDate();}function toHKD(n){return n;}
function getCat(){return {id:'income',label:'Income',icon:'x'};}function catLabel(c){return c.label;}function getAcct(){return {id:'bank',label:'Bank',icon:'x'};}function acctLabel(a){return a.label;}function t(k){return k;}function saveS(){saves++;}
function seed(){S={txns:[],autopay:[{id:'bill',active:true,amount:100,day:1,cur:'HKD',name:'Rent'}],autoincome:[{id:'salary',active:true,amount:500,day:1,freq:1,start:'2026-01-01',cur:'HKD',name:'Salary'}],portfolio:[{id:'position',qty:10,currentPrice:10,divPct:10,divFreq:'month',date:'2026-01-01',cur:'HKD'}]};}
seed();checkAutopay();checkAutoincome();assert.equal(S.txns.length,3);
`,c);
data.clear();
vm.runInContext(`
// A second device receives only the profile, not any localStorage flags.
S=JSON.parse(JSON.stringify(S));checkAutopay();checkAutoincome();assert.equal(S.txns.length,3,'must not post again on another device');
const keys=S.txns.map(t=>t.id);assert.equal(new Set(keys).size,3);
S.txns=[];checkAutopay();checkAutoincome();assert.equal(S.txns.length,0,'explicitly deleted occurrences stay consumed');
seed();S.automationPaused=true;checkAutopay();checkAutoincome();assert.equal(S.txns.length,0,'imported drafts do not auto-post');
`,c);
console.log('Recurring transfer, cancellation and paused-import tests passed.');
