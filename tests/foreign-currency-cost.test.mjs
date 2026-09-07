import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function declaration(name){
  const start=html.indexOf('function '+name+'(');
  assert.notEqual(start,-1);
  for(let end=html.indexOf('\n',start);end>=0;end=html.indexOf('\n',end+1)){
    const code=html.slice(start,end);try{new vm.Script(code);return code;}catch{}
  }
  throw Error(name);
}
function fixture(patch={}){
  const elements={};
  const c=vm.createContext({S:{portfolio:[{id:'p',name:'FX test',type:'stock',qty:10,entryPrice:100,currentPrice:100,cur:'USD',costHKD:8000,valueHKD:7800,acctId:'a',...patch}],gamble:[],physicalAssets:[]},
    document:{getElementById:id=>elements[id]||(elements[id]={value:'',classList:{contains:()=>false}})},
    rate:7.8,toHKD:(a,cur)=>cur==='HKD'?a:a*c.rate,t:s=>s,today:()=> '2026-09-07',
    tt:s=>s,showToast:(s)=>c.toast=s,getAcct:()=>({id:'a'}),acctLabel:()=> 'Test',acctAvailableCash:()=>1e9,
    logChange:()=>{},recordPriceSnapshot:()=>{},saveS:()=>true,closeM:()=>{},refreshAllViews:()=>{},renderGamble:()=>{},renderHome:()=>{},refreshWallet:()=>{}});
  vm.runInContext(['confirmSell','savePortfolio','acctPositionsCash'].map(declaration).join('\n'),c);
  c.S._sellId='p';
  const fill=(id,value)=>c.document.getElementById(id).value=String(value);
  const sell=(qty,px=100)=>{fill('sell-qty',qty);fill('sell-price',px);c.confirmSell();};
  const edit=()=>{
    const p=c.S.portfolio.find(p=>p.id==='p');
    for(const [field,value] of Object.entries({type:p.type,name:p.name,qty:p.qty,entry:p.entryPrice,current:p.currentPrice,exit:p.exitPrice||'',cur:p.cur,acct:p.acctId,'edit-id':p.id,notes:'Changed note'}))fill('port-'+field,value);
    c.savePortfolio();
  };
  return {c,sell,edit,fill};
}
test('partial USD sale preserves total acquisition cost and actual cash proceeds',()=>{
  const {c,sell}=fixture();sell(5);
  assert.equal(c.S.portfolio.reduce((sum,p)=>sum+p.costHKD,0),8000);
  assert.equal(c.S.portfolio.find(p=>p.exitPrice).costHKD,4000);
  assert.equal(10000+c.acctPositionsCash('a'),5900);
  assert.equal(c.S.portfolio.find(p=>p.exitPrice).valueHKD-4000,-100);
});
test('successive fractional sales conserve every cent of historical basis',()=>{
  const {c,sell}=fixture({qty:3,costHKD:100.01});
  sell(1);c.rate=9;sell(1);c.rate=6;sell(1);
  assert.equal(Math.round(c.S.portfolio.reduce((sum,p)=>sum+p.costHKD,0)*100),10001);
  assert.equal(c.S.portfolio.every(p=>!!p.exitPrice),true);
});
test('ordinary open-position editing does not change historical cost after FX moves',()=>{
  const {c,edit}=fixture();edit();
  assert.equal(c.S.portfolio[0].costHKD,8000);
  assert.equal(c.S.portfolio[0].valueHKD,7800);
  assert.equal(c.S.portfolio[0].notes,'Changed note');
});
test('ordinary closed-position editing preserves settled proceeds as well as cost',()=>{
  const {c,edit}=fixture({exitPrice:110,exitDate:'2026-09-01',valueHKD:8800});edit();
  assert.equal(c.S.portfolio[0].costHKD,8000);
  assert.equal(c.S.portfolio[0].valueHKD,8800);
});
test('new buys still convert at purchase FX and merge by adding historical costs',()=>{
  const {c,edit,fill}=fixture();edit();
  fill('port-edit-id','');fill('port-qty',5);c.savePortfolio();
  assert.equal(c.S.portfolio.length,1);assert.equal(c.S.portfolio[0].costHKD,11900);
  assert.equal(c.S.portfolio[0].qty,15);
});
test('partial sale with missing historical basis is rejected without inventing a cost',()=>{
  const {c,sell}=fixture({costHKD:undefined});const before=JSON.stringify(c.S.portfolio);sell(5);
  assert.equal(JSON.stringify(c.S.portfolio),before);assert.ok(c.toast);
});
test('margin cash receives only proceeds minus allocated historical borrowing',()=>{
  const {c,sell}=fixture({margin:true});sell(5);
  assert.equal(c.acctPositionsCash('a'),-100);
});
test('crypto and zero-cost positions retain their stored cost on partial sale',()=>{
  for(const cost of [8000,0]){
    const {c,sell}=fixture({type:'crypto',costHKD:cost});sell(5);
    assert.equal(c.S.portfolio.reduce((sum,p)=>sum+p.costHKD,0),cost);
  }
});
test('closed positions cannot be sold twice',()=>{
  const {c,sell}=fixture({exitPrice:100});const before=JSON.stringify(c.S.portfolio);sell(5);
  assert.equal(JSON.stringify(c.S.portfolio),before);
});
test('invalid sale inputs and missing basis on ordinary edit do not mutate holdings',()=>{
  for(const value of [NaN,Infinity,-1]){
    const {c,sell}=fixture();const before=JSON.stringify(c.S.portfolio);sell(value);
    assert.equal(JSON.stringify(c.S.portfolio),before);
  }
  const {c,edit}=fixture({costHKD:null});const before=JSON.stringify(c.S.portfolio);edit();
  assert.equal(JSON.stringify(c.S.portfolio),before);assert.ok(c.toast);
});
