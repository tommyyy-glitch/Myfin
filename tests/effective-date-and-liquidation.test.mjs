import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function declaration(name){
  const match=new RegExp('^function '+name+'\\(','m').exec(html);
  if(!match)return ''; // Optional new helpers allow the old behavior to fail assertions first.
  for(let end=html.indexOf('\n',match.index);end>=0;end=html.indexOf('\n',end+1)){
    const code=html.slice(match.index,end);try{new vm.Script(code);return code;}catch{}
  }
  throw Error(name);
}
function fixture(){
  const c=vm.createContext({S:{accounts:[{id:'cash',opening:1000},{id:'bank',opening:0}],txns:[],portfolio:[],priceHist:[],privateLoans:[]},
    today:()=> '2026-09-05',toHKD:n=>n,periodMatchDate:()=>true,tt:s=>s,t:s=>s,
    pnlSecForPort:p=>p.secId||p.type,ymd:d=>d.toISOString().slice(0,10),pnlSnapshotCalendarDate:at=>new Date(at).toISOString().slice(0,10)});
  vm.runInContext(['loanBasisRate','loanPaymentBasis','loanInterestSettled','loanPrincipalFx','loanPaymentPnl','recordEffective','loanPayments','loanPaymentsThrough','loanPrincipalReturned','loanInterestReceived','loanOutstandingPrincipal','loanInterestMode','loanAccruedTotal','loanAccruedOutstanding','dateOnly','parseDateOnly','acctCashTxns','acctFlows','getPeriodTxns','txnsInPeriod','pnlIncomeItems','privateLoanStats','portfolioUnrealizedSnapshot','recordPriceSnapshot','pnlUnrealizedEvents'].map(declaration).join('\n'),c);
  return c;
}
test('scheduled income, expense, transfers and debt/loan movements do not post early',()=>{
  const c=fixture();
  c.S.txns=[{date:'2026-10-01',type:'income',acctId:'cash',amtHKD:9000},{date:'2026-10-01',type:'expense',acctId:'cash',amtHKD:100},
    {date:'2026-10-01',type:'transfer',acctId:'cash',toAcctId:'bank',amtHKD:200},
    ...['ar_move','debt_move','loan_move'].map(type=>({date:'2026-10-01',type,acctId:'cash',direction:'in',amtHKD:50}))];
  const original=JSON.stringify(c.S);
  assert.equal(c.acctCashTxns('cash'),1000);assert.equal(c.acctCashTxns('bank'),0);
  assert.equal(c.acctFlows('cash').inn,0);assert.equal(c.acctFlows('cash').out,0);
  assert.equal(c.getPeriodTxns().length,0);assert.equal(c.txnsInPeriod('all').length,0);
  c.today=()=> '2026-10-01';
  assert.equal(c.acctCashTxns('cash'),9850);assert.equal(c.acctCashTxns('bank'),200);
  assert.equal(c.getPeriodTxns().length,6);assert.equal(c.acctCashTxns('cash'),9850,'posting is computed once, not appended');
  assert.equal(JSON.stringify(c.S),original,'future records must remain unchanged');
});
test('date-only boundaries preserve undated legacy cash and excluded records',()=>{
  const c=fixture();c.S.txns=[{type:'income',acctId:'cash',amtHKD:5},{date:'2026-09-05',type:'income',acctId:'cash',amtHKD:10},
    {date:'2026-09-06',type:'income',acctId:'cash',amtHKD:20},{date:'2026-09-04',type:'income',acctId:'cash',amtHKD:100,excluded:true}];
  assert.equal(c.acctCashTxns('cash'),1015);
});
test('future loan repayments leave principal and received interest intact until their date',()=>{
  const c=fixture(),loan={principalHKD:10000,startDate:'2026-09-04',dueDate:'2026-11-05',interestMode:'fixed',fixedInterestHKD:2000,
    payments:[{date:'2026-11-05',principalHKD:10000,interestHKD:2000}]};
  c.S.privateLoans=[loan];const original=JSON.stringify(loan);
  assert.equal(c.loanOutstandingPrincipal(loan),10000);assert.equal(c.loanInterestReceived(loan),0);
  assert.equal(c.privateLoanStats().asset,10000);assert.equal(c.pnlIncomeItems('all').length,0);
  assert.equal(c.loanPayments(loan).length,1,'scheduled repayments remain visible');
  c.today=()=> '2026-11-05';
  assert.equal(c.loanOutstandingPrincipal(loan),0);assert.equal(c.loanInterestReceived(loan),2000);
  assert.equal(c.loanAccruedOutstanding(loan),0);assert.equal(c.pnlIncomeItems('all')[0].v,2000);
  assert.equal(JSON.stringify(loan),original);
});
test('a scheduled loan is not an asset before its start date',()=>{
  const c=fixture(),loan={principalHKD:10000,startDate:'2026-10-01',payments:[]};
  c.S.privateLoans=[loan];assert.equal(c.privateLoanStats().asset,0);
  c.today=()=> '2026-10-01';assert.equal(c.privateLoanStats().asset,10000);
});
test('full liquidation cancels marked unrealized profit instead of adding it twice',()=>{
  const c=fixture(),p={type:'stock',costHKD:1000,valueHKD:1000};c.S.portfolio=[p];
  const at=Date.UTC(2026,8,1,21);c.recordPriceSnapshot(at);
  p.valueHKD=1200;c.recordPriceSnapshot(at+86400000);
  p.exitPrice=120;c.recordPriceSnapshot(at+2*86400000,true);
  const unrealized=c.pnlUnrealizedEvents().reduce((sum,e)=>sum+e.value,0),realized=p.valueHKD-p.costHKD;
  assert.equal(unrealized+realized,200);assert.equal(Object.keys(c.S.priceHist.at(-1).p).length,0);
  const length=c.S.priceHist.length;c.recordPriceSnapshot(at+3*86400000);
  assert.equal(c.S.priceHist.length,length,'an already empty portfolio does not create endless snapshots');
});
test('partial liquidation, mixed sections and final close conserve total profit',()=>{
  const c=fixture(),stock={type:'stock',costHKD:1000,valueHKD:1000},crypto={type:'crypto',secId:'custom',costHKD:500,valueHKD:500};
  c.S.portfolio=[stock,crypto];const at=Date.UTC(2026,8,1,21);c.recordPriceSnapshot(at);
  stock.valueHKD=1200;crypto.valueHKD=450;c.recordPriceSnapshot(at+100000);
  stock.costHKD=500;stock.valueHKD=600;c.recordPriceSnapshot(at+200000,true); // realized +100
  stock.exitPrice=1;c.recordPriceSnapshot(at+300000,true); // another +100
  crypto.exitPrice=1;c.recordPriceSnapshot(at+400000,true); // realized -50
  assert.equal(c.pnlUnrealizedEvents().reduce((sum,e)=>sum+e.value,0)+150,150);
});
test('never-funded empty portfolios do not create artificial P&L',()=>{
  const c=fixture();c.recordPriceSnapshot();assert.equal(c.S.priceHist.length,0);
});
test('passive refresh does not backfill missing historical closing snapshots',()=>{
  const c=fixture();c.S.priceHist=[{t:1000,s:1200,c:0,p:{stock:200}}];
  const before=JSON.stringify(c.S.priceHist);c.recordPriceSnapshot(2000);
  assert.equal(JSON.stringify(c.S.priceHist),before);
});
for(const action of ['confirmSell','endPosition'])test(action+' keeps realization and reversal on the same US day across month-end',()=>{
  const c=fixture(),at=Date.parse('2026-09-30T21:00:00Z');c.today=()=> '2026-10-01';
  const p={id:'stock',type:'stock',name:'Synthetic',qty:10,entryPrice:100,currentPrice:120,cur:'HKD',costHKD:1000,valueHKD:1000};
  c.S.portfolio=[p];c.S._sellId=p.id;
  Object.assign(c,{document:{getElementById:id=>({value:id==='sell-qty'?'10':'120'})},getAcct:()=>({}),acctLabel:()=>'',confirm:()=>true,
    logChange(){},saveS(){},closeM(){},renderGamble(){},renderHome(){},refreshWallet(){},recordUsesPhysicalAccount:()=>false,
    pnlCalendarAllowsMoneyPlus:()=>true,pnlCalendarRecordKind:(p,fallback)=>p.secId||fallback,pnlCalendarSectionEnabled:()=>true,pnlImportCalendarRows:()=>[]});
  vm.runInContext(['pnlUsMarketCloseDate','pnlSnapshotUsesUsMarketClose','pnlSnapshotCalendarDate','pnlCalendarEvents',action].map(declaration).join('\n')+`\nDate.now=()=>${at};`,c);
  c.recordPriceSnapshot(at-86400000);p.valueHKD=1200;c.recordPriceSnapshot(at-1000);c[action](p.id);
  const rows=c.pnlCalendarEvents();
  assert.equal(rows.filter(e=>e.date.startsWith('2026-09')).reduce((sum,e)=>sum+e.value,0),200);
  assert.equal(rows.filter(e=>e.date.startsWith('2026-10')).length,0);
  assert.equal(p.exitDate,'2026-10-01','wallet date stays local; only the calendar uses market-day grouping');
  assert.equal(Object.keys(c.S.priceHist.at(-1).p).length,0);
});
test('scheduled repayments still reserve principal and cannot be duplicated',()=>{
  const c=fixture(),elements={'loan-pay-id':{value:'loan'},'loan-pay-principal':{value:'1'},'loan-pay-interest':{value:'0'},'loan-pay-date':{value:'2026-11-05'}};
  c.document={getElementById:id=>elements[id]};const messages=[];c.showToast=m=>messages.push(m);
  c.S.privateLoans=[{id:'loan',principalHKD:10000,startDate:'2026-09-04',cur:'HKD',payments:[{date:'2026-11-05',principalHKD:10000}]}];
  vm.runInContext(declaration('saveLoanPayment'),c);c.saveLoanPayment();
  assert.equal(c.S.privateLoans[0].payments.length,1);assert.match(messages[0],/超過/);assert.equal(c.S.txns.length,0);
  elements['loan-pay-date'].value='2026-09-03';c.saveLoanPayment();assert.match(messages[1],/早於/);
});
test('actual budget spending excludes future expenses within the same budget window',()=>{
  const c=fixture();c.dateOnly=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate());
  c.budgetCfg=()=>({amount:1000,cur:'HKD',excludedCats:[]});
  c.budgetWindow=()=>({start:new Date(2026,8,1),end:new Date(2026,8,30)});
  c.txReportable=()=>true;c.balanceSheetBreakdown=()=>({quickAsset:1000});
  c.S.txns=[{date:'2026-09-05',type:'expense',amtHKD:100},{date:'2026-09-20',type:'expense',amtHKD:500}];
  vm.runInContext(declaration('budgetInfo'),c);
  assert.equal(c.budgetInfo(new Date(2026,8,5)).spent,100);
  assert.equal(c.budgetInfo(new Date(2026,8,20)).spent,600);
});
