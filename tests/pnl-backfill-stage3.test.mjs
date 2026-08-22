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

assert.match(html,/Stage 3：支援多次買入同部分賣出/);
assert.match(html,/id="pnl-backfill-ledger"/);
assert.match(html,/portfolioLotEvents/);
assert.doesNotMatch(declaration('previewPnlBackfill'),/askAI|callAI|buildAiContext/);

const code=`
${declaration('pnlBackfillPositionKey')}
${declaration('pnlLotLedgerForPosition')}
${declaration('normaliseBackfillCurrency')}
${declaration('pnlBackfillFxRateForDate')}
${declaration('parsePnlLotDetail')}
${declaration('inferPnlLotLedger')}
${declaration('reconcilePnlLotLedger')}
${declaration('buildPnlMultiLotDaily')}
${declaration('backfillAccountingSignature')}
${declaration('storePnlBackfillBatch')}
${declaration('dropPnlBackfillBatch')}
${declaration('storePnlLotLedger')}
${declaration('recordPortfolioLotEvent')}
function tt(zh){return zh;}
function fmt(n){return 'HK$'+n;}
function today(){return '2026-08-23';}

const position={id:10,type:'stock',name:'VOO',qty:8,entryPrice:610,costHKD:37966.4,valueHKD:40456,cur:'USD',acctId:'invest',secId:'',date:'2026-08-03'};
const rows=[
  {id:'a',date:'2026-08-03',action:'buy',qty:5,price:600,costHKD:'',costSource:''},
  {id:'b',date:'2026-08-10',action:'buy',qty:5,price:620,costHKD:'',costSource:''},
  {id:'c',date:'2026-08-17',action:'sell',qty:2,price:640,costHKD:'',costSource:''}
];
const fx=[{date:'2026-08-01',rate:7.78}];
const bars=[{date:'2026-08-03',close:600},{date:'2026-08-10',close:620},{date:'2026-08-17',close:640},{date:'2026-08-19',close:650}];
const S={portfolio:[position],accounts:[{id:'invest',balance:1}],txns:[],people:[],gamble:[],physicalAssets:[],debts:[],privateLoans:[],pnlBackfills:[],pnlLotLedgers:[],portfolioLotEvents:[],changelog:[
  {date:'2026-08-03',ts:1,action:'add',name:'VOO',type:'stock',acctId:'invest',secId:'',detail:'5 @ USD600'},
  {date:'2026-08-10',ts:2,action:'add',name:'VOO',type:'stock',acctId:'invest',secId:'',detail:'+5 @ USD620'},
  {date:'2026-08-17',ts:3,action:'sell',name:'VOO',type:'stock',acctId:'invest',secId:'',detail:'2 @ USD640'}
]};

globalThis.reconciled=reconcilePnlLotLedger(position,rows,fx,true);
globalThis.calc=buildPnlMultiLotDaily(position,bars,fx,reconciled.rows,'stock');
globalThis.inferred=inferPnlLotLedger(position);
const before=backfillAccountingSignature();
storePnlLotLedger({positionId:'10',rows:reconciled.rows});
storePnlBackfillBatch({id:'b1',positionId:'10',key:'k1',daily:calc.daily});
globalThis.accountingSafe=before===backfillAccountingSignature();
dropPnlBackfillBatch('b1');
globalThis.ledgerSurvives=S.pnlLotLedgers.length===1;
globalThis.event=recordPortfolioLotEvent(position,'buy',{qty:1,price:660,costHKD:5134.8});
globalThis.eventAccountingSafe=before===backfillAccountingSignature();

const alignPosition={...position,costHKD:38000};
globalThis.aligned=reconcilePnlLotLedger(alignPosition,rows,fx,true);
try{reconcilePnlLotLedger({...position,costHKD:50000},rows,fx,true);}catch(e){globalThis.largeMismatch=e.message;}
try{reconcilePnlLotLedger(position,rows.slice(0,2),fx,true);}catch(e){globalThis.qtyMismatch=e.message;}
`;

const context={};vm.createContext(context);vm.runInContext(code,context);
assert.equal(context.reconciled.endingQty,8);
assert.equal(context.reconciled.endingCost,37966.4);
assert.equal(context.reconciled.confidence,'historical-fx-estimate');
assert.equal(context.calc.lastUnrealised,2489.6);
assert.equal(context.calc.daily.reduce((sum,x)=>sum+x.value,0),2489.6);
assert.equal(context.inferred.rows.length,3);
assert.deepEqual([...context.inferred.rows].map(x=>x.action),['buy','buy','sell']);
assert.equal(context.accountingSafe,true);
assert.equal(context.ledgerSurvives,true,'rollback removes calendar batch but keeps verified ledger metadata');
assert.equal(context.event.action,'buy');
assert.equal(context.eventAccountingSafe,true,'structured events are metadata, not accounting');
assert.equal(context.aligned.aligned,true);
assert.equal(context.aligned.endingCost,38000);
assert.match(context.largeMismatch,/成本對盤相差/);
assert.match(context.qtyMismatch,/最後數量/);

console.log('Stage 3 multi-lot reconstruction, reconciliation, structured-event, and rollback tests passed.');
