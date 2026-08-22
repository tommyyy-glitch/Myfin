import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const html=fs.readFileSync(path.join(here,'..','index.html'),'utf8');

function declaration(name){
  const starts=[html.indexOf(`function ${name}(`),html.indexOf(`async function ${name}(`)].filter(x=>x>=0);
  assert.ok(starts.length,`missing function ${name}`);
  const start=Math.min(...starts),rest=html.slice(start+10),match=rest.match(/\n(?:async )?function [A-Za-z0-9_$]+\(/);
  return html.slice(start,match?start+10+match.index:html.length);
}

assert.match(html,/id="m-pnl-backfill"/);
assert.match(html,/onclick="openPnlBackfill\(\)"/);
assert.match(html,/adjust:'splits'/);
assert.match(html,/api\.frankfurter\.dev\/v2\/rates/);
assert.doesNotMatch(declaration('previewPnlBackfill'),/askAI|callAI|buildAiContext/);

const code=`
${declaration('pnlBackfillFingerprint')}
${declaration('pnlBackfillPositionKey')}
${declaration('pnlBackfillEligibility')}
${declaration('pnlBackfillCutoffDate')}
${declaration('normaliseBackfillCurrency')}
${declaration('pnlBackfillFxRateForDate')}
${declaration('buildPnlBackfillDaily')}
${declaration('pnlBackfillBatchKey')}
${declaration('backfillAccountingSignature')}
${declaration('storePnlBackfillBatch')}
${declaration('dropPnlBackfillBatch')}
${declaration('pnlBackfillEvents')}

function tt(zh){return zh;}
function parseDateOnly(s){const p=String(s||'').split('-').map(Number);return p.length>=3?new Date(p[0],p[1]-1,p[2]):new Date(s);}
function ymd(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}

const position={id:1,type:'stock',name:'VOO',qty:2,entryPrice:95,costHKD:1500,valueHKD:1700,cur:'USD',acctId:'invest',secId:'',date:'2026-08-03',apiSymbol:'VOO',margin:false};
const S={
  portfolio:[position],accounts:[{id:'invest',balance:999}],txns:[{id:'t1'}],people:[],gamble:[],physicalAssets:[],debts:[],privateLoans:[],
  changelog:[{type:'stock',name:'VOO',acctId:'invest',secId:'',action:'add',detail:'2 @ USD95'}],priceHist:[{t:new Date(2026,6,1,12).getTime(),p:{stock:20}},{t:new Date(2026,7,20,12).getTime(),p:{stock:100}}],pnlBackfills:[]
};

globalThis.eligible=pnlBackfillEligibility(position);
globalThis.cutoff=pnlBackfillCutoffDate(position);
globalThis.calc=buildPnlBackfillDaily(position,[{date:'2026-08-03',close:100},{date:'2026-08-04',close:110}],[{date:'2026-08-01',rate:7.8}], 'stock');
globalThis.before=backfillAccountingSignature();
const batch={id:'b1',positionId:'1',key:pnlBackfillBatchKey(position,'VOO','2026-08-03','2026-08-19'),daily:calc.daily};
globalThis.firstStore=storePnlBackfillBatch(batch);
globalThis.secondStore=storePnlBackfillBatch({...batch,id:'b2'});
globalThis.overlapStore=storePnlBackfillBatch({...batch,id:'b3',key:batch.key+'|later'});
globalThis.after=backfillAccountingSignature();
globalThis.events=pnlBackfillEvents();
globalThis.removed=dropPnlBackfillBatch('b1');
globalThis.afterRemove=backfillAccountingSignature();
S.changelog.push({type:'stock',name:'VOO',acctId:'invest',secId:'',action:'add',detail:'+1 @ USD100'});
globalThis.merged=pnlBackfillEligibility(position);
`;

const context={};
vm.createContext(context);
vm.runInContext(code,context);

assert.equal(context.eligible.eligible,true);
assert.equal(context.cutoff,'2026-08-19');
assert.deepEqual([...context.calc.daily].map(x=>[x.date,x.value]),[['2026-08-03',60],['2026-08-04',156]]);
assert.equal(context.calc.lastUnrealised,216);
assert.equal(context.firstStore,true);
assert.equal(context.secondStore,false,'duplicate batch key must be idempotent');
assert.equal(context.overlapStore,false,'a position must not have overlapping batches');
assert.equal(context.before,context.after,'import must not mutate accounting state');
assert.equal(context.events.length,2);
assert.equal(context.events[0].source,'backfill');
assert.equal(context.removed,true);
assert.equal(context.before,context.afterRemove,'rollback must not mutate accounting state');
assert.equal(context.merged.eligible,true,'Stage 3 now accepts merged positions for manual ledger reconciliation');

const apiCode=`
${declaration('quoteRequestError')}
${declaration('normaliseBackfillCurrency')}
${declaration('fetchTwelveDataHistory')}
${declaration('fetchPnlBackfillFx')}
function tt(zh){return zh;}
function parseDateOnly(s){const p=String(s).split('-').map(Number);return new Date(p[0],p[1]-1,p[2]);}
function ymd(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
async function withQuoteKey(kind,request){return request('KEY');}
const requested=[];
async function fetch(url){
  requested.push(url);
  if(url.includes('twelvedata'))return {ok:true,status:200,async json(){return {meta:{currency:'USD',exchange:'NYSE Arca'},values:[{datetime:'2026-08-04',close:'110'},{datetime:'2026-08-03',close:'100'}]};}};
  return {ok:true,status:200,async json(){return [{date:'2026-08-03',base:'USD',quote:'HKD',rate:7.8}]}};
}
globalThis.result=(async()=>({history:await fetchTwelveDataHistory('VOO','2026-08-03','2026-08-04'),fx:await fetchPnlBackfillFx('USD','2026-08-03','2026-08-04'),requested}))();
`;
const apiContext={URLSearchParams,Date,Map,Error,Number,String,Array,RegExp};
vm.createContext(apiContext);vm.runInContext(apiCode,apiContext);const api=await apiContext.result;
assert.deepEqual([...api.history.bars].map(x=>[x.date,x.close]),[['2026-08-03',100],['2026-08-04',110]]);
assert.equal(api.history.currency,'USD');
assert.equal(api.fx[0].rate,7.8);
assert.match(api.requested[0],/adjust=splits/);
assert.match(api.requested[1],/base=USD/);
assert.match(api.requested[1],/quotes=HKD/);

console.log('Stage 1 historical P&L backfill isolation, calculation, duplicate, and rollback tests passed.');
