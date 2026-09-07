// Local synthetic ledgers only. No production data or network providers.
import fs from 'node:fs';import http from 'node:http';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.MYFIN_PLAYWRIGHT_PATH||'playwright');
const root=new URL('../',import.meta.url),out=new URL('../reports/cloud-guide-2026-09-07/',import.meta.url);
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';if(!['index.html','cloud-auth.js','cloud-ui.js'].includes(name)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(new URL(name,root)));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.MYFIN_BROWSER_EXECUTABLE});const errors=[],results=[];
try{
  for(const width of [390,1280]){
    const context=await browser.newContext({viewport:{width,height:960},timezoneId:'Asia/Hong_Kong',serviceWorkers:'block'});
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin,{waitUntil:'load'});
    await page.waitForFunction(()=>typeof _refreshing!=='undefined'&&!_refreshing);
    await page.evaluate(()=>{
      S=createAppState();S.automationPaused=true;
      S.cloud={url:'https://synthetic.invalid',userId:'synthetic',vaultId:'main',linked:true,pending:true,lastError:'remote-newer'};
      window._cloudAuthClient={status:()=>({userId:'synthetic',projectUrl:'https://synthetic.invalid',email:'synthetic@example.invalid'})};
      goTabIndex(TAB_ORDER.indexOf('settings'));renderCloudAuth();
      const heading=document.querySelector('[data-i="cloudsync"]');if(heading?.classList.contains('col'))heading.click();
    });
    await page.locator('#cloud-guide').scrollIntoViewIfNeeded();
    assert.match(await page.locator('#cloud-guide-title').textContent(),/兩邊版本/);
    assert.equal(await page.locator('#cloud-conflict-preview').isVisible(),true);
    const before=await page.evaluate(()=>JSON.stringify(S));
    await page.evaluate(()=>renderCloudAuth());
    assert.equal(await page.evaluate(()=>JSON.stringify(S)),before,'rendering is read-only');
    await page.screenshot({path:fileURLToPath(new URL('cloud-guide-'+width+'.png',out))});
    // Real button reaches the existing safe-preview entry, never a force push.
    await page.evaluate(()=>{window.cloudPreviewFirst=direction=>window.testPreviewDirection=direction;});
    await page.locator('#cloud-conflict-preview').click();
    assert.equal(await page.evaluate(()=>window.testPreviewDirection),'download');
    await page.evaluate(()=>{S.cloud.pending=false;S.cloud.lastError='';renderCloudAuth();});
    assert.match(await page.locator('#cloud-guide-title').textContent(),/暫停/);
    assert.equal(await page.locator('#cloud-conflict-preview').isVisible(),false);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    results.push({width,conflictPreview:true,renderReadOnly:true});await context.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(new URL('browser-results.json',out),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
