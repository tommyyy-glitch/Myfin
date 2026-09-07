// Synthetic ledgers and intercepted provider responses; never accesses real cloud data.
import fs from 'node:fs';import http from 'node:http';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.MYFIN_PLAYWRIGHT_PATH||'playwright');
const root=new URL('../',import.meta.url),out=new URL('../reports/price-refresh-2026-09-07/',import.meta.url);fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://local').pathname.slice(1)||'index.html';if(!['index.html','cloud-auth.js','cloud-ui.js'].includes(name)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(new URL(name,root)));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.MYFIN_BROWSER_EXECUTABLE});const errors=[],results=[];
try{for(const width of [360,1280]){
  const context=await browser.newContext({viewport:{width,height:960},colorScheme:'dark',timezoneId:'Asia/Hong_Kong',serviceWorkers:'block'});let mode='offline';
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===origin)return route.continue();if(url.hostname==='api.frankfurter.dev'&&mode!=='offline')return route.fulfill({json:{rates:{USD:.125,CNY:1,JPY:20}}});return route.abort();});
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
  await page.waitForFunction(()=>typeof _refreshing!=='undefined'&&!_refreshing);
  await page.evaluate(()=>{S=createAppState();S.lang='zh';S.theme='dark';S.motionMode='quiet';S.automationPaused=true;S.fx={...DEFAULT_FX,updated:123};S.portfolio=[];S.physicalAssets=[];saveS({skipCloud:true});applyTheme();applyI18n();renderHome();});
  await page.locator('.bottom-nav .tab-btn').nth(2).click();
  const refresh=page.locator('.refresh-prices-btn:visible').first();await refresh.click();await page.waitForFunction(()=>!_refreshing);
  assert.match(await page.locator('.price-status:visible').first().innerText(),/更新失敗/);assert.equal(await page.evaluate(()=>S.fx.updated),123);
  await page.screenshot({path:fileURLToPath(new URL('offline-'+width+'.png',out))});
  mode='fx';await page.evaluate(()=>{S.portfolio=[{id:'synthetic-stock',type:'stock',name:'TEST',cur:'USD',qty:1,currentPrice:20,entryPrice:10,costHKD:80,valueHKD:160,date:today(),acctId:S.accounts[0].id}];});
  await refresh.click();await page.waitForFunction(()=>!_refreshing);assert.match(await page.locator('.price-status:visible').first().innerText(),/部分更新.*股票 0\/1/);
  assert.equal(await page.evaluate(()=>S.portfolio[0].currentPrice),20);
  assert.doesNotMatch(await page.locator('#s-gamble').innerText(),/NaN/);
  await page.screenshot({path:fileURLToPath(new URL('partial-'+width+'.png',out))});
  await page.reload();await page.waitForFunction(()=>typeof _refreshing!=='undefined'&&!_refreshing);await page.locator('.bottom-nav .tab-btn').nth(2).click();assert.match(await page.locator('.price-status:visible').first().innerText(),/部分更新/);
  await page.evaluate(()=>{S.portfolio=[];});await page.locator('.refresh-prices-btn:visible').first().click();await page.waitForFunction(()=>!_refreshing);
  assert.equal(await page.evaluate(()=>S.fx.quoteRefresh.complete),true);assert.doesNotMatch(await page.locator('.price-status:visible').first().innerText(),/失敗|部分/);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'no page overflow');
  results.push({width,offline:true,partial:true,reload:true,success:true});await context.close();
}}finally{await browser.close();server.close();}
fs.writeFileSync(new URL('results.json',out),JSON.stringify({results,errors},null,2));assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors}));
