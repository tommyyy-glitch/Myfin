import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';import test from 'node:test';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function declaration(name){const start=html.indexOf('function '+name+'(');if(start<0)return '';for(let end=html.indexOf('\n',start);end>=0;end=html.indexOf('\n',end+1)){const code=html.slice(start,end);try{new vm.Script(code);return code;}catch{}}throw Error(name);}
function fixture(){const c=vm.createContext({S:{privateLoans:[]},today:()=> '2026-10-01'});vm.runInContext(['recordEffective','dateOnly','parseDateOnly','loanPayments','loanPaymentsThrough','loanBasisRate','loanPaymentBasis','loanInterestSettled','loanPrincipalFx','loanPaymentPnl','loanPrincipalReturned','loanInterestReceived','loanOutstandingPrincipal','loanInterestMode','loanAccruedTotal','loanAccruedOutstanding','privateLoanStats'].map(declaration).join('\n'),c);return c;}
const loan=()=>({principal:1000,principalHKD:8000,cur:'USD',interestMode:'fixed',fixedInterest:100,fixedInterestHKD:800,startDate:'2026-09-01',dueDate:'2026-10-01',payments:[]});
test('native principal and fixed interest paid in full leave no phantom balance',()=>{
  const c=fixture(),l=loan();l.payments=[{date:'2026-10-01',principal:1000,principalHKD:7800,interest:100,interestHKD:780}];c.S.privateLoans=[l];
  assert.equal(c.loanOutstandingPrincipal(l),0);assert.equal(c.loanAccruedOutstanding(l),0);
  assert.equal(c.loanInterestReceived(l),780);assert.equal(c.privateLoanStats().pnl,580);assert.equal(c.privateLoanStats().count,0);
});
test('partial repayment releases proportional cost rather than cash converted at new FX',()=>{
  const c=fixture(),l=loan();l.payments=[{date:'2026-09-15',principal:500,principalHKD:4100,interest:0,interestHKD:0}];
  assert.equal(c.loanOutstandingPrincipal(l),4000);assert.equal(c.loanPrincipalFx(l),100);
});
test('scheduled repayments stay out of balances and FX profit until their date',()=>{
  const c=fixture(),l=loan();l.payments=[{date:'2026-11-01',principal:1000,principalHKD:7800,interest:100,interestHKD:780}];
  assert.equal(c.loanOutstandingPrincipal(l),8000);assert.equal(c.loanAccruedOutstanding(l),800);assert.equal(c.loanPrincipalFx(l),0);
});
test('HKD-only legacy records retain their historical fallback without mutation',()=>{
  const c=fixture(),l={principalHKD:10000,interestMode:'fixed',fixedInterestHKD:300,startDate:'2026-09-01',dueDate:'2026-10-01',payments:[{date:'2026-10-01',principalHKD:10000,interestHKD:300}]};const original=JSON.stringify(l);
  assert.equal(c.loanOutstandingPrincipal(l),0);assert.equal(c.loanAccruedOutstanding(l),0);assert.equal(c.loanPrincipalFx(l),0);assert.equal(JSON.stringify(l),original);
});
test('rate interest reduces the principal basis after a foreign-currency repayment',()=>{
  const c=fixture(),l={...loan(),interestMode:'rate',annualRate:36.5};l.payments=[{date:'2026-09-11',principal:500,principalHKD:3900,interest:0,interestHKD:0}];
  assert.equal(c.loanAccruedTotal(l,'2026-09-21'),120);
});
test('same-day principal repayment stops rate interest from day one',()=>{
  const c=fixture(),l={...loan(),interestMode:'rate',annualRate:36.5};l.payments=[{date:l.startDate,principal:1000,principalHKD:7800}];
  assert.equal(c.loanAccruedTotal(l),0);
});
function paymentFixture(){
  const c=fixture(),elements={};c.S.privateLoans=[{id:'l',...loan()}];c.S.txns=[];
  c.document={getElementById:id=>elements[id]||(elements[id]={value:''})};
  c.toHKD=(n,cur)=>n*(cur==='HKD'?1:7.8);c.tt=s=>s;c.t=s=>s;c.getAcct=()=>({});c.acctLabel=()=> 'Synthetic';
  c.showToast=s=>c.message=s;c.saveS=()=>true;c.closeM=()=>{};c.renderGamble=()=>{};c.renderHome=()=>{};c.refreshWallet=()=>{};
  const fill=(id,v)=>c.document.getElementById(id).value=String(v);
  fill('loan-pay-id','l');fill('loan-pay-date','2026-10-01');fill('loan-pay-principal',1000);fill('loan-pay-interest',100);
  vm.runInContext(declaration('saveLoanPayment'),c);return {c,fill,l:c.S.privateLoans[0]};
}
test('repayment form uses original units even when exchange rate rises',()=>{
  const {c,l}=paymentFixture();c.toHKD=n=>n*8.2;c.saveLoanPayment();
  assert.equal(l.payments.length,1);assert.equal(c.loanOutstandingPrincipal(l),0);assert.equal(c.S.txns[0].amtHKD,9020);
  assert.equal(c.privateLoanStats().pnl,1020);
});
test('future native repayment reserves all principal and blocks a second repayment',()=>{
  const {c,l,fill}=paymentFixture();fill('loan-pay-date','2026-11-01');c.saveLoanPayment();
  assert.equal(c.loanOutstandingPrincipal(l),8000);
  fill('loan-pay-date','2026-10-01');fill('loan-pay-principal',1);fill('loan-pay-interest',0);c.saveLoanPayment();
  assert.equal(l.payments.length,1);assert.equal(c.S.txns.length,1);assert.match(c.message,/超過/);
});
test('failed repayment save restores both payment list and wallet transactions',()=>{
  const {c,l}=paymentFixture();const before=JSON.stringify(c.S);c.saveS=()=>false;c.saveLoanPayment();
  assert.equal(JSON.stringify(c.S),before);assert.equal(l.payments.length,0);
});
test('invalid amount and foreign loan without original principal cannot create repayments',()=>{
  const {c,l,fill}=paymentFixture();fill('loan-pay-principal','Infinity');c.saveLoanPayment();assert.equal(l.payments.length,0);
  fill('loan-pay-principal',1000);delete l.principal;c.saveLoanPayment();assert.equal(l.payments.length,0);assert.match(c.message,/缺少/);
  l.principal=1000;c.toHKD=()=>Infinity;c.saveLoanPayment();assert.equal(l.payments.length,0);assert.match(c.message,/換算/);
});
test('loan notes edit freezes historical principal and fixed-interest amounts',()=>{
  const {c,l,fill}=paymentFixture();Object.assign(l,{borrower:'Test',acctId:'bank',annualRate:0});
  c.S.friends=[{id:'friend',name:'Test'}];c.friendNameKey=s=>s;c.acctCash=()=>10000;c.syncLoanOpenTxn=()=>{};
  for(const [id,value] of Object.entries({'edit-id':'l',borrower:'Test','principal-in':1000,'interest-mode':'fixed',rate:0,'fixed-interest':100,cur:'USD',start:l.startDate,due:l.dueDate,acct:'bank',notes:'Reviewed'}))fill('loan-'+id,value);
  vm.runInContext(declaration('savePrivateLoan'),c);c.savePrivateLoan();
  assert.equal(l.principalHKD,8000);assert.equal(l.fixedInterestHKD,800);assert.equal(l.notes,'Reviewed');
  c.saveLoanPayment();const before=JSON.stringify(l);fill('loan-principal-in',900);c.savePrivateLoan();assert.equal(JSON.stringify(l),before);assert.match(c.message,/不可/);
});
test('all-period P&L item includes actual interest and realized principal FX once',()=>{
  const {c,l}=paymentFixture();c.saveLoanPayment();c.S.portfolio=[];c.S.gamble=[];c.S.physicalAssets=[];
  c.periodMatchDate=()=>true;vm.runInContext(declaration('pnlIncomeItems'),c);
  assert.equal(c.pnlIncomeItems('all').reduce((sum,r)=>sum+r.v,0),580);
});
