import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const html=fs.readFileSync(path.join(here,'..','index.html'),'utf8');

function declaration(name){
  const asyncStart=html.indexOf(`async function ${name}(`);
  const start=asyncStart>=0?asyncStart:html.indexOf(`function ${name}(`);
  assert.notEqual(start,-1,`missing function ${name}`);
  const next=html.indexOf('\nfunction ',start+10);
  const nextAsync=html.indexOf('\nasync function ',start+10);
  const stops=[next,nextAsync].filter(x=>x>=0);
  const end=stops.length?Math.min(...stops):html.length;
  return html.slice(start,end);
}

const contextCode=[
  declaration('aiNum'),
  declaration('aiIso'),
  declaration('aiPeriodSummary'),
  declaration('buildAiContextData'),
  declaration('buildAiContext'),
  `
  const S={
    dispCur:'HKD',
    fx:{updated:Date.now()-7200000},
    cloud:{last:Date.now()-1000,pending:false},
    accounts:[
      {id:'inv',label:'MPF',kind:'invest',secondaryKind:'retirement',cur:'HKD'},
      {id:'card',label:'Card',kind:'credit',cur:'HKD'}
    ],
    people:[
      {id:'r1',name:'Client',dir:'r',amtHKD:500,date:'2026-07-01',settled:false,dead:false,rpKind:'income'},
      {id:'p1',name:'Vendor',dir:'p',amtHKD:200,date:'2026-07-02',settled:false,dead:false},
      {id:'dead',name:'Dead',dir:'r',amtHKD:999,date:'2026-07-03',settled:false,dead:true}
    ],
    portfolio:[
      {id:'open',type:'stock',name:'OPEN',acctLabel:'Broker',cur:'HKD',costHKD:1000,valueHKD:1200,margin:false},
      {id:'closed',type:'stock',name:'CLOSED',acctLabel:'Broker',cur:'HKD',costHKD:700,valueHKD:800,exitPrice:8}
    ],
    gamble:[],
    physicalAssets:[{id:'fa1',name:'Laptop',category:'equipment',purchaseDate:'2026-01-01',costHKD:900,cost:900,cur:'HKD',marketValue:850,valuationDate:'2026-07-01',valuationHistory:[{date:'2026-01-01',value:900,source:'purchase'},{date:'2026-07-01',value:850,source:'manual'}]}],
    privateLoans:[],
    debts:[{name:'Loan',balance:300,apr:2,monthly:50}],
    budget:{amount:0},
    txns:[
      {id:1,date:'2026-07-01',type:'income',amount:100,amtHKD:100,cur:'HKD',catLabel:'Salary',acctLabel:'Broker'},
      {id:2,date:'2026-07-02',type:'expense',amount:40,amtHKD:40,cur:'HKD',catLabel:'Food',acctLabel:'Broker'}
    ]
  };
  function balanceSheetBreakdown(){return {quickAsset:600,investmentAsset:1200,fixedAsset:800,receivable:500,assets:3100,payable:200,shortDebt:0,longDebt:300,debt:500,netWorth:2600};}
  function acctLabel(a){return a.label;}
  function secondaryKindLabel(k){return k==='retirement'?'Retirement / MPF (locked)':'';}
  function acctCash(id){return id==='inv'?600:-100;}
  function acctOpenValue(id){return id==='inv'?1200:0;}
  function acctMarginDebt(){return 0;}
  function acctBalance(id){return id==='inv'?1800:-100;}
  function rpIsActive(p){return !p.settled&&!p.dead;}
  function isIncomeReceivable(p){return p.rpKind==='income';}
  function portCountsInNet(){return true;}
  function gambleCountsInNet(){return true;}
  function loanOutstandingPrincipal(){return 0;}
  function loanAccruedOutstanding(){return 0;}
  function loanInterestReceived(){return 0;}
  function pnlNetExcluded(){return false;}
  function physicalCategoryLabel(){return 'Computer / equipment';}
  function assetLabel(k){return k;}
  function physicalAssetValue(a){return a.soldAt?0:850;}
  function ensurePhysicalAssetHistory(a){return a.valuationHistory||[];}
  function physicalMetalLabel(){return '';}
  function toHKD(v){return Number(v)||0;}
  function periodMatchDate(){return true;}
  function txReportable(tx){return !tx.excluded;}
  function pnlIncomeTotal(){return 0;}
  function txSortStamp(tx){return {n:Number(tx.id)||0};}
  function budgetInfo(){return {win:{mode:'cycle',start:new Date('2026-07-01'),end:new Date('2026-07-31')},phase:'active',targetHKD:0,spent:40,excludedSpent:0,remain:-40,daysLeft:1};}
  function ymd(d){return d.toISOString().slice(0,10);}
  globalThis.snapshot=buildAiContextData();
  globalThis.serialized=buildAiContext();
  `
].join('\n');

const context={};
vm.createContext(context);
vm.runInContext(contextCode,context);

const snap=context.snapshot;
assert.equal(snap.schemaVersion,3);
assert.equal(snap.balanceSheetHKD.netWorth,2600);
assert.equal(snap.balanceSheetHKD.liquidInvestmentAssets,1200);
assert.equal(snap.balanceSheetHKD.physicalFixedAssets,800);
assert.equal(snap.accounts[0].cashHKD,600);
assert.equal(snap.accounts[0].openPositionValueHKD,1200);
assert.equal(snap.accounts[0].secondaryKind,'retirement');
assert.equal(snap.accounts[0].secondaryLabel,'Retirement / MPF (locked)');
assert.equal(snap.receivables.length,1);
assert.equal(snap.receivables[0].name,'Client');
assert.equal(snap.payables.length,1);
assert.equal(snap.payables[0].name,'Vendor');
assert.equal(snap.investments.openPositions.length,1);
assert.equal(snap.investments.openPositions[0].name,'OPEN');
assert.equal(snap.investments.closedHistorySummary.positionCount,1);
assert.equal(snap.physicalFixedAssets.length,1);
assert.equal(snap.physicalFixedAssets[0].currentMarketValueHKD,850);
assert.equal(snap.physicalFixedAssets[0].valuationHistory.length,2);
assert.equal(snap.physicalFixedAssets[0].status,'active');
assert.equal(snap.periodSummaries.month.expenseHKD,40);
assert.match(context.serialized,/AUTHORITATIVE_APP_SNAPSHOT_JSON/);

const askCode=declaration('askAI');
assert.match(askCode,/buildAiContext\(\)/);
assert.match(askCode,/balanceSheetHKD as the source of truth/);
assert.match(askCode,/slice\(-16\)/);

console.log('Structured AI context and anti-double-counting tests passed.');
