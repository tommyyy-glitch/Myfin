// Local synthetic ledgers only. No production data or network providers.
import fs from 'node:fs';import http from 'node:http';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.MYFIN_PLAYWRIGHT_PATH||'playwright');
const root=new URL('../',import.meta.url),out=new URL('../reports/pnl-ui-2026-09-07/',import.meta.url);
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
      S.pnlHidden={crypto:true};S.pnlOrder=['loan','poker'];S.customSections=[{id:'custom-test',name:'Synthetic <custom> 分區',base:'pe'}];
      applyTheme();applyI18n();goTabIndex(2);renderGamble();updateFab();
    });
    assert.equal(await page.locator('#global-fab').isVisible(),false);
    assert.equal(await page.locator('#pnl-add-entry').isVisible(),true);
    const values=await page.locator('#pnl-jump option').evaluateAll(es=>es.map(e=>e.value));
    assert.equal(values.includes('sec:crypto'),false);assert.equal(values[3],'sec:loan');assert.equal(values.includes('sec:custom-test'),true);
    await page.evaluate(()=>toggleSecBody('loan'));
    await page.locator('#pnl-jump').selectOption('sec:loan');
    assert.equal(await page.locator('#body-loan').evaluate(el=>el.classList.contains('collapsed')),false);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'sec-loan');
    await page.locator('#pnl-jump').selectOption('calendar');
    await page.evaluate(()=>{
      document.getElementById('pnl-cal-summary').innerHTML=pnlCalendarSummaryHtml([{value:123456789012.34},{value:-987654321098.76}],'Synthetic long amounts');
      document.getElementById('pnl-cal-detail').innerHTML='<div style="display:flex;gap:10px"><span>Long synthetic detail name</span><strong>−HK$123,456,789,012.34</strong></div>';
    });
    assert.equal(await page.locator('#pnl-cal-summary').evaluate(el=>el.scrollWidth>el.clientWidth),false);
    assert.equal(await page.locator('#pnl-cal-detail').evaluate(el=>el.scrollWidth>el.clientWidth),false);
    await page.screenshot({path:fileURLToPath(new URL('pnl-tools-'+width+'.png',out))});
    await page.locator('#pnl-add-entry').click();assert.equal(await page.locator('#m-txn').evaluate(el=>el.classList.contains('open')),true);
    await page.evaluate(()=>{closeM('m-txn');goTabIndex(0);updateFab();});
    assert.equal(await page.locator('#global-fab').isVisible(),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    results.push({width,jump:true,addEntry:true,longAmounts:true});await context.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(new URL('browser-results.json',out),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
