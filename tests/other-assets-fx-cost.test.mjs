import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import test from 'node:test';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function declaration(name){const start=html.indexOf('function '+name+'(');assert.notEqual(start,-1);for(let end=html.indexOf('\n',start);end>=0;end=html.indexOf('\n',end+1)){const code=html.slice(start,end);try{new vm.Script(code);return code;}catch{}}throw Error(name);}
function fixture(){
  const elements={},c=vm.createContext({S:{portfolio:[],physicalAssets:[],gamble:[]},today:()=> '2026-09-07',parseDateOnly:s=>new Date(s+'T00:00:00Z'),toHKD:(n,cur)=>n*(cur==='HKD'?1:7.8),getAcct:()=>({id:'a'}),acctLabel:()=> 'Synthetic',t:s=>s,tt:s=>s,acctAvailableCash:()=>10000,showToast:s=>c.message=s,recordPriceSnapshot:()=>{},markPhysicalReviewed:()=>{},saveS:()=>true,closeM:()=>{},renderGamble:()=>{},renderHome:()=>{},refreshWallet:()=>{},document:{getElementById:id=>elements[id]||(elements[id]={value:''})}});
  vm.runInContext(['savePE','savePhysicalAsset','physicalAssetDeductsCash','physicalMetalValueRaw','ensurePhysicalAssetHistory','recordPhysicalValuation','acctPositionsCash'].map(declaration).join('\n'),c);
  const fill=(id,v)=>c.document.getElementById(id).value=String(v);
  const pe=(old)=>{c.S.portfolio=old?[old]:[];for(const [id,v] of Object.entries({'edit-id':old?.id||'',name:'Synthetic PE',invested:1000,valuation:1200,cur:'USD',acct:'a',notes:'Reviewed'}))fill('pe-'+id,v);};
  const physical=(old,mode='purchase')=>{c.S.physicalAssets=old?[old]:[];fill('physical-edit-id',old?.id||'');for(const [id,v] of Object.entries({name:'Synthetic asset',cost:mode==='existing'&&old?.costBasis==='opening'?'':1000,market:1200,cur:'USD',acct:'a','funding-mode':mode,category:'equipment',valuedate:'2026-09-07',date:'2026-09-01',notes:'Reviewed'}))fill('fa-'+id,v);};
  return {c,pe,physical,fill};
}
const peOld=()=>({id:'pe',type:'pe',invested:1000,valuation:1200,cur:'USD',costHKD:8000,valueHKD:9600,acctId:'a'});
const faOld=()=>({id:'fa',category:'equipment',fundingMode:'purchase',costBasis:'purchase',cost:1000,costHKD:8000,marketValue:1000,cur:'USD',acctId:'a',purchaseDate:'2026-09-01',valuationDate:'2026-09-01',valuationHistory:[{id:'initial',date:'2026-09-01',ts:1,value:1000,source:'purchase'}]});
test('negative and non-finite financial inputs cannot change either ledger',()=>{
  for(const kind of ['pe','physical'])for(const value of ['-1','Infinity','garbage']){const f=fixture();f[kind](kind==='pe'?peOld():faOld());f.fill(kind==='pe'?'pe-invested':'fa-cost',value);const before=JSON.stringify(f.c.S);f.c[kind==='pe'?'savePE':'savePhysicalAsset']();assert.equal(JSON.stringify(f.c.S),before);assert.ok(f.c.message);}
});
test('legacy physical purchase without a basis label retains its cost',()=>{const f=fixture(),a=faOld();delete a.costBasis;f.physical(a);f.c.savePhysicalAsset();assert.equal(f.c.S.physicalAssets[0].costHKD,8000);});
test('repeated opening valuations preserve baseline and remain cash neutral',()=>{const f=fixture();f.physical({...faOld(),fundingMode:'existing',costBasis:'opening'},'existing');f.c.savePhysicalAsset();f.fill('fa-market',1500);f.c.savePhysicalAsset();assert.equal(f.c.S.physicalAssets[0].costHKD,8000);assert.equal(f.c.S.physicalAssets[0].cost,1000);assert.equal(f.c.acctPositionsCash('a'),0);});
test('a missing original opening baseline cannot be replaced by the latest value',()=>{const f=fixture();f.physical({...faOld(),cost:null,fundingMode:'existing',costBasis:'opening'},'existing');const before=JSON.stringify(f.c.S);f.c.savePhysicalAsset();assert.equal(JSON.stringify(f.c.S),before);assert.ok(f.c.message);});
test('PE valuation and notes edit preserves historical cost and cash',()=>{
  const {c,pe}=fixture();pe(peOld());c.savePE();assert.equal(c.S.portfolio[0].costHKD,8000);assert.equal(c.S.portfolio[0].valueHKD,9360);assert.equal(c.acctPositionsCash('a'),-8000);
});
test('closed PE ordinary edit preserves settled cash',()=>{
  const {c,pe}=fixture();pe({...peOld(),exitPrice:1});c.savePE();assert.equal(c.S.portfolio[0].valueHKD,9600);assert.equal(c.acctPositionsCash('a'),1600);
});
test('purchased physical asset keeps cost while recording a new valuation',()=>{
  const {c,physical}=fixture();physical(faOld());c.savePhysicalAsset();const a=c.S.physicalAssets[0];assert.equal(a.costHKD,8000);assert.equal(c.acctPositionsCash('a'),-8000);assert.equal(a.valuationHistory.at(-1).value,1200);assert.equal(a.valuationHistory[0].value,1000);
});
test('existing physical opening baseline remains fixed and never deducts cash',()=>{
  const {c,physical}=fixture();physical({...faOld(),fundingMode:'existing',costBasis:'opening'},'existing');c.savePhysicalAsset();const a=c.S.physicalAssets[0];assert.equal(a.cost,1000);assert.equal(a.costHKD,8000);assert.equal(a.marketValue,1200);assert.equal(c.acctPositionsCash('a'),0);
});
test('existing asset with known cost also preserves historical cost without cash deduction',()=>{
  const {c,physical}=fixture();physical({...faOld(),fundingMode:'existing'},'existing');c.savePhysicalAsset();assert.equal(c.S.physicalAssets[0].costHKD,8000);assert.equal(c.acctPositionsCash('a'),0);
});
test('new PE and physical purchases continue to use the current entry conversion',()=>{
  const {c,pe,physical}=fixture();pe();c.savePE();assert.equal(c.S.portfolio[0].costHKD,7800);physical();c.savePhysicalAsset();assert.equal(c.S.physicalAssets[0].costHKD,7800);
});
test('missing historical cost is not silently reconstructed at current FX',()=>{
  for(const kind of ['pe','physical']){const f=fixture();f[kind]({... (kind==='pe'?peOld():faOld()),costHKD:null});const before=JSON.stringify(f.c.S);f.c[kind==='pe'?'savePE':'savePhysicalAsset']();assert.equal(JSON.stringify(f.c.S),before);assert.ok(f.c.message);}
});
