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

const accountingCode=[
  declaration('acctCashTxns'),
  declaration('acctPositionsCash'),
  declaration('acctCash'),
  declaration('acctMarginDebt'),
  declaration('acctOpenValue'),
  declaration('acctHasOpenInvest'),
  declaration('acctBalance'),
  declaration('acctDebt'),
  declaration('acctAsset'),
  declaration('realisedPnlTxnRows'),
  `
    const S={
      accounts:[{id:'inv',opening:1000,cur:'HKD',isInvest:true}],
      txns:[],gamble:[],
      portfolio:[{id:'pe1',type:'pe',acctId:'inv',costHKD:400,valueHKD:500,margin:false,exitPrice:null}]
    };
    function toHKD(v){return Number(v)||0;}
    function portCountsInNet(){return true;}
    function gambleCountsInNet(){return true;}
    function getAcct(id){return S.accounts.find(a=>a.id===id);}
    function acctLabel(a){return a?.id||'';}
    function t(k){return k;}
    function today(){return '2099-01-01';}

    globalThis.peResult={
      positionCash:acctPositionsCash('inv'),
      cash:acctCash('inv'),
      balance:acctBalance('inv'),
      asset:acctAsset('inv'),
      debt:acctDebt('inv')
    };

    S.portfolio=[{id:'sold1',type:'stock',name:'ABC',acctId:'inv',costHKD:100,valueHKD:130,exitPrice:13,date:'2026-01-10',exitDate:'2026-07-15'}];
    globalThis.realisedResult=realisedPnlTxnRows()[0];
  `
].join('\n');

const context={};
vm.createContext(context);
vm.runInContext(accountingCode,context);

assert.deepEqual({...context.peResult},{positionCash:-400,cash:600,balance:1100,asset:1100,debt:0});
assert.equal(context.realisedResult.date,'2026-07-15');
assert.equal(context.realisedResult.pnlHKD,30);

const savePeCode=declaration('savePE');
assert.match(savePeCode,/acctAvailableCash\(acctId,editId\)/);
assert.match(savePeCode,/costHKD>avail\+0\.001/);

const trendCode=declaration('drawTrend');
assert.match(trendCode,/p\.exitDate\|\|p\.date\|\|today\(\)/);

console.log('Private-equity funding and realised-date tests passed.');
