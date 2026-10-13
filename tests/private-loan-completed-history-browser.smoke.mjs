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
const reports=new URL('../reports/loan-history/',import.meta.url);fs.mkdirSync(reports,{recursive:true});
try{
 for(const [width,height,theme] of [[360,640,'dark'],[393,852,'light'],[852,393,'dark'],[1280,900,'light']]){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',timezoneId:'Asia/Hong_Kong'});
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
  await page.evaluate(theme=>{
   today=()=> '2026-10-13';localStorage.clear();ensureProfiles();S=createAppState();S.theme=theme;S.automationPaused=true;S.fx={...DEFAULT_FX,updated:Date.now()};
   S.accounts=[{id:'cash',kind:'bank',secondaryKind:'none',label:'Synthetic bank',cur:'HKD',opening:10000}];
   const base={principal:100,principalHKD:100,cur:'HKD',acctId:'cash',startDate:'2026-09-01',dueDate:'2026-10-01',interestMode:'fixed',fixedInterest:10,fixedInterestHKD:10,payments:[]};
   S.privateLoans=[
    {...base,id:'active',borrower:'Active loan'},
    {...base,id:'interest',borrower:'Interest outstanding',payments:[{id:'ip',date:'2026-10-01',principalHKD:100}]},
    {...base,id:'future',borrower:'Future repayment',payments:[{id:'fp',date:'2099-01-01',principalHKD:100,interestHKD:10}]},
    {...base,id:'scheduled',borrower:'Scheduled loan',startDate:'2099-01-01',dueDate:'2099-02-01',fixedInterest:0,fixedInterestHKD:0},
    {...base,id:'complete',borrower:'Completed loan',payments:[{id:'cp',date:'2026-10-01',principalHKD:100,interestHKD:10}]},
    {...base,id:'fx',borrower:'Completed USD loan',cur:'USD',principalHKD:800,fixedInterestHKD:80,payments:[{id:'xp',date:'2026-10-01',principal:100,principalHKD:780,interest:10,interestHKD:78}]}
   ];
   saveS({skipCloud:true});applyTheme();goTabIndex(2);jumpPnlSection('sec:loan');
  },theme);
  const state=()=>page.evaluate(()=>JSON.stringify({ledger:profileSnapshot(),stats:privateLoanStats(),balances:balanceSheetBreakdown()}));
  const before=await state(),saved=await page.evaluate(()=>localStorage.getItem(profileKey()));
  assert.equal(await page.locator('#loan-active-list .pnl-item-icon-btn').count(),4);
  assert.equal(await page.locator('#loan-completed-list .pnl-item-icon-btn').count(),2);
  assert.equal(await page.locator('#loan-completed-history').getAttribute('open'),null);
  assert.equal(await page.locator('#loan-completed-list').isVisible(),false);
  assert.ok(await page.locator('#loan-active-list').getByText('Interest outstanding',{exact:true}).isVisible());
  await page.locator('#loan-completed-history > summary').click();
  assert.equal(await page.locator('#loan-completed-list').isVisible(),true);
  assert.match(await page.locator('#loan-completed-list').innerText(),/Completed USD loan/);
  assert.match(await page.locator('#loan-completed-list').innerText(),/本金匯兌損益/);
  await page.evaluate(()=>openLoanModal('complete'));assert.equal(await page.locator('#m-loan.open').count(),1);await page.evaluate(()=>closeM('m-loan'));
  await page.locator('#loan-completed-history > summary').click();
  assert.equal(await state(),before,'expansion and cancelled editor do not change any ledger, summaries or history');
  assert.equal(await page.evaluate(()=>localStorage.getItem(profileKey())),saved);
  await page.evaluate(()=>{const l=S.privateLoans.find(x=>x.id==='complete');window._pays=l.payments;l.payments=[];renderPrivateLoans();});
  assert.ok(await page.locator('#loan-active-list').getByText('Completed loan',{exact:true}).isVisible(),'reversed repayment reactivates record');
  await page.evaluate(()=>{S.privateLoans.find(x=>x.id==='complete').payments=window._pays;renderPrivateLoans();});
  assert.equal(await state(),before);
  await page.evaluate(()=>{S.privateLoans=S.privateLoans.filter(privateLoanCompleted);renderPrivateLoans();jumpPnlSection('sec:loan');});
  const history=await page.locator('#loan-list').boundingBox();assert.ok(history.height<=60,'all completed records occupy a single compact line');
  assert.equal(await page.locator('#loan-active-list .pnl-item-icon-btn').count(),0);
  assert.match(await page.locator('#loan-completed-history > summary').innerText(),/2/);
  await page.screenshot({path:fileURLToPath(new URL('completed-'+width+'.png',reports))});
  await page.reload();await page.evaluate(()=>{today=()=> '2026-10-13';goTabIndex(2);jumpPnlSection('sec:loan');});
  assert.equal(await page.locator('#loan-completed-history').getAttribute('open'),null,'cold reload keeps completed records collapsed');
  assert.equal(await state(),before,'stored six records survive reload intact');
  await page.evaluate(()=>{S.lang='en';renderPrivateLoans();});assert.match(await page.locator('#loan-completed-history > summary').innerText(),/Completed records/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  results.push({width,height,theme,activeAndCompleted:true,unpaidInterestVisible:true,scheduledVisible:true,compactCompletedOnly:true,readOnlyToggle:true,coldReload:true});await context.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
