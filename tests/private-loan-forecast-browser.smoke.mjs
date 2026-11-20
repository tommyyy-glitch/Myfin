// Public assets and synthetic categories only. Never read an installed phone ledger.
import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.MYFIN_PLAYWRIGHT_PATH||'playwright');
const root=new URL('../',import.meta.url),allowed=new Set(['index.html','cloud-auth.js','cloud-ui.js','browser-chrome.js']);
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
 if(!['GET','HEAD'].includes(req.method)||(!allowed.has(name)&&!/^assets\/(?:wallet-icons|holding-icons|category-icons|pnl-icons)\/[\w-]+\.(?:svg|png|jpe?g|webp)$/.test(name))){res.writeHead(404);return res.end();}
 try{const data=fs.readFileSync(new URL(name,root));res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.png')?'image/png':/\.jpe?g$/.test(name)?'image/jpeg':'text/html');res.end(req.method==='HEAD'?undefined:data);}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true,executablePath:process.env.MYFIN_BROWSER_EXECUTABLE}),results=[],errors=[];
const reports=new URL('../reports/loan-forecast-local/',import.meta.url);fs.mkdirSync(reports,{recursive:true});
try{
 for(const [width,height,theme] of [[360,640,'dark'],[393,852,'light'],[852,393,'dark'],[1280,900,'light']]){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',timezoneId:'Asia/Hong_Kong'});
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
  await page.waitForFunction(()=>typeof _refreshing!=='undefined'&&!_refreshing);
  await page.evaluate(theme=>{
   today=()=> '2026-10-01';localStorage.clear();ensureProfiles();S=createAppState();S.theme=theme;S.motionMode='quiet';S.automationPaused=true;
   S.fx={...DEFAULT_FX,USD:7.8,updated:Date.now()};FX=S.fx;
   S.accounts=[{id:'cash',kind:'bank',secondaryKind:'none',label:'Synthetic bank',cur:'HKD',opening:100000}];
   const base={principal:1000,principalHKD:1000,cur:'HKD',acctId:'cash',startDate:'2026-09-01',dueDate:'2026-10-01',interestMode:'fixed',fixedInterest:100,fixedInterestHKD:100,payments:[]};
   S.privateLoans=[
    {...base,id:'partial',borrower:'Partial loan',payments:[{id:'p1',date:'2026-09-11',principalHKD:200,interestHKD:20},{id:'p2',date:'2026-09-21',principalHKD:300,interestHKD:30}]},
    {...base,id:'complete',borrower:'Completed loan',payments:[{id:'cp',date:'2026-09-21',principalHKD:1000,interestHKD:100}]},
    {...base,id:'usd',borrower:'Foreign loan',cur:'USD',principalHKD:8000,fixedInterestHKD:800,payments:[{id:'up',date:'2026-09-11',principal:200,principalHKD:1560,interest:25,interestHKD:195}]},
    {id:'legacy',borrower:'Legacy HKD-only',principalHKD:500,fixedInterestHKD:30,interestMode:'fixed',cur:'USD',payments:[{id:'lp',date:'2026-09-11',principalHKD:100,interestHKD:5}]}
   ];
   S.privateLoans.filter(l=>l.startDate).forEach(syncLoanOpenTxn);saveS({skipCloud:true});applyTheme();applyI18n();goTabIndex(2);jumpPnlSection('sec:loan');
   window.financialSnapshot=()=>JSON.stringify({loans:S.privateLoans.map(l=>{const x={...l};delete x.interestEstimate;return x;}),txns:S.txns,cash:acctCash('cash'),contract:S.privateLoans.map(l=>[loanAccruedTotal(l),loanAccruedOutstanding(l),privateLoanCompleted(l)]),board:pnlBoardTotals(['loan'])});
  },theme);
  for(const [lang,add,editTitle] of [['zh','新增私人借款','編輯私人借款'],['en','Add private loan','Edit private loan']]){
    await page.evaluate(lang=>{S.lang=lang;openLoanModal();},lang);
    assert.equal(await page.locator('#loan-modal-title').innerText(),add);
    await page.evaluate(()=>{closeM('m-loan');openLoanModal('partial');});
    assert.equal(await page.locator('#loan-modal-title').innerText(),editTitle);
    await page.evaluate(()=>closeM('m-loan'));
  }
  await page.evaluate(()=>{S.lang='zh';applyI18n();renderGamble();});
  const before=await page.evaluate(()=>financialSnapshot());
  const edit=async(id,value)=>{await page.evaluate(id=>openLoanModal(id),id);await page.locator('#loan-fixed-interest').fill(String(value));await page.locator('#m-loan .sbtn').click();assert.equal(await page.locator('#m-loan.open').count(),0);};
  await page.evaluate(()=>openLoanModal('partial'));
  assert.equal(await page.locator('#loan-principal-in').getAttribute('readonly'),'');assert.equal(await page.locator('#loan-due').getAttribute('readonly'),'');assert.equal(await page.locator('#loan-cur').isDisabled(),true);assert.equal(await page.locator('#loan-fixed-interest').isEditable(),true);
  await page.locator('#loan-fixed-interest').fill('150');await page.locator('#m-loan .sbtn').click();
  assert.equal(await page.evaluate(()=>loanExpectedInterest(S.privateLoans[0])),150);
  await edit('partial',10);assert.equal(await page.evaluate(()=>loanOutstandingPrincipal(S.privateLoans[0])),500);
  assert.match(await page.locator('#loan-active-list').innerText(),/已收利息超出估算/);
  await edit('partial',0);assert.equal(await page.evaluate(()=>loanExpectedInterest(S.privateLoans[0])),0);
  await page.evaluate(()=>openLoanModal('partial'));assert.equal(await page.locator('#loan-fixed-interest').inputValue(),'0');await page.evaluate(()=>closeM('m-loan'));
  await edit('complete',150);assert.equal(await page.locator('#loan-completed-list').getByText('Completed loan',{exact:true}).count(),1);
  await edit('complete',50);assert.equal(await page.evaluate(()=>privateLoanCompleted(S.privateLoans[1])),true);
  await page.evaluate(()=>{S.fx.USD=9.9;FX=S.fx;});await edit('usd',200);
  assert.deepEqual(await page.evaluate(()=>({e:S.privateLoans[2].interestEstimate,received:loanInterestReceived(S.privateLoans[2])})),{e:{version:1,mode:'fixed',amount:200,amountHKD:1600,currency:'USD',basisRate:8,annualRate:0},received:195});
  await page.evaluate(()=>openLoanModal('legacy'));assert.equal(await page.locator('#loan-start').inputValue(),'');assert.match(await page.locator('#loan-fixed-label').innerText(),/HKD/);
  await page.locator('#loan-fixed-interest').fill('40');await page.locator('#m-loan .sbtn').click();assert.equal(await page.locator('#m-loan.open').count(),0);
  assert.equal(await page.evaluate(()=>S.privateLoans[3].startDate),undefined);
  assert.equal(await page.evaluate(()=>financialSnapshot()),before,'forecast saves preserve original loans, ledger, balance and overview');
  const loans=await page.evaluate(()=>JSON.stringify(S.privateLoans));
  assert.equal(await page.evaluate(()=>JSON.stringify(planBackupImport(buildSafeTransfer()).profiles.find(p=>p.sourceId==='default').data.privateLoans)),loans,'transfer retains optional metadata and all history');
  await page.reload();await page.evaluate(()=>{today=()=> '2026-10-01';goTabIndex(2);jumpPnlSection('sec:loan');});
  assert.equal(await page.evaluate(()=>JSON.stringify(S.privateLoans)),loans);
  // Helpers on window disappear on reload, so independently compare the durable data.
  assert.equal(await page.evaluate(()=>loanExpectedInterest(S.privateLoans[2])),1600);
  await page.evaluate(()=>{const m=ensureProfiles();m.list.push({id:'other',name:'Other synthetic',emoji:'T'});saveProfilesMeta(m);switchProfile('other');});assert.equal(await page.evaluate(()=>S.privateLoans.length),0);
  await page.evaluate(()=>{switchProfile('default');goTabIndex(2);jumpPnlSection('sec:loan');});assert.equal(await page.evaluate(()=>JSON.stringify(S.privateLoans)),loans);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.evaluate(()=>openLoanModal());
  await page.locator('#loan-borrower').fill('New synthetic loan');
  await page.locator('#loan-principal-in').fill('100');
  await page.locator('#loan-cur').selectOption('USD');
  await page.locator('#loan-interest-mode').selectOption('fixed');
  assert.match(await page.locator('#loan-fixed-label').innerText(),/USD/);
  await page.locator('#loan-fixed-interest').fill('10');await page.locator('#loan-due').fill('2026-10-15');
  await page.locator('#m-loan .sbtn').click();
  const created=await page.evaluate(()=>S.privateLoans.find(l=>l.borrower==='New synthetic loan'));
  assert.ok(created);
  await page.evaluate(id=>openLoanModal(id),created.id);
  await page.locator('#loan-fixed-interest').fill('15');await page.locator('#loan-due').fill('2026-11-01');
  await page.locator('#m-loan .sbtn').click();
  await page.reload();
  const saved=await page.evaluate(id=>S.privateLoans.find(l=>l.id===id),created.id);
  assert.equal(saved.dueDate,'2026-11-01');
  assert.equal(saved.fixedInterestHKD,created.fixedInterestHKD);assert.equal(saved.interestEstimate.amount,15);
  results.push({width,height,theme,forecastEditable:true,historicalDataPreserved:true,backupAndReload:true,profileIsolation:true});await context.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(new URL('results.json',reports),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
