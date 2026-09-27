// Isolated comparison only. Optional MYFIN_BACKUP_PATH stays local; all external traffic is blocked.
import {fileURLToPath} from 'node:url';import fs from 'node:fs';import http from 'node:http';import cp from 'node:child_process';import assert from 'node:assert/strict';
const {chromium}=await import(process.env.MYFIN_PLAYWRIGHT_PATH||'playwright');
const root=new URL('../',import.meta.url),out=new URL('../reports/phone-ui-continuation/',import.meta.url);fs.mkdirSync(out,{recursive:true});
const baseline=cp.execFileSync('git',['show','b3ba6948:index.html'],{encoding:'utf8'}),current=fs.readFileSync(new URL('index.html',root),'utf8');
assert.deepEqual(current.replace('<script src="browser-chrome.js"></script>','').match(/<script\b[^>]*>[\s\S]*?<\/script>/g),baseline.match(/<script\b[^>]*>[\s\S]*?<\/script>/g),'Every application script must remain identical');
function equalData(a,b,label='Data mismatch'){if(JSON.stringify(a)===JSON.stringify(b))return;const paths=[];function walk(x,y,path){if(JSON.stringify(x)===JSON.stringify(y)||paths.length>=12)return;if(x&&y&&typeof x==='object'&&typeof y==='object'){for(const k of new Set([...Object.keys(x),...Object.keys(y)]))walk(x[k],y[k],path+'.'+k);}else paths.push(path);}walk(a,b,'root');throw new Error(label+'; differing paths only: '+paths.join(', '));}
const input=process.env.MYFIN_BACKUP_PATH?JSON.parse(fs.readFileSync(process.env.MYFIN_BACKUP_PATH,'utf8')).profiles[0].data:null;
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://local').pathname.slice(1)||'index.html';if(!['index.html','baseline.html','cloud-auth.js','cloud-ui.js','browser-chrome.js'].includes(name)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/html');res.end(name==='baseline.html'?baseline:fs.readFileSync(new URL(name,root)));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.MYFIN_BROWSER_EXECUTABLE});const results=[],errors=[];
async function snapshot(page){return page.evaluate(()=>JSON.stringify(profileSnapshot()));}
try{
for(const width of [360,393,852,1280])for(const theme of ['light','dark']){
 const context=await browser.newContext({viewport:{width,height:width===852?393:852},serviceWorkers:'block',timezoneId:'Asia/Hong_Kong'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const pages=[];
 for(const name of ['baseline.html','index.html']){
  const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-09-27T14:30:00Z')});await page.clock.setFixedTime(new Date('2026-09-27T14:30:00Z'));await page.goto(origin+'/'+name);
  await page.waitForFunction(()=>typeof _refreshing!=='undefined'&&!_refreshing);
  await page.evaluate(({input,theme})=>{S=Object.assign(createAppState(),input||{});S.theme=theme;S.motionMode='quiet';S.automationPaused=true;S.cloud={};S.notify=notifyDefaults();S.ai={};S.fx={...DEFAULT_FX,...S.fx,updated:Date.parse('2026-09-27T14:30:00Z')};FX=S.fx;S.setCollapsed={};if(!input){S.txns=[{id:'synthetic',date:'2026-09-26',type:'expense',amount:123.45,amtHKD:123.45,cur:'HKD',catId:'food',acctId:'cash',note:'示範生活開支'}];}applyTheme();applyI18n();goTabIndex(0);renderHome();saveS({skipCloud:true});},{input,theme});
 }
 const [old,page]=pages;
 for(const tab of [0,1,2,3]){
  for(const p of pages)await p.locator('.bottom-nav .tab-btn').nth(tab).click();
  equalData(JSON.parse(await snapshot(page)),JSON.parse(await snapshot(old)),'Persisted snapshot must match baseline after navigation');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.locator('.screen.active').getAttribute('id'),['s-home','s-wallet','s-gamble','s-settings'][tab]);
  if(tab===1){for(const pane of ['acct','ar','txn']){for(const p of pages)await p.locator('#wsub-'+pane).click();equalData(JSON.parse(await snapshot(page)),JSON.parse(await snapshot(old)));}}
  if(tab===3){
   const heading=page.locator('[data-i="databackup"]');await heading.click();await old.locator('[data-i="databackup"]').click();
   assert.ok(await page.locator('button[onclick="exportBackup()"]').isVisible());
   assert.ok((await heading.boundingBox()).height>=44);
   assert.ok((await heading.boundingBox()).width>Math.min(width,720)*.7,'settings heading spans one readable row');
   const dl=page.waitForEvent('download');await page.locator('button[onclick="exportBackup()"]').click();const file=await dl;
   const exported=JSON.parse(fs.readFileSync(await file.path(),'utf8'));
   const expected=await old.evaluate(()=>buildSafeTransfer());delete exported.createdAt;delete expected.createdAt;
   equalData(exported,expected,'Export must match baseline for every included field');
   if(!input&&width===393)await page.screenshot({path:fileURLToPath(new URL(theme+'-settings.png',out))});
  }
 }
 await page.locator('.bottom-nav .tab-btn').nth(0).click();await old.locator('.bottom-nav .tab-btn').nth(0).click();
 const money=async p=>p.locator('#h-nw,#h-asset,#h-debt,#p-spend,#p-income,#home-quick-value,#home-rp-value').allTextContents();assert.deepEqual(await money(page),await money(old));
 await page.locator('#home-add-record').click();await page.locator('#m-txn.open').waitFor();
 const close=page.locator('#m-txn .mclose');assert.ok((await close.boundingBox()).height>=44);
 if(!input&&width===393)await page.screenshot({path:fileURLToPath(new URL(theme+'-entry.png',out))});
 await close.click();equalData(JSON.parse(await snapshot(page)),JSON.parse(await snapshot(old)),'Cancelling must preserve ledger');
 results.push({width,theme,scriptsUnchanged:true,allTabs:true,exportMatchesBaseline:true,moneyAndSnapshotMatch:true});await context.close();
}
assert.deepEqual(errors,[]);console.log(JSON.stringify({privateFixture:!!input,scenarios:results.length,passed:true,errors},null,2));fs.writeFileSync(new URL(input?'private-comparison-summary.json':'browser-results.json',out),JSON.stringify({privateFixture:!!input,results,errors},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
