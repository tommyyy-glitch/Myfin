import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function declaration(name){
  const start=html.indexOf(`function ${name}(`);
  assert.notEqual(start,-1,`missing ${name}`);
  const end=html.indexOf('\nfunction ',start+10);
  return html.slice(start,end<0?html.length:end);
}
function totalsHarness(people){
  const c=vm.createContext({S:{people}});
  for(const name of ['personKey','rpSignedHKD','rpIsActive','rpGroups','rpAssetTotal','rpDebtTotal'])vm.runInContext(declaration(name),c);
  return c;
}
test('hidden unpaid rows stop offsetting visible counterparty balances without changing any record',()=>{
  const people=[
    {id:'old',name:'Alex',dir:'p',amount:500,amtHKD:500,excluded:true,settled:false},
    {id:'new',name:'Alex',dir:'r',amount:100,amtHKD:100,settled:false},
    {id:'visible-pay',name:'Sam',dir:'p',amount:40,amtHKD:40,settled:false},
    {id:'hidden-recv',name:'Kim',dir:'r',amount:900,amtHKD:900,excluded:true,settled:false},
    {id:'settled',name:'Paid',dir:'p',amtHKD:0,settled:true},
    {id:'dead',name:'Bad',dir:'r',amtHKD:300,dead:true},
  ];
  const c=totalsHarness(people),before=JSON.stringify(people);
  assert.equal(c.rpAssetTotal(),100);
  assert.equal(c.rpDebtTotal(),40);
  assert.equal(JSON.stringify(people),before);
  people[0].excluded=false;
  assert.equal(c.rpAssetTotal(),0);
  assert.equal(c.rpDebtTotal(),440);
});

function mutationHarness(){
  const c=totalsHarness([{id:7,name:'Alex',dir:'p',amount:120,amtHKD:120,originalAmount:150,originalAmtHKD:150,settled:false,settleTxnIds:['paid']}]);
  Object.assign(c,{saved:true,renders:0,filters:[],toasts:[],tt:(_zh,en)=>en});
  c.S.txns=[{id:'open',fromRP:7,type:'ar_move',direction:'in',amtHKD:150},{id:'paid',fromRP:7,type:'ar_move',direction:'out',amtHKD:30,rpPhase:'settle'}];
  c.saveS=()=>c.saved;c.refreshAllViews=()=>c.renders++;c.filterAR=(v)=>c.filters.push(v);c.showToast=(v)=>c.toasts.push(v);
  vm.runInContext(declaration('toggleARExcluded'),c);return c;
}
test('hide and restore change only visibility, leaving partial payments, cash movements and outstanding status intact',()=>{
  const c=mutationHarness(),before=JSON.stringify(c.S.txns),record=JSON.stringify(c.S.people[0]);
  c.toggleARExcluded('7');
  assert.equal(c.S.people[0].excluded,true);assert.equal(c.rpDebtTotal(),0);assert.equal(c.S.people[0].settled,false);
  assert.equal(JSON.stringify(c.S.txns),before);
  c.S._arFilter='hidden';c.toggleARExcluded(7);
  assert.equal(c.rpDebtTotal(),120);assert.equal(c.filters.at(-1),'hidden');
  const {excluded,...restored}=c.S.people[0];assert.equal(JSON.stringify(restored),record);assert.equal(JSON.stringify(c.S.txns),before);
});
test('a failed save rolls back the visibility flag, including an absent legacy flag',()=>{
  const c=mutationHarness();c.saved=false;
  const original=JSON.stringify(c.S);c.toggleARExcluded(7);assert.equal(JSON.stringify(c.S),original);assert.equal(c.renders,0);
  c.S.people[0].excluded=true;c.toggleARExcluded(7);assert.equal(c.S.people[0].excluded,true);
  c.S.people[0].excluded=false;c.toggleARExcluded(7);assert.equal(c.S.people[0].excluded,false);
});
test('hide cannot convert settled/dead records into unpaid records or invent missing IDs',()=>{
  const c=mutationHarness();c.S.people[0].settled=true;const before=JSON.stringify(c.S);
  c.toggleARExcluded(7);c.toggleARExcluded('missing');assert.equal(JSON.stringify(c.S),before);assert.equal(c.renders,0);
});
test('deleting visible records for a person preserves hidden siblings and their shared group cash movement',()=>{
  const c=mutationHarness();
  c.S.people=[{id:'visible',name:'Alex',groupId:'bill'},{id:'hidden',name:'Alex',groupId:'bill',excluded:true}];
  c.S.txns=[{id:'v',type:'ar_move',fromRP:'visible'},{id:'h',type:'ar_move',fromRP:'hidden'},{id:'bill-cash',type:'ar_move',groupId:'bill'}];
  c.confirm=()=>true;c.t=k=>k;c.setWalletPane=()=>{};c.txIsRPFlow=tx=>tx.type==='ar_move';
  c.removeRPMovesFor=ids=>{c.S.txns=c.S.txns.filter(tx=>!ids.includes(tx.fromRP));};
  vm.runInContext(declaration('deleteARGroup'),c);c.deleteARGroup('alex','visible');
  assert.deepEqual(c.S.people.map(p=>p.id),['hidden']);assert.deepEqual(c.S.txns.map(tx=>tx.id),['h','bill-cash']);
});
