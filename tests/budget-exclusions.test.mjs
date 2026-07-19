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

const now=new Date();
const today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
const code=[
  declaration('dateOnly'),
  declaration('parseDateOnly'),
  declaration('budgetCfg'),
  declaration('budgetWindow'),
  declaration('budgetInfo'),
  declaration('toggleBudgetCat'),
  declaration('saveBudgetSettings'),
  `
    const S={
      budget:{amount:1000,cur:'HKD',startDay:1,cutoffDay:31,excludedCats:['travel','travel']},
      txns:[
        {id:'daily',type:'expense',catId:'food',amtHKD:100,date:${JSON.stringify(today)}},
        {id:'extra',type:'expense',catId:'travel',amtHKD:300,date:${JSON.stringify(today)}},
        {id:'hidden',type:'expense',catId:'food',amtHKD:50,date:${JSON.stringify(today)},excluded:true},
        {id:'income',type:'income',catId:'income',amtHKD:900,date:${JSON.stringify(today)}}
      ]
    };
    function dimM(y,m){return new Date(y,m+1,0).getDate();}
    function toHKD(v){return Number(v)||0;}
    function txReportable(tx){return !tx.excluded;}
    function balanceSheetBreakdown(){return {quickAsset:5000};}
    function saveS(){}
    function renderBudgetSettings(){}
    function renderHome(){}
    function showToast(){}
    function tt(zh){return zh;}
    const fields={
      'budget-amount':{value:'1500'},'budget-cur':{value:'USD'},
      'budget-start':{value:'25'},'budget-cutoff':{value:'24'}
    };
    const document={getElementById(id){return fields[id];}};

    const info=budgetInfo();
    toggleBudgetCat('travel');
    const afterRemove=[...S.budget.excludedCats];
    toggleBudgetCat('travel');
    const afterAdd=[...S.budget.excludedCats];
    saveBudgetSettings();
    globalThis.result={info,afterRemove,afterAdd,saved:{...S.budget}};
  `
].join('\n');

const context={};
vm.createContext(context);
vm.runInContext(code,context);

assert.equal(context.result.info.allSpent,400);
assert.equal(context.result.info.spent,100);
assert.equal(context.result.info.excludedSpent,300);
assert.equal(context.result.info.remain,900);
assert.deepEqual([...context.result.info.cfg.excludedCats],['travel']);
assert.deepEqual([...context.result.afterRemove],[]);
assert.deepEqual([...context.result.afterAdd],['travel']);
assert.equal(context.result.saved.amount,1500);
assert.equal(context.result.saved.cur,'USD');
assert.equal(context.result.saved.startDay,25);
assert.equal(context.result.saved.cutoffDay,24);
assert.deepEqual([...context.result.saved.excludedCats],['travel']);

assert.match(html,/id="budget-cat-list"/);
assert.match(html,/id="budget-cat-summary"/);
assert.match(html,/aria-pressed="\$\{off\}"/);
assert.match(html,/Selected categories still count toward spending, cash flow and net worth/);

console.log('Budget category exclusion tests passed.');
