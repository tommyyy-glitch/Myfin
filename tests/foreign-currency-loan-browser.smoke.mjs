// Synthetic local ledger only; every external request is blocked.
import fs from 'node:fs';import http from 'node:http';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.MYFIN_PLAYWRIGHT_PATH||'playwright');
const root=new URL('../',import.meta.url),out=new URL('../reports/fx-loan-2026-09-07/',import.meta.url);fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';if(!['index.html','cloud-auth.js','cloud-ui.js'].includes(name)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(new URL(name,root)));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.MYFIN_BROWSER_EXECUTABLE});const errors=[],results=[];
try{
  for(const width of [390,1280]){
    const context=await browser.newContext({viewport:{width,height:1000},timezoneId:'Asia/Hong_Kong',serviceWorkers:'block'});
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin,{waitUntil:'load'});
    await page.waitForFunction(()=>typeof _refreshing!=='undefined'&&!_refreshing);
    await page.evaluate(()=>{
      today=()=> '2026-10-01';S=createAppState();S.theme='dark';S.motionMode='quiet';S.automationPaused=true;
      S.fx={...DEFAULT_FX,USD:7.8,updated:Date.now()};FX=S.fx;S.accounts=[{id:'cash',kind:'cash',label:'Synthetic bank',cur:'HKD',opening:10000}];
      S.privateLoans=[{id:'loan',borrower:'Synthetic USD loan',principal:1000,principalHKD:8000,cur:'USD',acctId:'cash',startDate:'2026-09-01',dueDate:'2026-10-01',interestMode:'fixed',annualRate:0,fixedInterest:100,fixedInterestHKD:800,payments:[]}];
      syncLoanOpenTxn(S.privateLoans[0]);saveS({skipCloud:true});applyTheme();applyI18n();renderHome();goTabIndex(2);renderGamble();
    });
    assert.equal(await page.evaluate(()=>acctCash('cash')),2000);
    await page.locator('[onclick="openLoanPayment(\'loan\')"]').click();
    assert.match(await page.locator('#loan-pay-name').innerText(),/1,000/,'native principal, not today-converted historical HKD');
    await page.locator('#loan-pay-principal').fill('1001');await page.locator('#loan-pay-interest').fill('100');await page.locator('[onclick="saveLoanPayment()"]').click();
    assert.equal(await page.evaluate(()=>S.privateLoans[0].payments.length),0,'native overpayment rejected');
    await page.locator('#loan-pay-principal').fill('1000');await page.locator('[onclick="saveLoanPayment()"]').click();
    assert.equal(await page.evaluate(()=>acctCash('cash')),10580);
    assert.equal(await page.evaluate(()=>privateLoanStats().asset),0);assert.equal(await page.evaluate(()=>privateLoanStats().pnl),580);
    assert.equal(await page.evaluate(()=>pnlCalendarEvents().filter(e=>e.kind==='loan').reduce((s,e)=>s+e.value,0)),580);
    assert.match(await page.locator('#loan-list').innerText(),/已完成/);assert.match(await page.locator('#loan-list').innerText(),/本金匯兌損益/);
    await page.locator('[onclick="openLoanModal(\'loan\')"]').click();await page.locator('#loan-notes').fill('Synthetic reviewed note');await page.locator('[onclick="savePrivateLoan()"]').click();
    assert.equal(await page.evaluate(()=>S.privateLoans[0].principalHKD),8000);assert.equal(await page.evaluate(()=>S.privateLoans[0].notes),'Synthetic reviewed note');
    await page.locator('#loan-list').screenshot({path:fileURLToPath(new URL('settled-'+width+'.png',out))});
    await page.reload({waitUntil:'load'});await page.evaluate(()=>{today=()=> '2026-10-01';renderHome();});
    assert.equal(await page.evaluate(()=>acctCash('cash')),10580);assert.equal(await page.evaluate(()=>privateLoanStats().count),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    results.push({width,cashHKD:10580,outstanding:0,interestHKD:780,principalFxHKD:-200,pnlHKD:580,reloaded:true});await context.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(new URL('browser-results.json',out),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
