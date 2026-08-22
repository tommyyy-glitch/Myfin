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

const fields={
  'settle-record-list':{innerHTML:''},
  'settle-title':{textContent:''},
  'settle-sub':{textContent:''},
  'settle-amt':{value:'',readOnly:false},
  'settle-date':{value:''},
  'settle-acct-chips':{innerHTML:''},
  'm-settle':{classList:{add(){}}}
};
const choiceButtons=[0,1].map(()=>({classList:{toggle(){}},setAttribute(){}}));
const toasts=[];
const code=[
  declaration('escapeHtml'),
  declaration('inlineJsString'),
  declaration('isIncomeReceivable'),
  declaration('rpSettlementTxns'),
  declaration('rpOrderedSettlementTxns'),
  declaration('syncRPSettlementState'),
  declaration('rpPaidTotals'),
  declaration('rpOriginalTotals'),
  declaration('addRPIncomeTxn'),
  declaration('addRPMove'),
  declaration('rpSettleDueHKD'),
  declaration('renderSettleRecordChoices'),
  declaration('syncSettleRecordForm'),
  declaration('settleSelectableItems'),
  declaration('syncSettleSelectionForm'),
  declaration('selectSettleRecord'),
  declaration('openSettleGroup'),
  declaration('renderSettleAcctChips'),
  declaration('restoreRPSettlement'),
  declaration('deleteRPSettlement'),
  declaration('applyRPSettlement'),
  declaration('confirmSettle'),
  `
    const S={
      people:[
        {id:'lunch',name:'Alex',originalAmount:10,originalAmtHKD:10,amount:10,amtHKD:10,cur:'HKD',desc:'Lunch',date:'2026-08-21',dir:'r',settled:false,acctId:'bank'},
        {id:'salary',name:'Alex',originalAmount:100,originalAmtHKD:100,amount:100,amtHKD:100,cur:'HKD',desc:'Salary',date:'2026-08-20',dir:'r',settled:false,acctId:'bank'}
      ],
      txns:[],accounts:[{id:'bank',label:'Bank',icon:'🏦'}],_settleIds:null,_settleSelectedIds:[],_settleId:null,_settleAcct:null,_editSettleTxnId:null
    };
    const document={
      getElementById(id){return fields[id]||null;},
      querySelectorAll(selector){return selector.includes('settle-record-choice')?choiceButtons:[];}
    };
    function t(k){return k;}
    function tt(zh,en){return en;}
    function fmt(v){return 'HK$'+Number(v).toFixed(2);}
    function getAcct(id){return S.accounts.find(a=>a.id===id);}
    function acctLabel(a){return a.label;}
    function getCat(){return {id:'income',label:'Income',icon:'💼'};}
    function catLabel(c){return c.label;}
    function today(){return '2026-08-22';}
    function dayDiff(){return 1;}
    function showToast(message,error){toasts.push({message,error});}
    function closeM(){}
    function saveS(){}
    function setWalletPane(){}
    function refreshAllViews(){}
    function confirm(){return true;}

    openSettleGroup('lunch,salary');
    const initial={selected:S._settleId,amount:fields['settle-amt'].value,list:fields['settle-record-list'].innerHTML};
    selectSettleRecord('lunch',choiceButtons[0]);
    const oneSelected={ids:[...S._settleSelectedIds],amount:fields['settle-amt'].value,readOnly:fields['settle-amt'].readOnly};
    selectSettleRecord('salary',choiceButtons[1]);
    const twoSelected={ids:[...S._settleSelectedIds],amount:fields['settle-amt'].value,readOnly:fields['settle-amt'].readOnly};
    selectSettleRecord('lunch',choiceButtons[0]);
    const deselected={ids:[...S._settleSelectedIds],amount:fields['settle-amt'].value,readOnly:fields['settle-amt'].readOnly};
    selectSettleRecord('salary',choiceButtons[1]);
    confirmSettle();
    const afterBlocked={lunch:S.people[0].amtHKD,salary:S.people[1].amtHKD,txns:S.txns.length};

    selectSettleRecord('lunch',choiceButtons[0]);
    fields['settle-amt'].value='5';fields['settle-date'].value='2026-08-22';
    confirmSettle();
    const firstTxn=S.txns.find(tx=>tx.rpPhase==='settle');
    const afterFive={lunch:S.people[0].amtHKD,salary:S.people[1].amtHKD,txn:{...firstTxn}};

    S._settleId='lunch';S._settleIds=['lunch'];S._settleSelectedIds=['lunch'];S._settleAcct='bank';S._editSettleTxnId=firstTxn.id;
    fields['settle-amt'].value='3';fields['settle-date'].value='2026-08-23';
    confirmSettle();
    const editedTxn=S.txns.find(tx=>tx.rpPhase==='settle');
    const afterEdit={lunch:S.people[0].amtHKD,salary:S.people[1].amtHKD,txn:{...editedTxn},count:S.txns.filter(tx=>tx.rpPhase==='settle').length};

    deleteRPSettlement(editedTxn.id);
    const afterDelete={lunch:S.people[0].amtHKD,salary:S.people[1].amtHKD,count:S.txns.filter(tx=>tx.rpPhase==='settle').length};
    openSettleGroup('lunch,salary');selectSettleRecord('lunch',choiceButtons[0]);selectSettleRecord('salary',choiceButtons[1]);confirmSettle();
    const afterBatch={lunch:S.people[0].amtHKD,salary:S.people[1].amtHKD,count:S.txns.filter(tx=>tx.rpPhase==='settle').length,from:S.txns.filter(tx=>tx.rpPhase==='settle').map(tx=>tx.fromRP).sort()};
    globalThis.result={initial,oneSelected,twoSelected,deselected,afterBlocked,afterFive,afterEdit,afterDelete,afterBatch,toasts};
  `
].join('\n');

