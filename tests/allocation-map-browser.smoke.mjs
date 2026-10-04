// Public assets and synthetic categories only. Never read an installed phone ledger.
import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.MYFIN_PLAYWRIGHT_PATH||'playwright');
const root=new URL('../',import.meta.url),allowed=new Set(['index.html','cloud-auth.js','cloud-ui.js','browser-chrome.js']);
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
 if(!['GET','HEAD'].includes(req.method)||(!allowed.has(name)&&!/^assets\/(?:wallet-icons|holding-icons|category-icons|pnl-icons)\/[\w-]+\.(?:svg|png|jpe?g|webp)$/.test(name))){res.writeHead(404);return res.end();}
 try{const data=fs.readFileSync(new URL(name,root));res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.png')?'image/png':/\.jpe?g$/.test(name)?'image/jpeg':'text/html');res.end(req.method==='HEAD'?undefined:data);}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true,executablePath:process.env.MYFIN_BROWSER_EXECUTABLE}),results=[],errors=[];
const reports=new URL('../reports/allocation-map/',import.meta.url);fs.mkdirSync(reports,{recursive:true});
try{
 for(const [width,height,theme] of [[360,640,'dark'],[393,852,'light'],[852,393,'dark'],[1280,900,'light']]){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
  await page.evaluate(theme=>{
   localStorage.clear();ensureProfiles();S=createAppState();S.theme=theme;S.automationPaused=true;S.fx={...DEFAULT_FX,updated:Date.now()};
   S.accounts=[{id:'invest',kind:'invest',secondaryKind:'none',opening:50000,cur:'HKD',label:'Synthetic investments'}];S.txns=[];
   S.portfolio=Array.from({length:16},(_,i)=>({id:'p'+i,name:i===2?'Unsafe <img src=x onerror=alert(1)>':i%2?'Bitcoin':'VOO',type:i%2?'crypto':'stock',acctId:'invest',costHKD:i<2?9500:100,valueHKD:i<2?10000:i===2?500:(18-i)*10,cur:'HKD',date:today()}));
   S.portfolio.push({id:'margin',name:'Synthetic margin',type:'stock',margin:true,costHKD:100,valueHKD:130,acctId:'invest'});
   S.physicalAssets=[{id:'phone',name:'iPhone',costHKD:200,marketValue:100,cur:'HKD',costBasis:'opening',fundingMode:'existing',valuationHistory:[{date:today(),value:100}]}];
   S.privateLoans=[{id:'loan',borrower:'Synthetic borrower',principal:100,principalHKD:100,cur:'HKD',acctId:'invest',startDate:'2025-01-01',dueDate:'2025-02-01',interestMode:'fixed',fixedInterest:20,fixedInterestHKD:20,payments:[]}];
   saveS({skipCloud:true});applyTheme();goTab('gamble',document.querySelectorAll('.bottom-nav .tab-btn')[2]);
  },theme);
  await page.waitForFunction(()=>document.querySelectorAll('.allocation-tile').length>16);
  const before=await page.evaluate(()=>JSON.stringify(profileSnapshot()));const stored=await page.evaluate(()=>localStorage.getItem(profileKey()));
  const data=await page.evaluate(()=>document.getElementById('pnl-allocation-map')._allocationData);
  assert.equal(data.length,20,'all 17 holdings, physical asset, loan and idle cash');
  assert.equal(data.find(d=>d.label==='Synthetic borrower')._pnl,20,'loan colour includes recorded accrual');
  assert.equal(data.find(d=>d.label==='Synthetic margin').val,30,'margin area is equity');
  assert.equal(await page.locator('.allocation-tile').count(),data.length);
  const tiles=await page.locator('.allocation-tile').evaluateAll(rows=>rows.map(b=>({index:+b.dataset.index,w:b.getBoundingClientRect().width,h:b.getBoundingClientRect().height,icon:!!b.querySelector('.allocation-icon'),direction:b.className})));
  assert.ok(tiles.some(b=>data[b.index].val/data.reduce((n,d)=>n+d.val,0)<.015&&b.icon),'small allocation under old cutoff still shows icon');
  for(const b of tiles)assert.equal(b.icon,Math.floor(Math.min(34,b.w-4,b.h-4))>=10,'icon governed by available space');
  assert.ok(tiles.some(b=>b.direction.includes('gain')));assert.ok(tiles.some(b=>b.direction.includes('loss')));assert.ok(tiles.some(b=>b.direction.includes('flat')));
  await page.evaluate(()=>Promise.all([...document.querySelectorAll('#pnl-allocation-map img')].map(i=>i.decode())));
  await page.locator('.allocation-tile[data-index="2"]').evaluate(el=>el.click());
  assert.ok((await page.locator('#pnl-allocation-detail').textContent()).includes('Unsafe <img'));
  assert.equal(await page.locator('#pnl-allocation-detail img').count(),0,'untrusted labels stay text');
  await page.locator('.allocation-list summary').evaluate(el=>el.click());assert.equal(await page.locator('.allocation-list-row').count(),data.length);
  await page.locator('.allocation-list-row').last().evaluate(el=>el.click());assert.equal(await page.locator('.allocation-tile.selected').count(),1);
  assert.equal(await page.evaluate(()=>JSON.stringify(profileSnapshot())),before,'tap and expansion never edit data');
  assert.equal(await page.evaluate(()=>localStorage.getItem(profileKey())),stored);
  await page.evaluate(()=>{S.privacy=true;renderGamble();});assert.ok((await page.locator('.allocation-tile').first().getAttribute('aria-label')).includes('••••'));
  assert.equal(await page.locator('#pnl-allocation-map').evaluate(el=>el.innerHTML.includes('HK$')),false,'privacy hides amounts in titles too');
  await page.evaluate(()=>{S.privacy=false;S.dispCur='USD';renderGamble();});assert.ok((await page.locator('.allocation-tile').first().getAttribute('aria-label')).includes('US$'));
  await page.evaluate(()=>{S.dispCur='HKD';S.pnlPieFilters=['crypto'];renderGamble();});assert.equal(await page.locator('.allocation-tile').count(),8,'class filter keeps crypto only');
  await page.evaluate(()=>{S.pnlPieFilters=['poker'];renderGamble();});assert.equal(await page.locator('.allocation-tile').count(),0);assert.match(await page.locator('#pnl-allocation-map').textContent(),/未有資產|No assets/);
  await page.evaluate(()=>{S.pnlPieFilters=[];renderGamble();});assert.equal(await page.evaluate(()=>JSON.stringify(profileSnapshot())),before);
  await page.evaluate(()=>{document.querySelector('.allocation-list').open=false;document.getElementById('pnl-allocation-map').scrollIntoView({block:'center'});});
  await page.screenshot({path:fileURLToPath(new URL('allocation-'+width+'.png',reports))});
  await page.setViewportSize({width:width+20,height});await page.waitForFunction(()=>{const el=document.getElementById('pnl-allocation-map');return [...el.querySelectorAll('button')].every(b=>parseFloat(b.style.left)+parseFloat(b.style.width)<=el.clientWidth+.1);});
  await page.reload();await page.evaluate(()=>goTab('gamble',document.querySelectorAll('.bottom-nav .tab-btn')[2]));await page.waitForFunction(()=>document.querySelectorAll('.allocation-tile').length===20);assert.equal(await page.evaluate(()=>JSON.stringify(profileSnapshot())),before,'reload preserves full synthetic ledger');
  results.push({width,height,theme,smallIcons:true,filters:true,privacy:true,currency:true,readOnly:true,coldReload:true});await context.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
