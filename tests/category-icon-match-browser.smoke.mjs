// Public assets and synthetic categories only. Never read an installed phone ledger.
import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.MYFIN_PLAYWRIGHT_PATH||'playwright');
const root=new URL('../',import.meta.url),allowed=new Set(['index.html','cloud-auth.js','cloud-ui.js','browser-chrome.js']);
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
 if(!['GET','HEAD'].includes(req.method)||(!allowed.has(name)&&!/^assets\/(?:wallet-icons|holding-icons|category-icons)\/[\w-]+\.(?:svg|png|jpe?g|webp)$/.test(name))){res.writeHead(404);return res.end();}
 try{const data=fs.readFileSync(new URL(name,root));res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.png')?'image/png':/\.jpe?g$/.test(name)?'image/jpeg':'text/html');res.end(req.method==='HEAD'?undefined:data);}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true,executablePath:process.env.MYFIN_BROWSER_EXECUTABLE}),results=[],errors=[];
const reports=new URL('../reports/category-icons/',import.meta.url);fs.mkdirSync(reports,{recursive:true});
try{
 for(const [width,height,theme] of [[360,640,'dark'],[393,852,'light'],[852,393,'dark'],[1280,900,'light']]){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
  await page.evaluate(theme=>{
   localStorage.clear();ensureProfiles();S=createAppState();S.theme=theme;S.automationPaused=true;S.fx={...DEFAULT_FX,updated:Date.now()};
   S.accounts=[{id:'bank',label:'Synthetic bank',labelEn:'Synthetic bank',kind:'bank',secondaryKind:'none',cur:'HKD',opening:10000,icon:'🏦'}];
   for(let i=0;i<10;i++)S.cats.push({id:'synthetic-'+i,label:i===0?"<img src=x onerror='alert(1)'>":'Synthetic '+i,labelEn:'Synthetic '+i,icon:'🏷️',aliases:['Alias '+i]});
   S.txns=[{id:'food-record',type:'expense',date:today(),amount:12,amtHKD:12,cur:'HKD',catId:'food',catLabel:'Food',catIcon:'🍜',acctId:'bank',acctLabel:'Synthetic bank',note:'Synthetic lunch'},{id:'salary-record',type:'income',date:today(),amount:100,amtHKD:100,cur:'HKD',catId:'income',catLabel:'Salary',catIcon:'💼',acctId:'bank',note:'Synthetic pay'}];
   S.autopay=[{id:'synthetic-bill',name:'Rent fixture',amount:10,cur:'HKD',day:31,catId:'housing',acctId:'bank',acct:'Synthetic bank',active:false}];
   S.autoincome=[{id:'synthetic-income',name:'Income fixture',amount:10,cur:'HKD',day:31,catId:'income',acctId:'bank',freq:1,active:false}];
   S.portfolio=[{id:'holding',name:'GOOG',type:'stock',qty:2,entryPrice:10,currentPrice:11,cur:'HKD',costHKD:20,valueHKD:22,acctId:'bank',iconPreset:'google',divPct:1,divFreq:'year'}];
   const canvas=document.createElement('canvas');canvas.width=canvas.height=96;canvas.getContext('2d').fillRect(0,0,96,96);S.cats.find(c=>c.id==='food').iconImage=canvas.toDataURL('image/png');S.cats.find(c=>c.id==='synthetic-0').iconPreset={legacy:'invalid'};
   S._billMe=true;renderSettings();renderBillCats();renderTaxSettings();saveS({skipCloud:true});applyTheme();renderHome();
   for(const [key,value] of [['myfin.icon-recovery.v1.','wallet-recovery'],['myfin.holding-icon-recovery.v1.','holding-recovery'],['myfin.recovery.v1.','financial-recovery']])localStorage.setItem(key+profileKey(),value);
  },theme);
  const finance=()=>page.evaluate(()=>{const p=profileSnapshot();p.cats=p.cats.map(({iconImage,iconPreset,...c})=>c);delete p.setCollapsed;return JSON.stringify({profile:p,balance:balanceSheetBreakdown(),tax:taxEstimate().tax});});
  const icons=()=>page.evaluate(()=>JSON.stringify(S.cats.map(c=>({id:c.id,...captureIconMetadata(c)}))));
  const protectedKeys=()=>page.evaluate(()=>['myfin.icon-recovery.v1.','myfin.holding-icon-recovery.v1.','myfin.recovery.v1.'].map(k=>localStorage.getItem(k+profileKey())));
  const recovery=()=>page.evaluate(()=>localStorage.getItem('myfin.category-icon-recovery.v1.'+profileKey()));
  const open=()=>page.evaluate(()=>openWalletIconMatch('category')),closed=()=>page.waitForFunction(()=>!document.getElementById('wallet-icon-match-modal').classList.contains('open'));
  const baseline=await finance(),original=await icons(),protectedBefore=await protectedKeys(),count=await page.evaluate(()=>S.cats.length),upload=await page.evaluate(()=>S.cats.find(c=>c.id==='food').iconImage);
  const decoded=await page.evaluate(async()=>{await Promise.all(CATEGORY_ICON_PRESETS.map(p=>walletPresetRaster(p.key)));return CATEGORY_ICON_PRESETS.length;});assert.equal(decoded,24);
  assert.equal(await page.evaluate(()=>suggestedCategoryIcon({label:'飲食'})),'category-food');assert.equal(await page.evaluate(()=>suggestedCategoryIcon({label:'Food'})),'category-food');assert.equal(await page.evaluate(()=>suggestedCategoryIcon({label:'App Store'})),'app-store');assert.equal(await page.evaluate(()=>suggestedCategoryIcon({label:'Synthetic mystery'})),null);
  await page.locator('.bottom-nav .tab-btn').nth(3).click();await page.locator('#category-icon-match-btn').click();
  assert.equal(await page.evaluate(()=>walletIconMatchDraft.kind),'category');assert.equal(await page.evaluate(()=>walletIconMatchDraft.selected.size),count-1);
  const box=await page.locator('#wallet-icon-match-save').boundingBox();assert(box&&box.y>=0&&box.y+box.height<=height,'Apply stays in the viewport');
  if(width===393)await page.locator('#wallet-icon-match-modal .modal').screenshot({path:fileURLToPath(new URL('matching-393.png',reports))});
  await page.locator('#wallet-icon-match-cancel').click();assert.equal(await finance(),baseline);assert.equal(await icons(),original);assert.equal(await recovery(),null);
  // Decode failures and storage errors must leave all images and ledger entries intact.
  await page.evaluate(()=>{window.realPath=CATEGORY_ICON_PRESETS.find(p=>p.key==='category-transport').path;CATEGORY_ICON_PRESETS.find(p=>p.key==='category-transport').path='assets/category-icons/missing.svg';});
  await open();await page.locator('#wallet-icon-match-save').click();await page.waitForFunction(()=>document.getElementById('wallet-icon-match-error').textContent.length>0);
  assert.equal(await icons(),original);assert.equal(await recovery(),null);assert.equal(await finance(),baseline);await page.locator('#wallet-icon-match-cancel').click();await page.evaluate(()=>CATEGORY_ICON_PRESETS.find(p=>p.key==='category-transport').path=window.realPath);
  await page.evaluate(()=>{window.realSave=saveS;saveS=()=>false;});await open();await page.locator('#wallet-icon-match-save').click();await page.waitForFunction(()=>document.getElementById('wallet-icon-match-error').textContent.length>0);
  assert.equal(await icons(),original);assert.equal(await recovery(),null);assert.equal(await finance(),baseline);await page.evaluate(()=>{saveS=window.realSave;closeM('wallet-icon-match-modal');});
  // Checkboxes retain selection through pagination, including an off-page category.
  await open();await page.locator('#wallet-icon-match-all').check();await page.locator('#wallet-icon-match-all').uncheck();if(await page.evaluate(()=>walletIconMatchDraft.pageSize)===1){await page.locator('#wallet-icon-match-next').click();await page.locator('#wallet-icon-match-list input').first().check();}else await page.locator('#wallet-icon-match-list input').nth(1).check();
  const pages=await page.evaluate(()=>Math.ceil(walletIconMatchDraft.rows.length/walletIconMatchDraft.pageSize));for(let n=await page.evaluate(()=>walletIconMatchDraft.page);n<pages-1;n++)await page.locator('#wallet-icon-match-next').click();
  await page.locator('#wallet-icon-match-list input').last().check();await page.locator('#wallet-icon-match-save').click();await closed();
  assert.equal(await page.evaluate(()=>S.cats.filter(c=>validItemIconPreset(c.iconPreset)).length),2);assert.equal(await finance(),baseline);assert.deepEqual(await protectedKeys(),protectedBefore);
  await open();await page.locator('#wallet-icon-match-restore').click();await closed();assert.equal(await icons(),original);
  // PNG-only iPhone encoding plus just 8 KB spare profile space: no repeated rasters.
  await page.evaluate(()=>{window.canvasEncode=HTMLCanvasElement.prototype.toDataURL;window.storageSet=Storage.prototype.setItem;window.pngCalls=0;window.profileBytes=JSON.stringify(profileSnapshot()).length;HTMLCanvasElement.prototype.toDataURL=function(type,q){if(type==='image/webp'){window.pngCalls++;return window.canvasEncode.call(this,'image/png');}return window.canvasEncode.call(this,type,q);};Storage.prototype.setItem=function(k,v){if(k===profileKey()&&String(v).length>window.profileBytes+8192)throw new DOMException('synthetic quota','QuotaExceededError');return window.storageSet.call(this,k,v);};});
  await open();await page.locator('#wallet-icon-match-save').click();await closed();
  assert.equal(await page.evaluate(()=>S.cats.find(c=>c.id==='food').iconImage),upload);assert.equal(await page.evaluate(()=>S.cats.filter(c=>validItemIconPreset(c.iconPreset)).length),count-1);assert.equal(await page.evaluate(()=>S.cats.filter(c=>validIconImage(c.iconImage)).length),1);assert(await page.evaluate(()=>window.pngCalls>0));
  assert.equal(await finance(),baseline);assert.deepEqual(await protectedKeys(),protectedBefore);const saved=await icons();
  await page.evaluate(()=>{HTMLCanvasElement.prototype.toDataURL=window.canvasEncode;Storage.prototype.setItem=window.storageSet;});
  // Every related UI must display the same category image without changing transactions.
  await page.evaluate(()=>{renderCatChips();renderBillCats();renderBudgetSettings();renderTaxSettings();renderAutopay();renderAutoincome();renderMergeChips();});
  assert.match(await page.evaluate(()=>txnRow(S.txns[0])),/data:image\/png/);
  for(const selector of ['#cat-chips','#gb-cat-chips','#budget-cat-list','#merge-chips'])assert(await page.locator(selector+' .item-image-icon').count()>0,selector+' inherits category images');
  assert(await page.locator('#tax-cat-list img[src="assets/category-icons/income.svg"]').count()>0);
  assert(await page.locator('#ai2-list img[src="assets/category-icons/income.svg"]').count()>0);
  assert(await page.locator('#ai2-list img[src="assets/holding-icons/google.png"]').count()>0,'linked stock dividends keep holding logos');
  assert(await page.locator('img[src="assets/category-icons/housing.svg"]').count()>0,'scheduled bill inherits its category');
  assert.equal(await finance(),baseline);await page.reload();assert.equal(await icons(),saved);assert.equal(await finance(),baseline);
  await open();assert.equal(await page.evaluate(()=>walletIconMatchDraft.selected.size),0);await page.locator('#wallet-icon-match-cancel').click();
  const transfer=await page.evaluate(()=>buildSafeTransfer());assert.deepEqual(transfer.profiles[0].data.cats.map(c=>c.iconPreset),JSON.parse(saved).map(c=>c.presetValue));
  const imported=await page.evaluate(data=>{const plan=planBackupImport(data);plan.profiles[0].data.accounts[0].label+=' copy';const ids=commitBackupImport(plan);return JSON.parse(localStorage.getItem(profileKey(ids[0])));},transfer);assert.deepEqual(imported.cats,transfer.profiles[0].data.cats);
  // Rename, profile switch and deleting/replacing a category while images decode abort.
  for(const change of ['rename','delete','replace','profile','cancel']){
   await page.evaluate(()=>{openWalletIconMatch('category');selectAllWalletIconMatches(true);window.realRaster=walletPresetRaster;const gate=new Promise(r=>window.release=r);walletPresetRaster=async key=>{await gate;return window.realRaster(key);};window.draftState=S;window.draftCats=S.cats.slice();window.realProfile=profileKey;window.oldLabel=S.cats[1].label;window.pending=applyWalletIconMatch();});
   await page.evaluate(change=>{if(change==='rename')S.cats[1].label='Renamed fixture';if(change==='delete')S.cats=S.cats.slice(1);if(change==='replace')S.cats=S.cats.map(c=>({...c}));if(change==='profile')profileKey=()=> 'synthetic-other';if(change==='cancel')closeM('wallet-icon-match-modal');},change);
   await page.evaluate(async()=>{window.release();await window.pending;walletPresetRaster=window.realRaster;S=window.draftState;S.cats=window.draftCats;S.cats[1].label=window.oldLabel;profileKey=window.realProfile;closeM('wallet-icon-match-modal');});assert.equal(await icons(),saved,change+' aborts without image changes');assert.equal(await finance(),baseline);
  }
  // A duplicate target ID cannot silently update/recover the wrong category.
  await page.evaluate(()=>{window.baseCats=S.cats.slice();S.cats.push({...S.cats[1]});openWalletIconMatch('category');selectAllWalletIconMatches(true);});const dupIcons=await icons();await page.locator('#wallet-icon-match-save').click();await page.waitForFunction(()=>document.getElementById('wallet-icon-match-error').textContent.length>0);assert.equal(await icons(),dupIcons);
  await page.evaluate(()=>{S.cats=window.baseCats;closeM('wallet-icon-match-modal');});assert.equal(await finance(),baseline);assert.deepEqual(await protectedKeys(),protectedBefore);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.evaluate(()=>itemIcon({icon:'Safe',iconPreset:'https://example.invalid/icon.svg'})),'Safe');
  results.push({width,height,theme,categories:count,all24AssetsDecoded:true,existingUploadPreserved:true,pagination:true,cancel:true,assetFailureAtomic:true,quotaRollback:true,pngWith8KBHeadroom:true,relatedViews:true,reloadAndTransfer:true,staleDraftGuards:true,duplicateIdsRejected:true,recoveryIsolation:true,financialFieldsUnchanged:true});await context.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,results},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