const context={fields,choiceButtons,toasts};
vm.createContext(context);
vm.runInContext(code,context);

assert.equal(context.result.initial.selected,null,'multi-record settlement must not preselect an arbitrary record');
assert.equal(context.result.initial.amount,'');
assert.match(context.result.initial.list,/Lunch/);
assert.match(context.result.initial.list,/Salary/);
assert.deepEqual([...context.result.oneSelected.ids],['lunch']);
assert.equal(context.result.oneSelected.amount,'10.00');
assert.equal(context.result.oneSelected.readOnly,false);
assert.deepEqual([...context.result.twoSelected.ids],['lunch','salary']);
assert.equal(context.result.twoSelected.amount,'110.00');
assert.equal(context.result.twoSelected.readOnly,true);
assert.deepEqual([...context.result.deselected.ids],['salary']);
assert.equal(context.result.deselected.amount,'100.00');
assert.equal(context.result.deselected.readOnly,false);
assert.deepEqual({...context.result.afterBlocked},{lunch:10,salary:100,txns:0});
assert.deepEqual({...context.result.toasts[0]},{message:'selectrecordfirst',error:1});

assert.equal(context.result.afterFive.lunch,5);
assert.equal(context.result.afterFive.salary,100,'a lunch payment must not spill into salary');
assert.equal(context.result.afterFive.txn.fromRP,'lunch');
assert.equal(context.result.afterFive.txn.amtHKD,5);
assert.equal(context.result.afterFive.txn.date,'2026-08-22');

assert.equal(context.result.afterEdit.lunch,7);
assert.equal(context.result.afterEdit.salary,100);
assert.equal(context.result.afterEdit.txn.amtHKD,3);
assert.equal(context.result.afterEdit.txn.date,'2026-08-23');
assert.equal(context.result.afterEdit.count,1);

assert.deepEqual({...context.result.afterDelete},{lunch:10,salary:100,count:0});
assert.deepEqual({...context.result.afterBatch,lunch:context.result.afterBatch.lunch,salary:context.result.afterBatch.salary,count:context.result.afterBatch.count},{lunch:0,salary:0,count:2,from:context.result.afterBatch.from});
assert.deepEqual([...context.result.afterBatch.from],['lunch','salary']);
assert.match(declaration('confirmSettle'),/selected\.forEach/);
assert.match(html,/data-i="applytorecord"/);
assert.match(html,/Select one or several records; tap again to deselect/);

console.log('R/P single, toggle, and batch settlement allocation tests passed.');
