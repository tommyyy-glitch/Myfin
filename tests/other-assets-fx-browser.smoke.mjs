// Local synthetic ledgers only. No production data or network providers.
import fs from 'node:fs';import http from 'node:http';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.MYFIN_PLAYWRIGHT_PATH||'playwright');
const root=new URL('../',import.meta.url),out=new URL('../reports/other-assets-fx-2026-09-07/',import.meta.url);
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
      S=createAppState();S.theme='dark';S.motionMode='quiet';S.automationPaused=true;
      S.fx={...DEFAULT_FX,USD:7.8,updated:Date.now()};FX=S.fx;
      S.accounts=[{id:'cash',kind:'invest',isInvest:true,label:'Synthetic FX account',cur:'HKD',opening:10000}];
      S.portfolio=[{id:'pe',type:'pe',name:'Synthetic PE',invested:1000,valuation:1200,cur:'USD',costHKD:8000,valueHKD:9600,acctId:'cash',date:'2026-09-01'}];
      S.physicalAssets=[{id:'fa',name:'Synthetic existing asset',fundingMode:'existing',costBasis:'opening',cost:1000,costHKD:8000,marketValue:1000,cur:'USD',acctId:'cash',valuationDate:'2026-09-01',valuationHistory:[{id:'initial',date:'2026-09-01',ts:1,value:1000,source:'opening'}]}];
      saveS({skipCloud:true});applyTheme();applyI18n();renderHome();goTabIndex(2);renderGamble();
    });
    assert.equal(await page.evaluate(()=>acctCash('cash')),2000);
    await page.evaluate(()=>openPEModal('pe'));
    await page.locator('#pe-notes').fill('Synthetic reviewed note');
    await page.locator('[onclick="savePE()"]').click();
    assert.equal(await page.evaluate(()=>S.portfolio[0].notes),'Synthetic reviewed note');
    assert.equal(await page.evaluate(()=>S.portfolio[0].costHKD),8000);
    await page.evaluate(()=>openPhysicalAssetModal('fa'));
    await page.locator('#fa-market').fill('1500');
    await page.locator('#fa-save-btn').click();
    assert.equal(await page.evaluate(()=>S.physicalAssets[0].marketValue),1500);
    assert.equal(await page.evaluate(()=>S.physicalAssets[0].costHKD),8000);
    assert.equal(await page.evaluate(()=>S.physicalAssets[0].cost),1000);
    assert.equal(await page.evaluate(()=>acctCash('cash')),2000);
    await page.screenshot({path:fileURLToPath(new URL('asset-edit-'+width+'.png',out))});
    await page.reload({waitUntil:'load'});
    assert.equal(await page.evaluate(()=>acctCash('cash')),2000,'saved cash survives reload');
    assert.equal(await page.evaluate(()=>S.physicalAssets[0].costHKD),8000,'physical basis survives reload');
    assert.equal(await page.evaluate(()=>S.portfolio[0].costHKD),8000,'PE basis survives reload');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    results.push({width,cashHKD:2000,totalHistoricalCostHKD:8000,reloaded:true});await context.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(new URL('browser-results.json',out),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
