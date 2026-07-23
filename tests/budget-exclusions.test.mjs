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
  declaration('dateOnly'),
  declaration('parseDateOnly'),
  declaration('ymd'),
  declaration('validBudgetDate'),
  declaration('budgetCfg'),
  declaration('budgetCycleWindow'),
  declaration('budgetWindow'),
  declaration('budgetInfo'),
  declaration('toggleBudgetCat'),
  declaration('saveBudgetSettings'),
  `
    const S={
      budget:{
        amount:1000,cur:'HKD',mode:'custom',startDay:1,cutoffDay:31,
        customStart:'2026-07-07',customEnd:'2026-08-15',excludedCats:['travel','travel']
      },
      txns:[
        {id:'before',type:'expense',catId:'food',amtHKD:50,date:'2026-07-06'},
        {id:'first',type:'expense',catId:'food',amtHKD:100,date:'2026-07-07'},
        {id:'last-extra',type:'expense',catId:'travel',amtHKD:300,date:'2026-08-15'},
        {id:'after',type:'expense',catId:'food',amtHKD:50,date:'2026-08-16'},
        {id:'hidden',type:'expense',catId:'food',amtHKD:80,date:'2026-07-20',excluded:true},
        {id:'income',type:'income',catId:'income',amtHKD:900,date:'2026-07-20'}
      ]
    };
    function dimM(y,m){return new Date(y,m+1,0).getDate();}
    function toHKD(v){return Number(v)||0;}
    function txReportable(tx){return !tx.excluded;}
    function balanceSheetBreakdown(){return {quickAsset:5000};}
    function saveS(){}
    function renderBudgetSettings(){}
    function renderHome(){}
    const toasts=[];
    function showToast(msg,error){toasts.push({msg,error});}
    function tt(zh){return zh;}
    const fields={
      'budget-amount':{value:'1500'},'budget-cur':{value:'USD'},
      'budget-start':{value:'25'},'budget-cutoff':{value:'24'},
      'budget-custom-start':{value:'2026-07-07'},'budget-custom-end':{value:'2026-08-15'}
    };
    const document={getElementById(id){return fields[id];}};

    const active=budgetInfo(new Date(2026,6,20));
    const upcoming=budgetInfo(new Date(2026,6,1));
    const ended=budgetInfo(new Date(2026,7,16));

    toggleBudgetCat('travel');
    const afterRemove=[...S.budget.excludedCats];
    toggleBudgetCat('travel');
    const afterAdd=[...S.budget.excludedCats];
    saveBudgetSettings();
    const saved={...S.budget,excludedCats:[...S.budget.excludedCats]};

    fields['budget-custom-end'].value='2026-07-01';
    saveBudgetSettings();
    const afterInvalid={...S.budget};

    S.budget={...S.budget,mode:'cycle',startDay:25,cutoffDay:24};
    const recurring=budgetWindow(new Date(2026,6,30));
    globalThis.result={active,upcoming,ended,afterRemove,afterAdd,saved,afterInvalid,recurring,toasts};
  `
].join('\n');

const context={};
vm.createContext(context);
vm.runInContext(code,context);

assert.equal(context.result.active.win.mode,'custom');
assert.equal(context.result.active.win.start.getFullYear(),2026);
assert.equal(context.result.active.win.start.getMonth(),6);
assert.equal(context.result.active.win.start.getDate(),7);
assert.equal(context.result.active.win.end.getMonth(),7);
assert.equal(context.result.active.win.end.getDate(),15);
assert.equal(context.result.active.allSpent,400);
assert.equal(context.result.active.spent,100);
assert.equal(context.result.active.excludedSpent,300);
assert.equal(context.result.active.remain,900);
assert.equal(context.result.active.phase,'active');
assert.equal(context.result.active.daysLeft,27);
assert.deepEqual([...context.result.active.cfg.excludedCats],['travel']);

assert.equal(context.result.upcoming.phase,'upcoming');
assert.equal(context.result.upcoming.daysUntilStart,6);
assert.equal(context.result.upcoming.daysLeft,40);
assert.equal(context.result.ended.phase,'ended');
assert.equal(context.result.ended.daysLeft,0);
assert.equal(context.result.ended.daily,0);

assert.deepEqual([...context.result.afterRemove],[]);
assert.deepEqual([...context.result.afterAdd],['travel']);
assert.equal(context.result.saved.amount,1500);
assert.equal(context.result.saved.cur,'USD');
assert.equal(context.result.saved.mode,'custom');
assert.equal(context.result.saved.customStart,'2026-07-07');
assert.equal(context.result.saved.customEnd,'2026-08-15');
assert.deepEqual([...context.result.saved.excludedCats],['travel']);

assert.equal(context.result.afterInvalid.customEnd,'2026-08-15');
assert.match(context.result.toasts.at(-1).msg,/結束日期不可早於開始日期/);
assert.equal(context.result.toasts.at(-1).error,1);

assert.equal(context.result.recurring.mode,'cycle');
assert.equal(context.result.recurring.start.getMonth(),6);
assert.equal(context.result.recurring.start.getDate(),25);
assert.equal(context.result.recurring.end.getMonth(),7);
assert.equal(context.result.recurring.end.getDate(),24);

assert.match(html,/id="budget-mode-cycle"/);
assert.match(html,/id="budget-mode-custom"/);
assert.match(html,/id="budget-custom-start"/);
assert.match(html,/id="budget-custom-end"/);
assert.match(html,/Set exact one-off start and end dates across months or years/);
assert.match(html,/b\.targetHKD>0&&b\.phase==='active'/);
assert.match(html,/id="budget-cat-list"/);
assert.match(html,/aria-pressed="\$\{off\}"/);

console.log('Budget cycle, custom date range, and category exclusion tests passed.');
