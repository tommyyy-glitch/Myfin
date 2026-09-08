// Local synthetic ledgers only. No production data or network providers.
import fs from 'node:fs';import http from 'node:http';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.MYFIN_PLAYWRIGHT_PATH||'playwright');
const root=new URL('../',import.meta.url),out=new URL('../reports/home-ui-2026-09-08/',import.meta.url);
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';if(!['index.html','cloud-auth.js','cloud-ui.js'].includes(name)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(new URL(name,root)));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.MYFIN_BROWSER_EXECUTABLE});const errors=[],results=[];
try{
  for(const width of [360,390,1280]){
    const context=await browser.newContext({viewport:{width,height:960},timezoneId:'Asia/Hong_Kong',serviceWorkers:'block'});
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin,{waitUntil:'load'});
    await page.waitForFunction(()=>typeof _refreshing!=='undefined'&&!_refreshing);
    await page.evaluate(()=>{
      S=createAppState();S.automationPaused=true;S.motionMode='quiet';
      S.cloud={linked:true,pending:true,lastError:'remote-newer'};
      S.fx={...DEFAULT_FX,quoteRefresh:{sources:{stock:{ok:0,total:1}}}};FX=S.fx;
      S.accounts=[{id:'cash',kind:'cash',opening:12345,cur:'HKD'}];
      applyTheme();applyI18n();goTabIndex(0);renderHome();
    });
    assert.match(await page.locator('#home-recent-label').textContent(),/7/);
    assert.match(await page.locator('#home-recent-hint').textContent(),/不含未來/);
    assert.equal(await page.locator('#home-attention button').count(),2);
    assert.equal(await page.evaluate(()=>document.getElementById('h-recent').compareDocumentPosition(document.getElementById('pie-wrap'))&Node.DOCUMENT_POSITION_FOLLOWING),4);
    assert.equal(await page.evaluate(()=>document.getElementById('home-quick-value').textContent===fmt(balanceSheetBreakdown().quickAsset)),true);
    await page.locator('#home-priority').scrollIntoViewIfNeeded();
    await page.screenshot({path:fileURLToPath(new URL('home-'+width+'.png',out))});
    await page.locator('#home-attention button').nth(1).click();assert.equal(await page.evaluate(()=>S.activeTab),'gamble');
    await page.evaluate(()=>{goTabIndex(0);S.privacy=true;renderHome();});
    assert.equal(await page.locator('#home-quick-value').textContent(),await page.evaluate(()=>fmt(balanceSheetBreakdown().quickAsset)));
    await page.locator('#home-attention button').first().click();assert.equal(await page.evaluate(()=>S.activeTab),'settings');
    await page.evaluate(()=>{goTabIndex(0);S.cloud.pending=false;S.fx.quoteRefresh.sources.stock.ok=1;renderHome();});
    assert.equal(await page.locator('#home-attention').isVisible(),false);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    results.push({width,priority:true,reviewLinks:true});await context.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(new URL('browser-results.json',out),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
