import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function declaration(name){
 const start=html.indexOf(`function ${name}(`);assert.notEqual(start,-1,`missing ${name}`);
 const end=html.indexOf('\nfunction ',start+10);return html.slice(start,end<0?html.length:end);
}
function fixture(stats){
 const c=vm.createContext({S:{accounts:[],portfolio:[],gamble:[],privateLoans:[{principalHKD:100}]},privateLoanStats:()=>stats,
  physicalAssetsStats:()=>({pnl:0,totalCost:0,cost:0,value:0}),acctCountsInNet:()=>true,pnlNetExcluded:()=>false});
 if(html.includes('function privateLoanBoardStats('))vm.runInContext(declaration('privateLoanBoardStats'),c);
 vm.runInContext(declaration('pnlBoardTotals'),c);return c;
}
test('overview excludes unreceived accrual from both loan P&L and loan value without changing original cost',()=>{
 const stats={principal:80,accrued:8,realized:2,fx:0,asset:88,pnl:10},c=fixture(stats),before=JSON.stringify({state:c.S,stats});
 for(const filters of [[],['loan']]){
  const b=c.pnlBoardTotals(filters);assert.equal(b.pnl,2);assert.equal(b.worth,80);
  assert.equal(b.cost,100);assert.equal(b.deployed,80);assert.equal(b.pnl/b.cost*100,2);
  assert.equal(b.cash,0);assert.equal(b.margin,0);
 }
 assert.equal(JSON.stringify({state:c.S,stats}),before);
});
test('received interest and realized principal FX remain included exactly once',()=>{
 for(const fx of [-5,0,5]){
  const c=fixture({principal:0,accrued:8,realized:2,fx,asset:8,pnl:10+fx}),b=c.pnlBoardTotals(['loan']);
  assert.equal(b.pnl,2+fx);assert.equal(b.worth,0);assert.equal(b.cost,100);assert.equal(b.deployed,0);
 }
});
test('unselected or excluded loan value cannot leak accrued interest into another board group',()=>{
 const c=fixture({principal:80,accrued:8,realized:2,fx:0,asset:88,pnl:10});
 assert.equal(c.pnlBoardTotals(['stock']).pnl,0);assert.equal(c.pnlBoardTotals(['stock']).worth,0);
 c.pnlNetExcluded=()=>true;const b=c.pnlBoardTotals(['loan']);assert.equal(b.worth,0);assert.equal(b.pnl,2);
});
