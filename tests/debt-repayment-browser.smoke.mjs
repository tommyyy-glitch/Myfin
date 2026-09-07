// Isolated synthetic accounts. External services, real cloud and phone data are not used.
import fs from 'node:fs';import http from 'node:http';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.MYFIN_PLAYWRIGHT_PATH||'playwright');
const root=new URL('../',import.meta.url),out=new URL('../reports/debt-repayment-2026-09-07/',import.meta.url);fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://local').pathname.slice(1)||'index.html';if(!['index.html','cloud-auth.js','cloud-ui.js'].includes(name)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(new URL(name,root)));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.MYFIN_BROWSER_EXECUTABLE});const errors=[],results=[];
try{for(const width of [360,1280]){
  const context=await browser.newContext({viewport:{width,height:960},colorScheme:'dark',timezoneId:'Asia/Hong_Kong',serviceWorkers:'block'});await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.waitForFunction(()=>typeof _refreshing!=='undefined'&&!_refreshing);
  const id=await page.evaluate(()=>{S=createAppState();S.lang='zh';S.theme='dark';S.motionMode='quiet';S.fx={...DEFAULT_FX,updated:Date.now()};S.accounts=[{id:'bank',kind:'bank',cur:'HKD',opening:0,label:'測試銀行',icon:'🏦'}];S.txns=[];const ym=ymNum(new Date());S.debts=[{id:'test-debt',name:'測試借款',cur:'HKD',acctId:'bank',balance:1000,principal0:1000,paidTotal:0,accInterest:0,apr:12,monthly:100,day:1,lastYM:ym-1,anchorYM:ym-1,startDate:today()}];addDebtOpenMove(S.debts[0]);checkDebts();S.automationPaused=true;saveS({skipCloud:true});applyTheme();applyI18n();renderHome();return String(S.txns[0].id);});
  const state=()=>page.evaluate(()=>({cash:acctCash('bank'),balance:S.debts[0].balance,paid:S.debts[0].paidTotal,interest:S.debts[0].accInterest}));
  assert.deepEqual(await state(),{cash:900,balance:910,paid:100,interest:10});
  await page.locator('.bottom-nav .tab-btn').nth(1).click();
  const selector='button[onclick='+JSON.stringify('deleteTxn('+JSON.stringify(id)+')')+']';
  const clickDelete=async()=>{const group=page.locator('#txn-list .day-group').filter({has:page.locator(selector)});if(!await group.locator('.day-body').evaluate(el=>el.classList.contains('open')))await group.locator('.day-head').click();await group.locator(selector).click();};
  await clickDelete();assert.deepEqual(await state(),{cash:1000,balance:1010,paid:0,interest:10});
  await page.locator('#undo-toast button').click();assert.deepEqual(await state(),{cash:900,balance:910,paid:100,interest:10});
  await page.reload();await page.waitForFunction(()=>typeof _refreshing!=='undefined'&&!_refreshing);assert.deepEqual(await state(),{cash:900,balance:910,paid:100,interest:10});await page.locator('.bottom-nav .tab-btn').nth(1).click();
  // Historical rows without reversal metadata stay intact and explain why.
  await page.evaluate(()=>{delete S.txns.find(x=>x.type==='expense').debtEffect;saveS({skipCloud:true});});
  await clickDelete();assert.match(await page.locator('#app-toast').innerText(),/沒有刪除/);assert.deepEqual(await state(),{cash:900,balance:910,paid:100,interest:10});
  await page.screenshot({path:fileURLToPath(new URL('protected-legacy-'+width+'.png',out))});
  results.push({width,linkedDelete:true,undo:true,reload:true,legacyBlocked:true});await context.close();
}}finally{await browser.close();server.close();}
fs.writeFileSync(new URL('results.json',out),JSON.stringify({results,errors},null,2));assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors}));
