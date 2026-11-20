import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function declaration(name){const start=html.indexOf('function '+name+'(');assert.notEqual(start,-1,name);const end=html.indexOf('\nfunction ',start+10);return html.slice(start,end<0?html.length:end);}
const names=['recordEffective','dateOnly','parseDateOnly','loanPayments','loanPaymentsThrough','loanBasisRate','loanPaymentBasis','loanInterestSettled','loanPrincipalFx','loanPrincipalReturned','loanInterestReceived','loanOutstandingPrincipal','loanInterestMode','loanEstimateTerms','loanExpectedInterest','loanAccruedTotal','loanAccruedOutstanding','privateLoanStats','privateLoanCompleted','privateLoanBoardStats','pnlBoardTotals','loanHistoryFieldsMatch','loanEstimateChanges','saveLoanForecast','savePrivateLoan'];
const usdLoan=()=>({id:'loan',borrower:'Synthetic',principal:1000,principalHKD:8000,fixedInterest:100,fixedInterestHKD:800,interestMode:'fixed',annualRate:0,cur:'USD',acctId:'bank',startDate:'2026-09-01',dueDate:'2026-10-01',notes:'Original',payments:[{id:'p1',date:'2026-09-11',principal:200,principalHKD:1560,interest:25,interestHKD:195}]});
function fixture(loan=usdLoan()){
 const elements={},c=vm.createContext({S:{privateLoans:[loan],txns:[{id:'open',loanId:loan.id,type:'loan_move',loanPhase:'open',date:loan.startDate,amtHKD:loan.principalHKD},{id:'paid',loanId:loan.id,loanPaymentId:'p1',type:'loan_move',loanPhase:'payment',amtHKD:1755}],accounts:[],portfolio:[],gamble:[],friends:[]},today:()=> '2026-10-01',tt:(_zh,en)=>en,t:k=>k,physicalAssetsStats:()=>({pnl:0,totalCost:0,cost:0,value:0}),acctCountsInNet:()=>true,pnlNetExcluded:()=>false});
 c.document={getElementById:id=>elements[id]||(elements[id]={value:''})};c.errors=[];c.showToast=s=>c.errors.push(s);c.saveOK=true;c.saved=0;c.closed=0;
 c.saveS=()=>{c.saved++;return c.saveOK;};c.closeM=()=>c.closed++;c.renderGamble=()=>{};c.renderHome=()=>{};c.refreshWallet=()=>{};
 c.syncLoanOpenTxn=()=>{throw Error('Forecast edits must not rebuild any cash transaction');};c.toHKD=()=>{throw Error('Forecast edits must not use current FX');};
 vm.runInContext(names.map(declaration).join('\n'),c);
 const set=(id,v)=>c.document.getElementById(id).value=String(v??'');const terms=c.loanEstimateTerms(loan);
 for(const [id,v] of Object.entries({'loan-edit-id':loan.id,'loan-borrower':loan.borrower,'loan-principal-in':loan.principal,'loan-interest-mode':c.loanInterestMode(loan),'loan-rate':terms.annualRate,'loan-fixed-interest':terms.amount,'loan-cur':loan.cur||'HKD','loan-start':loan.startDate,'loan-due':loan.dueDate,'loan-acct':loan.acctId,'loan-notes':loan.notes}))set(id,v);
 return {c,l:loan,set};
}
const closeTo=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
const financial=c=>JSON.stringify({txns:c.S.txns,loans:c.S.privateLoans.map(({interestEstimate,notes,borrower,...l})=>l)});
test('first and subsequent repayments do not lock an estimate or reprice historical FX',()=>{
 for(const count of [1,2]){
  const l=usdLoan();if(count===2)l.payments.push({id:'p2',date:'2026-09-21',principal:100,principalHKD:790,interest:5,interestHKD:39});
  const {c,set}=fixture(l),before=financial(c),paid=l.payments,board=c.pnlBoardTotals(['loan']);
  set('loan-fixed-interest',200);c.savePrivateLoan();
  assert.equal(c.errors.length,0);assert.equal(c.loanAccruedTotal(l),800);assert.equal(l.fixedInterest,100);assert.equal(l.fixedInterestHKD,800);assert.equal(l.principalHKD,8000);
  assert.equal(l.payments,paid);assert.equal(financial(c),before);assert.equal(c.closed,1);
  assert.equal(JSON.stringify(c.pnlBoardTotals(['loan'])),JSON.stringify(board),'P&L overview still excludes unpaid interest');
  const terms=c.loanEstimateTerms(l);assert.equal(terms.amount,200);assert.equal(terms.currency,'USD');assert.equal(terms.basisRate,8);
 }
});
test('lowering to below receipts or to zero never nets excess interest against unpaid principal',()=>{
 for(const estimate of [10,0]){
  const {c,l,set}=fixture(),before=financial(c);set('loan-fixed-interest',estimate);c.savePrivateLoan();
  assert.equal(c.loanExpectedInterest(l),estimate*8);assert.equal(c.loanAccruedOutstanding(l),600);assert.equal(c.loanOutstandingPrincipal(l),6400);assert.equal(c.privateLoanCompleted(l),false);assert.equal(financial(c),before);
 }
});
test('completed records stay completed across higher and lower forecasts',()=>{
 const l={id:'complete',borrower:'Done',principal:100,principalHKD:100,cur:'HKD',acctId:'bank',interestMode:'fixed',fixedInterest:10,fixedInterestHKD:10,startDate:'2026-09-01',dueDate:'2026-10-01',payments:[{date:'2026-09-11',principal:100,principalHKD:100,interest:10,interestHKD:10}]};
 const {c,set}=fixture(l),before=financial(c);assert.equal(c.privateLoanCompleted(l),true);
 set('loan-fixed-interest',20);c.savePrivateLoan();assert.equal(c.privateLoanCompleted(l),true);assert.equal(c.loanAccruedOutstanding(l),0);
 set('loan-fixed-interest',5);c.savePrivateLoan();assert.equal(c.privateLoanCompleted(l),true);assert.equal(c.loanAccruedOutstanding(l),0);assert.equal(financial(c),before);
});
test('rate estimates use remaining principal while the original annual-rate record is preserved',()=>{
 const l={...usdLoan(),interestMode:'rate',annualRate:36.5};const {c,set}=fixture(l),before=financial(c);
 set('loan-rate',18.25);c.savePrivateLoan();closeTo(c.loanExpectedInterest(l),104);closeTo(c.loanAccruedTotal(l),208);assert.equal(l.annualRate,36.5);assert.equal(financial(c),before);
});
test('legacy HKD-only, missing-native and missing-date records need no reconstruction or migration',()=>{
 for(const dates of [{startDate:'2026-09-01',dueDate:'2026-10-01'},{}]){
  const l={id:'legacy',principalHKD:10000,fixedInterestHKD:300,interestMode:'fixed',...dates,payments:[{date:'2026-09-11',principalHKD:1000,interestHKD:100}]};
  const {c,set}=fixture(l),before=financial(c);assert.equal(c.loanEstimateTerms(l).currency,'HKD');set('loan-fixed-interest',350);c.savePrivateLoan();
  assert.equal(c.errors.length,0);assert.equal(c.loanExpectedInterest(l),350);assert.equal(financial(c),before);assert.equal(l.fixedInterestHKD,300);assert.equal(l.principal,undefined);
  if(!dates.startDate){assert.equal(c.loanAccruedTotal(l),0);}
 }
});
test('invalid estimates and historical-field edits are rejected without mutating the record',()=>{
 for(const bad of ['-1','Infinity','NaN','']){const {c,set}=fixture(),before=JSON.stringify(c.S);set('loan-fixed-interest',bad);c.savePrivateLoan();assert.equal(JSON.stringify(c.S),before);assert.ok(c.errors.length);}
 for(const [id,value] of [['loan-principal-in',900],['loan-cur','HKD'],['loan-start','2026-09-02'],['loan-due','2026-11-01'],['loan-acct','other']]){
  const {c,set}=fixture(),before=JSON.stringify(c.S);set(id,value);c.savePrivateLoan();assert.equal(JSON.stringify(c.S),before);assert.ok(c.errors.length);
 }
});
test('save failure rolls back forecast metadata exactly',()=>{
 const {c,set}=fixture(),before=JSON.stringify(c.S);c.saveOK=false;set('loan-fixed-interest',200);c.savePrivateLoan();
 assert.equal(JSON.stringify(c.S),before);assert.equal(c.closed,0);
});
test('a saved optional forecast round-trips while legacy fields and receipts remain intact',()=>{
 const {c,l,set}=fixture(),before=financial(c);set('loan-fixed-interest',200);c.savePrivateLoan();
 const restored=JSON.parse(JSON.stringify(l)),next=fixture(restored);assert.equal(next.c.loanEstimateTerms(restored).amount,200);assert.equal(next.c.loanAccruedTotal(restored),800);assert.equal(financial(c),before);
});
test('malformed optional estimates consistently fall back to original terms without rewriting history',()=>{
 for(const interestMode of ['fixed','rate'])for(const bad of [{version:9},{basisRate:0},{currency:'unknown'},{annualRate:Infinity}]){
  const l={...usdLoan(),interestMode,annualRate:36.5}, {c}=fixture(l),original=c.loanAccruedTotal(l);
  l.interestEstimate={version:1,mode:interestMode,amount:9999,amountHKD:79992,basisRate:8,currency:'USD',annualRate:99,...bad};
  const before=JSON.stringify(l);assert.equal(c.loanAccruedTotal(l),original);assert.equal(c.loanEstimateTerms(l).annualRate,36.5);assert.equal(JSON.stringify(l),before);
 }
});
