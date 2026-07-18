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

const code=[
  declaration('isIncomeReceivable'),
  declaration('rpIncomeReceiptTxns'),
  declaration('rpIncomeAccruedTotals'),
  declaration('addRPIncomeTxn'),
  declaration('addRPIncomeReceiptTxn'),
  declaration('addRPMove'),
  declaration('ensureRPIncomeAccruals'),
  declaration('txIsRPFlow'),
  declaration('txIsDebtFlow'),
  declaration('txIsLoanFlow'),
  declaration('txIsRealisedPnl'),
  declaration('txReportable'),
  declaration('txCashFlowSign'),
  declaration('txAccountingSign'),
  declaration('acctCashTxns'),
  declaration('acctFlows'),
  `
    const S={
      accounts:[{id:'bank',opening:1000,cur:'HKD',label:'Bank',icon:'🏦'}],
      txns:[],people:[]
    };
    function toHKD(v){return Number(v)||0;}
    function getAcct(id){return S.accounts.find(a=>a.id===id)||S.accounts[0];}
    function acctLabel(a){return a.label;}
    function getCat(){return {id:'freelance',label:'Freelance',icon:'🧾'};}
    function catLabel(c){return c.label;}
    function today(){return '2026-07-18';}
    function tt(zh,en){return en;}
    function t(k){return k;}

    const open={id:'open',name:'Client',amount:300,amtHKD:300,cur:'HKD',desc:'Invoice',date:'2026-07-10',settled:false,dir:'r',rpKind:'income',incomeReceivable:true,catId:'freelance',acctId:'bank'};
    S.people=[open];
    const accrual=addRPMove(open,'open');
    const cashBefore=acctCashTxns('bank');
    const flowBefore=acctFlows('bank');
    const receipt=addRPMove(open,'settle',100,100);
    open.amount=200;open.amtHKD=200;
    const synced=addRPIncomeTxn(open);
    const cashAfter=acctCashTxns('bank');
    const reportableIncome=S.txns.filter(tx=>txReportable(tx)&&tx.type==='income').reduce((sum,tx)=>sum+tx.amtHKD,0);
    globalThis.fresh={accrual,receipt,synced,cashBefore,flowBefore,cashAfter,reportableIncome,txnCount:S.txns.length};

    S.txns=[{id:'legacy',type:'income',amount:150,amtHKD:150,cur:'HKD',acctId:'bank',fromRP:'settled',rpIncome:true,rpPhase:'settle_income',date:'2026-07-12'}];
    S.people=[{id:'settled',name:'Legacy client',amount:0,amtHKD:0,cur:'HKD',date:'2026-07-01',settled:true,dir:'r',rpKind:'income',incomeReceivable:true,catId:'freelance',acctId:'bank'}];
    const migrated=ensureRPIncomeAccruals();
    const migratedAgain=ensureRPIncomeAccruals();
    globalThis.legacy={migrated,migratedAgain,txns:S.txns.map(tx=>({...tx})),cash:acctCashTxns('bank'),income:S.txns.filter(tx=>txReportable(tx)&&tx.type==='income').reduce((sum,tx)=>sum+tx.amtHKD,0)};
  `
].join('\n');

const context={};
vm.createContext(context);
vm.runInContext(code,context);

assert.equal(context.fresh.accrual.type,'income');
assert.equal(context.fresh.accrual.rpPhase,'accrual');
assert.equal(context.fresh.accrual.nonCash,true);
assert.equal(context.fresh.accrual.date,'2026-07-10');
assert.equal(context.fresh.cashBefore,1000);
assert.deepEqual({...context.fresh.flowBefore},{inn:0,out:0});
assert.equal(context.fresh.receipt.type,'ar_move');
assert.equal(context.fresh.receipt.direction,'in');
assert.equal(context.fresh.cashAfter,1100);
assert.equal(context.fresh.synced.amtHKD,300);
assert.equal(context.fresh.reportableIncome,300);
assert.equal(context.fresh.txnCount,2);
assert.equal(context.fresh.accrual.rpAccrual,true);

assert.equal(context.legacy.migrated,true);
assert.equal(context.legacy.migratedAgain,false);
assert.equal(context.legacy.txns.length,2);
assert.equal(context.legacy.txns.find(tx=>tx.id==='legacy').type,'ar_move');
assert.equal(context.legacy.txns.find(tx=>tx.id==='legacy').direction,'in');
assert.equal(context.legacy.txns.find(tx=>tx.rpPhase==='accrual').amtHKD,150);
assert.equal(context.legacy.cash,1150);
assert.equal(context.legacy.income,150);

console.log('R/P income accrual and cash-settlement tests passed.');
