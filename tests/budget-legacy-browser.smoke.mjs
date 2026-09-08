// Synthetic ledger only; block all external requests and cloud synchronization.
import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.MYFIN_PLAYWRIGHT_PATH||'playwright');
const root=new URL('../',import.meta.url);
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(!['index.html','cloud-auth.js','cloud-ui.js'].includes(name)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/html');
  res.end(fs.readFileSync(new URL(name,root)));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.MYFIN_BROWSER_EXECUTABLE});
try{
  for(const width of [390,1280]){
    const context=await browser.newContext({viewport:{width,height:960},serviceWorkers:'block'});
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin);
    await page.waitForFunction(()=>typeof _refreshing!=='undefined'&&!_refreshing);
    await page.evaluate(()=>{
      S=createAppState();S.automationPaused=true;S.motionMode='quiet';
      S.cats.push({id:'',label:'生產力',labelEn:'Productivity',icon:'💻'});
      S.txns=[{id:'legacy',type:'expense',catId:'',amount:120,cur:'HKD',amtHKD:120,date:today()},
        {id:'missing',type:'expense',amount:40,cur:'HKD',amtHKD:40,date:today()}];
      S.budget={amount:1000,mode:'custom',customStart:today(),customEnd:today(),excludedCats:[]};
      saveS();goTabIndex(3);renderBudgetSettings();
    });
    await page.locator('[data-colkey="budgetplanner"]').click();
    await page.locator('#budget-cat-summary').click();
    const button=page.locator('#budget-cat-list .tax-cat-row').filter({hasText:'生產力'}).locator('button').first();
    await button.click();
    assert.equal(await button.getAttribute('aria-pressed'),'true');
    assert.equal(await page.evaluate(()=>budgetInfo().spent),40);
    await page.reload();
    await page.waitForFunction(()=>typeof _refreshing!=='undefined'&&!_refreshing);
    await page.evaluate(()=>{goTabIndex(3);renderBudgetSettings();});
    await page.locator('#budget-cat-summary').click();
    assert.equal(await button.getAttribute('aria-pressed'),'true');
    assert.equal(await page.evaluate(()=>budgetInfo().excludedSpent),120);
    await button.click();
    assert.equal(await button.getAttribute('aria-pressed'),'false');
    assert.equal(await page.evaluate(()=>budgetInfo().spent),160);
    assert.equal(await page.evaluate(()=>S.txns[0].catId),'');
    await page.evaluate(()=>{S.cats.push({id:'',label:'Duplicate legacy'});renderBudgetSettings();});
    await button.click();
    assert.equal(await button.getAttribute('aria-pressed'),'false');
    assert.deepEqual(errors,[]);
    console.log(`Legacy budget UI: toggle, reload, exact totals, duplicate guard passed at ${width}px`);
    await context.close();
  }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
