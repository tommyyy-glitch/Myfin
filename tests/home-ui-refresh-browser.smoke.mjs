import fs from 'node:fs';import http from 'node:http';import cp from 'node:child_process';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.MYFIN_PLAYWRIGHT_PATH||'playwright');
const root=new URL('../',import.meta.url),out=new URL('../reports/uiux-home-preview/',import.meta.url);
fs.mkdirSync(out,{recursive:true});
const baseline=cp.execFileSync('git',['show','myfin-pre-uiux-2026-09-27:index.html'],{encoding:'utf8'});
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://local').pathname.slice(1)||'index.html';if(!['index.html','baseline.html','cloud-auth.js','cloud-ui.js'].includes(name)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/html');res.end(name==='baseline.html'?baseline:fs.readFileSync(new URL(name,root)));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.MYFIN_BROWSER_EXECUTABLE});const results=[],errors=[];
async function seed(page,theme){await page.evaluate(theme=>{
  S=createAppState();S.theme=theme;S.motionMode='quiet';S.automationPaused=true;S.period='month';
  S.accounts.find(a=>a.id==='cash').opening=68000;
  S.fx={...DEFAULT_FX,updated:Date.parse('2026-09-27T12:00:00Z')};FX=S.fx;
  S.budget={...S.budget,amount:10000,startDay:1,cutoffDay:31};
  S.txns=[{id:'demo-income',type:'income',date:'2026-09-20',amount:22000,amtHKD:22000,cur:'HKD',acctId:'cash',catId:'income',note:'示範薪金'},
  {id:'demo-expense',type:'expense',date:'2026-09-26',amount:1240.5,amtHKD:1240.5,cur:'HKD',acctId:'cash',catId:'food',catLabel:'飲食',note:'示範生活開支'}];
  applyTheme();applyI18n();goTabIndex(0);renderHome();saveS({skipCloud:true});
},theme);}
async function inspect(page){return page.evaluate(()=>({money:Object.fromEntries(['h-nw','h-asset','h-debt','p-spend','p-income','p-cf-lbl','home-quick-value','home-rp-value','h-budget-card'].map(id=>[id,document.getElementById(id).textContent])),snapshot:JSON.stringify(profileSnapshot()),stored:localStorage.getItem(profileKey())}));}
try{
for(const [width,height] of [[360,800],[393,852],[852,393],[1280,900]])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',timezoneId:'Asia/Hong_Kong'});
  await context.route('**/*',route=>(new URL(route.request().url()).origin===origin||(process.env.MYFIN_VISUAL_FONTS==='1'&&route.request().url().startsWith('https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.44.0/')))?route.continue():route.abort());
  const pages=[];
  for(const name of ['baseline.html','index.html']){
    const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));
    await page.clock.install({time:new Date('2026-09-27T12:00:00Z')});await page.goto(origin+'/'+name,{waitUntil:'load'});
    await page.waitForFunction(()=>typeof _refreshing!=='undefined'&&!_refreshing);
    await seed(page,theme);
    if(process.env.MYFIN_VISUAL_FONTS==='1')await page.evaluate(()=>document.fonts.ready);
  }
  const [old,page]=pages,previous=await inspect(old),current=await inspect(page);
  assert.deepEqual(current,previous,'UI refresh must produce identical money, snapshot and saved data');
  assert.equal(await page.locator('#global-fab').isVisible(),false);
  assert.ok(await page.locator('#home-add-record').isVisible());
  const button=await page.locator('#home-add-record').boundingBox();assert.ok(button.height>=44);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const budget=await page.locator('#h-budget-card').boundingBox(),beforeBudget=await old.locator('#h-budget-card').boundingBox();
  assert.ok(budget.y<beforeBudget.y,'budget must be earlier on screen');
  if(width===393){await page.screenshot({path:fileURLToPath(new URL(theme+'-after.png',out))});await old.screenshot({path:fileURLToPath(new URL(theme+'-before.png',out))});}
  await page.locator('#home-add-record').click();await page.locator('#m-txn.open').waitFor();
  await page.evaluate(()=>closeM('m-txn'));
  assert.equal((await inspect(page)).stored,current.stored,'opening/cancelling entry must not change stored ledger');
  await page.evaluate(()=>{goTabIndex(1);setWalletPane('txn');});assert.ok(await page.locator('#global-fab').isVisible(),'wallet add still available');
  await page.evaluate(()=>goTabIndex(0));
  await page.locator('#privacy-btn').click();assert.ok((await page.locator('#h-nw').innerText()).includes('•'));await page.locator('#privacy-btn').click();
  await page.evaluate(()=>{S.txns[0].amount=S.txns[0].amtHKD=123456789012.34;renderHome();});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'long amounts must not overflow');
  const overlap=await page.locator('.budget-top').evaluate(el=>{const [a,b]=[...el.children].map(c=>c.getBoundingClientRect());return a.right>b.left+1;});assert.equal(overlap,false);
  results.push({width,height,theme,monetaryAndStoredDataIdentical:true,budgetMovedUp:Math.round(beforeBudget.y-budget.y),addCancel:true,longAmountNoOverflow:true});
  await context.close();
}
assert.deepEqual(errors,[]);fs.writeFileSync(new URL('browser-results.json',out),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
