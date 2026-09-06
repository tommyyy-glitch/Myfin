// Isolated local QA only: synthetic ledgers; all external requests blocked.
import fs from 'node:fs';import http from 'node:http';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.MYFIN_PLAYWRIGHT_PATH||'playwright');
const root=new URL('../',import.meta.url),out=new URL('../reports/accounting-dates-2026-09-06/',import.meta.url);
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';if(!['index.html','cloud-auth.js','cloud-ui.js'].includes(name)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(new URL(name,root)));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.MYFIN_BROWSER_EXECUTABLE});
const errors=[],results=[];
try{
  for(const width of [390,1280]){
    const context=await browser.newContext({viewport:{width,height:960},timezoneId:'Asia/Hong_Kong',colorScheme:'dark',serviceWorkers:'block'});
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.goto(origin,{waitUntil:'load'});
    await page.evaluate(()=>{
      today=()=> '2026-09-05';S=createAppState();S.theme='dark';S.motionMode='quiet';S.automationPaused=true;
      S.fx={...DEFAULT_FX,updated:Date.now()};S.accounts=[{id:'cash',kind:'cash',label:'Synthetic bank',cur:'HKD',opening:20000}];
      S.privateLoans=[{id:'loan',borrower:'Synthetic fixed loan',principal:10000,principalHKD:10000,cur:'HKD',acctId:'cash',startDate:'2026-09-04',dueDate:'2026-11-05',interestMode:'fixed',fixedInterestHKD:2000,payments:[]}];
      syncLoanOpenTxn(S.privateLoans[0]);
      S.txns.push({id:'salary',date:'2026-10-01',type:'income',amount:9000,amtHKD:9000,cur:'HKD',acctId:'cash',note:'Synthetic future salary',catId:'income'});
      saveS({skipCloud:true});applyTheme();applyI18n();renderHome();
    });
    assert.equal(await page.evaluate(()=>acctCash('cash')),10000);
    assert.equal(await page.evaluate(()=>privateLoanStats().asset),10000);
    await page.locator('.bottom-nav .tab-btn').nth(2).click();
    await page.locator('[onclick="openLoanPayment(\'loan\')"]').click();
    await page.locator('#loan-pay-principal').fill('10000');await page.locator('#loan-pay-interest').fill('2000');await page.locator('#loan-pay-date').fill('2026-11-05');
    await page.locator('[onclick="saveLoanPayment()"]').click();
    assert.equal(await page.locator('#m-loan-pay').evaluate(el=>el.classList.contains('open')),false);
    assert.equal(await page.evaluate(()=>acctCash('cash')),10000);
    assert.equal(await page.evaluate(()=>loanInterestReceived(S.privateLoans[0])),0);
    assert.equal(await page.evaluate(()=>pnlCalendarEvents().filter(e=>e.kind==='loan').length),0);
    assert.match(await page.locator('#loan-list').innerText(),/預定還款（未入帳）/);
    await page.locator('#loan-list').screenshot({path:fileURLToPath(new URL('scheduled-loan-'+width+'.png',out))});
    // The original future salary remains available in the wallet, not Home recent records.
    await page.locator('.bottom-nav .tab-btn').nth(1).click();
    assert.equal(await page.getByText('Synthetic future salary',{exact:false}).count()>0,true);
    await page.evaluate(()=>{today=()=> '2026-11-05';renderHome();});
    assert.equal(await page.evaluate(()=>acctCash('cash')),31000);
    assert.equal(await page.evaluate(()=>loanInterestReceived(S.privateLoans[0])),2000);
    assert.equal(await page.evaluate(()=>loanOutstandingPrincipal(S.privateLoans[0])),0);
    assert.equal(await page.evaluate(()=>S.privateLoans[0].payments.length),1);
    // Seed an isolated marked stock position, then use the real sell form.
    await page.evaluate(()=>{
      today=()=> '2026-09-05';S.privateLoans=[];S.txns=[];S.pnlImports=[];S.pnlCalendarFilters=[];
      S.accounts[0].kind='invest';S.portfolio=[{id:'position',type:'stock',name:'Synthetic stock',qty:10,entryPrice:100,currentPrice:100,cur:'HKD',costHKD:1000,valueHKD:1000,acctId:'cash',date:'2026-09-01'}];
      S.priceHist=[];recordPriceSnapshot(Date.UTC(2026,8,1,21));S.portfolio[0].valueHKD=1200;S.portfolio[0].currentPrice=120;recordPriceSnapshot(Date.UTC(2026,8,2,21));
      goTabIndex(2);renderGamble();
      // Friday US close is already Saturday in Hong Kong.
      Date.now=()=>Date.parse('2026-09-04T21:00:00Z');
    });
    await page.locator('[onclick="openSell(\'position\')"]').click();
    await page.locator('#sell-qty').fill('11');await page.locator('#sell-price').fill('120');await page.locator('[onclick="confirmSell()"]').click();
    assert.equal(await page.evaluate(()=>!!S.portfolio[0].exitPrice),false,'overselling remains blocked');
    await page.locator('#sell-qty').fill('10');await page.locator('[onclick="confirmSell()"]').click();
    assert.equal(await page.evaluate(()=>S.portfolio[0].exitPrice),120);
    assert.equal(await page.evaluate(()=>pnlCalendarEvents().filter(e=>e.kind==='stock').reduce((sum,e)=>sum+e.value,0)),200);
    assert.equal(await page.evaluate(()=>pnlCalendarEvents().filter(e=>e.kind==='stock'&&e.date==='2026-09-04').reduce((sum,e)=>sum+e.value,0)),0,'realized +200 and unrealized -200 stay on Friday together');
    assert.equal(await page.evaluate(()=>pnlCalendarEvents().filter(e=>e.kind==='stock'&&e.date==='2026-09-05').length),0);
    assert.equal(await page.evaluate(()=>Object.keys(S.priceHist.at(-1).p).length),0);
    await page.locator('#pnl-cal-grid').screenshot({path:fileURLToPath(new URL('liquidation-calendar-'+width+'.png',out))});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    results.push({width,scheduledRepaymentSaved:true,receivedInterestBeforeDate:0,cashBeforeDate:10000,cashOnDate:31000,liquidationProfit:200,originalScheduledRecordsRetained:true});
    await context.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(new URL('browser-results.json',out),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
