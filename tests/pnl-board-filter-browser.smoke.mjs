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
const reports=new URL('../reports/pnl-board-filter/',import.meta.url);fs.mkdirSync(reports,{recursive:true});
try{
 for(const [width,height,theme] of [[360,640,'dark'],[393,852,'light'],[852,393,'dark'],[1280,900,'light']]){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',timezoneId:'Asia/Hong_Kong'});
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
  await page.waitForFunction(()=>!_refreshing);
  await page.evaluate(theme=>{
   today=()=> '2026-10-16';localStorage.clear();ensureProfiles();S=createAppState();S.theme=theme;S.automationPaused=true;S.fx={...DEFAULT_FX,updated:Date.now()};FX=S.fx;
   S.accounts=[{id:'inv',kind:'invest',secondaryKind:'none',label:'Synthetic investment',cur:'HKD',opening:1000},{id:'fixed',kind:'invest',secondaryKind:'physical',label:'Fixed investment',cur:'HKD',opening:200}];
   S.customSections=[{id:'cs_stock',name:'Custom stock',base:'stock'},{id:'cs_poker',name:'Custom game',base:'poker'}];
   const p={type:'stock',acctId:'inv',cur:'HKD',date:today()};
   S.portfolio=[{...p,id:'s',name:'Stock',costHKD:100,valueHKD:150},{...p,id:'sold',name:'Sold',costHKD:40,valueHKD:60,exitPrice:6,exitDate:today()},{...p,id:'m',name:'Margin',costHKD:80,valueHKD:100,margin:true},{...p,id:'c',name:'Crypto',type:'crypto',costHKD:50,valueHKD:30},{...p,id:'custom',name:'Custom',secId:'cs_stock',costHKD:25,valueHKD:35},{...p,id:'pe',name:'Equity',type:'pe',costHKD:60,valueHKD:70},{...p,id:'fixed-position',name:'Physical account holding',acctId:'fixed',costHKD:30,valueHKD:40}];
   const g={acctId:'inv',cur:'HKD',date:today()};S.gamble=[{...g,id:'g',venue:'Closed poker',buyinHKD:10,cashoutHKD:5,open:false},{...g,id:'o',venue:'Open poker',buyinHKD:20,open:true},{...g,id:'cg',venue:'Custom poker',buyinHKD:5,cashoutHKD:15,open:false,secId:'cs_poker'}];
   S.privateLoans=[{id:'loan',borrower:'Synthetic loan',principal:100,principalHKD:100,fixedInterest:10,fixedInterestHKD:10,interestMode:'fixed',cur:'HKD',startDate:'2026-09-01',dueDate:'2026-10-01',payments:[{id:'pay',date:'2026-10-01',principalHKD:20,interestHKD:2}]}];
   S.physicalAssets=[{id:'a',name:'Asset',cost:20,costHKD:20,marketValue:25,cur:'HKD',fundingMode:'existing',costBasis:'opening',valuationHistory:[{date:today(),value:25}]},{id:'sold-asset',name:'Sold asset',cost:10,costHKD:10,marketValue:15,soldAt:'2026-10-01',saleValueHKD:15,cur:'HKD',fundingMode:'existing',costBasis:'opening',valuationHistory:[{date:'2026-10-01',value:15}]}];
   saveS({skipCloud:true});applyTheme();goTabIndex(2);
  },theme);
  const ledger=()=>page.evaluate(()=>{const {pnlPieFilters,...r}=profileSnapshot();return JSON.stringify({profile:r,balance:balanceSheetBreakdown(),calendar:pnlCalendarEvents()});});
  const original=await ledger();
  const board=()=>page.evaluate(()=>Object.fromEntries(['g-pnl','g-roi','g-worth','g-cash','g-deployed','g-margin'].map(id=>[id,document.getElementById(id).textContent])));
  const baseline=await board();
  await page.evaluate(()=>togglePnlFilterDrawer());
  await page.getByRole('button',{name:'股票',exact:true}).click();
  assert.equal(await page.locator('#g-pnl').textContent(),'HK$90','stock filter must change the board, including sold gains');
  assert.equal(await page.locator('#g-roi').textContent(),'ROI +40.9%');
  assert.equal(await page.locator('#g-worth').textContent(),'HK$170');assert.equal(await page.locator('#g-cash').textContent(),'HK$0');assert.equal(await page.locator('#g-deployed').textContent(),'HK$100');assert.equal(await page.locator('#g-margin').textContent(),'HK$80');
  assert.ok(await page.locator('#g-stock-pnl').isVisible());assert.equal(await page.locator('#g-crypto-pnl').isVisible(),false);
  assert.equal(await page.evaluate(()=>document.getElementById('pnl-allocation-map')._allocationData.reduce((n,d)=>n+d.val,0)),170);
  await page.evaluate(()=>togglePnlPieFilter('crypto'));assert.equal(await page.locator('#g-pnl').textContent(),'HK$70');assert.equal(await page.locator('#g-worth').textContent(),'HK$200');
  for(const [kind,pnl,worth,cost,deployed] of [['cs_stock',10,35,25,25],['cs_poker',10,0,5,0],['poker',-5,20,30,20],['loan',10,88,100,80],['physical',20,235,60,50],['cash',0,770,0,0],['pe',10,70,60,60]]){
   await page.evaluate(kind=>{S.pnlPieFilters=[kind];renderGamble();},kind);
   assert.equal(await page.locator('#g-pnl').textContent(),pnl<0?'−HK$'+Math.abs(pnl):'HK$'+pnl,kind+' P&L');
   assert.equal(await page.locator('#g-worth').textContent(),'HK$'+worth,kind+' worth');assert.equal(await page.locator('#g-deployed').textContent(),'HK$'+deployed,kind+' deployed');
   assert.equal(await page.locator('#g-roi').textContent(),'ROI '+(pnl>=0?'+':'')+(cost?pnl/cost*100:0).toFixed(1)+'%',kind+' ROI');
   if(kind.startsWith('cs_'))assert.ok(await page.locator('#pnl-metric-row [data-filter-metric]').isVisible());
  }
  await page.evaluate(()=>{S.pnlPieFilters=Object.keys(pnlPieFilterMeta());renderGamble();});assert.deepEqual(await board(),baseline,'selecting all kinds equals the original full board');
  await page.evaluate(()=>togglePnlPieFilter('all'));assert.deepEqual(await board(),baseline,'All restores original totals');
  assert.equal(await ledger(),original,'filtering never edits accounting or calendar data');
  await page.evaluate(()=>{S.pnlPieFilters=['stock'];S.privacy=true;renderGamble();});assert.equal(await page.locator('#g-pnl').textContent(),'••••');
  await page.evaluate(()=>{S.privacy=false;S.dispCur='USD';renderGamble();});assert.equal(await page.locator('#g-pnl').textContent(),await page.evaluate(()=>fmt(90)));
  await page.evaluate(()=>{S.dispCur='HKD';S.pnlPieFilters=['polymarket'];renderGamble();});assert.equal(await page.locator('#g-pnl').textContent(),'HK$0');assert.equal(await page.locator('#g-worth').textContent(),'HK$0');
  await page.evaluate(()=>{S.pnlNetHidden.stock=true;S.pnlPieFilters=['stock'];renderGamble();});assert.equal(await page.locator('#g-worth').textContent(),'HK$0');assert.equal(await page.locator('#g-margin-wrap').isVisible(),false);assert.equal(await page.locator('.allocation-tile').count(),0);
  await page.evaluate(()=>{window._allPortfolio=S.portfolio;S.portfolio=S.portfolio.filter(p=>p.acctId==='fixed');S.pnlNetHidden={};renderGamble();});assert.equal(await page.locator('#g-stock-pnl').textContent(),'HK$0','empty selected kind cannot retain another class gain');
  await page.evaluate(()=>{S.portfolio=window._allPortfolio;S.pnlNetHidden={};S.pnlPieFilters=['stock','crypto'];saveS({skipCloud:true});renderGamble();});
  await page.screenshot({path:fileURLToPath(new URL('filtered-'+width+'.png',reports))});
  await page.reload();await page.evaluate(()=>{today=()=> '2026-10-16';goTabIndex(2);});assert.equal(await page.locator('#g-pnl').textContent(),'HK$70','cold reload reapplies saved filter to board');
  await page.evaluate(()=>togglePnlPieFilter('all'));assert.equal(await ledger(),original);
  results.push({width,height,theme,boardAndMap:true,realizedIncluded:true,multiSelect:true,customSections:true,margin:true,cashAndPhysical:true,privacy:true,coldReload:true,ledgerUnchanged:true});await context.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
