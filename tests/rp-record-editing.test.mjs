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
  declaration('escapeHtml'),
  declaration('inlineJsString'),
  declaration('isIncomeReceivable'),
  declaration('rpIsActive'),
  declaration('rpIncomeReceiptTxns'),
  declaration('rpIncomeAccruedTotals'),
  declaration('addRPIncomeTxn'),
  declaration('rpDetailText'),
  declaration('rpDetailHTML'),
  declaration('enhanceARRecordEditing'),
  `
    const S={txns:[]};
    function fmt(v){return 'HK$'+Number(v).toFixed(2);}
    function tt(zh,en){return en;}
    function getCat(){return {id:'freelance',label:'Freelance',icon:'🧾'};}
    function catLabel(c){return c.label;}
    function getAcct(){return {id:'bank',label:'Bank',icon:'🏦'};}
    function acctLabel(a){return a.label;}
    function today(){return '2026-07-15';}

    const legacyButton={removed:false,remove(){this.removed=true;}};
    const detail={classList:{added:[],add(v){this.added.push(v);}},innerHTML:''};
    const row={
      querySelectorAll(selector){return selector==='button[onclick^="editAR("]'?[legacyButton]:[];},
      querySelector(selector){return selector==='.rsub'?detail:null;}
    };
    const document={querySelectorAll(selector){return selector==='#ar-list .crow'?[row]:[];}};

    const older={id:'older',name:'Client',amount:100,amtHKD:100,cur:'HKD',desc:'June invoice',date:'2026-06-30',settled:false,dir:'r',rpKind:'income',incomeReceivable:true,catId:'freelance',catLabel:'Freelance',catIcon:'🧾',acctId:'bank',acctLabel:'Bank',acctIcon:'🏦'};
    const latest={...older,id:'latest',amount:200,amtHKD:200,desc:'July invoice',date:'2026-07-15'};
    enhanceARRecordEditing([{items:[older,latest]}]);

    const settled={...older,id:'settled',settled:true};
    const incomeTxn=addRPIncomeTxn(older);
    globalThis.result={legacyRemoved:legacyButton.removed,detailHtml:detail.innerHTML,detailClasses:detail.classList.added,settledHtml:rpDetailHTML(settled),incomeTxn};
  `
].join('\n');

const context={};
vm.createContext(context);
vm.runInContext(code,context);

assert.equal(context.result.legacyRemoved,true);
assert.deepEqual([...context.result.detailClasses],['rp-detail-list']);
assert.match(context.result.detailHtml,/editAR\(&quot;older&quot;\)/);
assert.match(context.result.detailHtml,/editAR\(&quot;latest&quot;\)/);
assert.match(context.result.detailHtml,/2026-06-30/);
assert.match(context.result.detailHtml,/2026-07-15/);
assert.match(context.result.detailHtml,/Bank/);
assert.doesNotMatch(context.result.settledHtml,/editAR\(/);

assert.equal(context.result.incomeTxn.type,'income');
assert.equal(context.result.incomeTxn.rpIncome,true);
assert.equal(context.result.incomeTxn.rpPhase,'accrual');
assert.equal(context.result.incomeTxn.fromRP,'older');
assert.equal(context.result.incomeTxn.catId,'freelance');
assert.equal(context.result.incomeTxn.date,'2026-06-30');
assert.equal(context.result.incomeTxn.nonCash,true);
assert.equal(context.result.incomeTxn.rpAccrual,true);

const filterCode=declaration('filterAR');
assert.match(filterCode,/enhanceARRecordEditing\(list\)/);

console.log('Per-record R/P editing and receivable-income tests passed.');
