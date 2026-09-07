// Isolated local browser QA: synthetic ledger only, no cloud or external requests.
import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.MYFIN_PLAYWRIGHT_PATH||'playwright');
const root=new URL('../',import.meta.url),out=new URL('../reports/safe-account-category-2026-09-07/',import.meta.url);
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(!['index.html','cloud-auth.js','cloud-ui.js'].includes(name)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(new URL(name,root)));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.MYFIN_BROWSER_EXECUTABLE});
const errors=[],results=[];
try{
  for(const width of [360,1280]){
    const context=await browser.newContext({viewport:{width,height:960},timezoneId:'Asia/Hong_Kong',colorScheme:'dark',serviceWorkers:'block'});
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
    let acceptDelete=false;const dialogs=[];
    page.on('dialog',async d=>{dialogs.push(d.message());if(acceptDelete)await d.accept();else await d.dismiss();});
    await page.goto(origin,{waitUntil:'load'});
    await page.evaluate(()=>{
      S=createAppState();S.theme='dark';S.motionMode='quiet';S.automationPaused=true;
      S.fx={...DEFAULT_FX,updated:Date.now()};
      S.accounts=[{id:'bank',kind:'bank',label:'測試銀行',icon:'🏦',cur:'HKD',opening:1000},{id:'empty',kind:'cash',label:'測試空戶口',icon:'💳',cur:'HKD',opening:0},{id:'small',kind:'cash',label:'測試小額負數',icon:'💰',cur:'HKD',opening:-0.25}];
      S.txns=[{id:'synthetic-income',type:'income',amount:500,amtHKD:500,cur:'HKD',catId:'income',acctId:'bank',note:'測試收入',date:today()}];
      saveS({skipCloud:true});applyTheme();applyI18n();renderHome();
    });
    await page.locator('.bottom-nav .tab-btn').nth(3).click();
    const expand=async key=>{const h=page.locator('[data-colkey="'+key+'"]');if(await h.evaluate(el=>el.classList.contains('col')))await h.click();};
    await expand('allaccts');
    const deleteButton=name=>page.locator('#acct-mgr > div').filter({hasText:name}).locator('button[onclick^="deleteAcct("]');
    const beforeBlocked=await page.evaluate(()=>JSON.stringify({accounts:S.accounts,txns:S.txns}));
    await deleteButton('測試銀行').click();
    assert.match(await page.locator('#app-toast').innerText(),/不能刪除/);
    assert.equal(await page.evaluate(()=>JSON.stringify({accounts:S.accounts,txns:S.txns})),beforeBlocked);
    assert.equal(await page.evaluate(()=>acctCash('bank')),1500);
    assert.equal(dialogs.length,0,'linked account never reaches destructive confirmation');
    await page.screenshot({path:fileURLToPath(new URL('blocked-account-'+width+'.png',out))});
    // Cancel, then confirm deletion of an actually empty account through the same UI.
    await deleteButton('測試空戶口').click();
    assert.equal(await page.evaluate(()=>S.accounts.length),3);
    acceptDelete=true;await deleteButton('測試空戶口').click();
    assert.equal(await page.evaluate(()=>S.accounts.length),2);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('myfin.recovery.v1.'+profileKey())).profile.accounts.length),3);
    assert.match(dialogs.at(-1),/空戶口/);
    // Settings category creation uses independent IDs, including all-Chinese names.
    await expand('addcat');
    for(const name of ['測試分類甲','測試分類乙']){
      await page.locator('#new-cat-name').fill(name);await page.locator('[onclick="addCat()"]').click();
    }
    const ids=await page.evaluate(()=>S.cats.filter(c=>/^測試分類/.test(c.label)).map(c=>c.id));
    assert.equal(new Set(ids).size,2);assert.ok(ids.every(Boolean));
    await page.locator('#new-cat-name').fill('測試分類甲');await page.locator('[onclick="addCat()"]').click();
    assert.match(await page.locator('#app-toast').innerText(),/已存在/);
    assert.equal(await page.evaluate(()=>S.cats.filter(c=>/^測試分類/.test(c.label)).length),2);
    await page.evaluate(([a,b])=>{
      S.txns[0].catId=a;
      S.autopay=[{id:'synthetic-auto',name:'測試自動支出',amount:10,cur:'HKD',acctId:'bank',catId:b,active:false,day:1}];
      S.budget.excludedCats=[a];S.tax.excludedCats=[b];saveS({skipCloud:true});
    },ids);
    await expand('mergecats');
    for(const name of ['測試分類甲','測試分類乙','飲食'])await page.locator('#merge-chips .cat-chip').filter({hasText:name}).click();
    await page.locator('#merge-name').fill('測試合併分類');await page.locator('[onclick="mergeCats()"]').click();
    const mergedId=await page.evaluate(()=>S.cats.find(c=>c.label==='測試合併分類').id);
    assert.ok(mergedId);assert.ok(!ids.includes(mergedId));
    assert.equal(await page.locator('#merge-chips .cat-chip').filter({hasText:'測試合併分類'}).count(),1);
    assert.equal(await page.locator('#merge-chips .cat-chip').filter({hasText:'測試分類甲'}).count(),0);
    await expand('allcats');
    assert.match(await page.locator('#cat-mgr').innerText(),/測試合併分類/);
    await page.locator('#merge-chips .cat-chip').filter({hasText:'測試合併分類'}).scrollIntoViewIfNeeded();
    await page.locator('#merge-chips').screenshot({path:fileURLToPath(new URL('merged-categories-'+width+'.png',out))});
    // Reload reads the persisted profile; no second merge or ID migration occurs.
    await page.reload({waitUntil:'load'});
    const persisted=await page.evaluate(()=>({catId:S.txns[0].catId,autoCat:S.autopay[0].catId,budget:S.budget.excludedCats,tax:S.tax.excludedCats,amount:S.txns[0].amtHKD,balance:acctCash('bank'),accounts:S.accounts.length}));
    assert.deepEqual(persisted,{catId:mergedId,autoCat:mergedId,budget:[mergedId],tax:[mergedId],amount:500,balance:1500,accounts:2});
    assert.equal(await page.evaluate(()=>S.cats.some(c=>c.id==='food')),false,'merged defaults must not reappear on reload');
    assert.equal(await page.evaluate(()=>getCat('food').id),mergedId,'future default-category lookups follow the explicit merge');
    // The real Add button and inline category form still work after a settings merge.
    await page.locator('.bottom-nav .tab-btn').nth(0).click();
    await page.locator('#global-fab').click();
    assert.equal(await page.locator('#m-txn').evaluate(el=>el.classList.contains('open')),true);
    await page.locator('[onclick="toggleInlineCat()"]').click();
    await page.locator('#inline-cat-name').fill('🍜測試');await page.locator('[onclick="addInlineCat()"]').click();
    assert.equal(await page.locator('#cat-chips .cat-chip.sel').innerText().then(x=>x.includes('🍜測試')),true);
    assert.equal(await page.evaluate(()=>S.cats.find(c=>c.label==='🍜測試').id===S.selCat),true);
    await page.evaluate(()=>document.getElementById('m-txn').classList.remove('open'));
    await page.locator('.bottom-nav .tab-btn').nth(1).click();
    await page.locator('#wsub-acct').click();
    assert.match(await page.locator('#acct-bal-list').innerText(),/−HK\$0\.25/);
    await page.locator('#acct-bal-list').screenshot({path:fileURLToPath(new URL('small-negative-'+width+'.png',out))});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    results.push({width,linkedAccountProtected:true,emptyDeletionConfirmed:true,checkpointRetained:true,categoryIDsPersisted:true,mergeReferencesPreserved:true,addButtonWorking:true,smallNegativeDisplayed:true});
    await context.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(new URL('browser-results.json',out),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
