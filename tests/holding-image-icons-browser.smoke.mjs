// Synthetic-only image-icon checks. Never read a user ledger or upload externally.
import fs from 'node:fs';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.MYFIN_PLAYWRIGHT_PATH||'playwright');
const root=new URL('../',import.meta.url);
const appFiles=new Set(['index.html','cloud-auth.js','cloud-ui.js','browser-chrome.js']);
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  const publicImage=/^assets\/(?:wallet-icons|holding-icons)\/[a-zA-Z0-9_-]+\.(?:png|jpe?g|svg|webp|ico)$/.test(name);
  if(!['GET','HEAD'].includes(req.method)||(!appFiles.has(name)&&!publicImage)){res.writeHead(404);return res.end();}
  try{const data=fs.readFileSync(new URL(name,root));res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.png')?'image/png':/\.jpe?g$/.test(name)?'image/jpeg':name.endsWith('.webp')?'image/webp':name.endsWith('.ico')?'image/x-icon':'text/html');res.end(req.method==='HEAD'?undefined:data);}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.MYFIN_BROWSER_EXECUTABLE});
const errors=[],results=[];
const reports=new URL('../reports/holding-image-icons/',import.meta.url);fs.mkdirSync(reports,{recursive:true});
try{
 for(const [width,height,theme] of [[360,640,'dark'],[393,852,'light'],[852,393,'dark'],[1280,900,'light']]){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);
  await page.evaluate(theme=>{
    localStorage.clear();ensureProfiles();S=createAppState();S.theme=theme;S.automationPaused=true;S.fx={...DEFAULT_FX,updated:Date.now()};
    S.accounts=[{id:'bank',kind:'invest',isInvest:true,secondaryKind:'none',label:'Broker A',labelEn:'Broker A',icon:'🏦',opening:1000000,cur:'HKD'},{id:'bank2',kind:'invest',isInvest:true,secondaryKind:'none',label:'Broker B',labelEn:'Broker B',icon:'🏦',opening:1000000,cur:'HKD'}];
    S.txns=[{id:'expense',type:'expense',amount:12,amtHKD:12,cur:'HKD',catId:'food',acctId:'bank',note:'Synthetic lunch',date:today()}];
    const pos=(id,type,name,extra={})=>({id,type,name,qty:10,entryPrice:10,currentPrice:12,exitPrice:null,exitDate:null,budgetPrice:15,cur:'HKD',apiSymbol:'',notes:'Synthetic only',costHKD:100,valueHKD:120,acctId:'bank',acctLabel:'Broker A',acctIcon:'🏦',margin:false,secId:'',divPct:0,divFreq:'none',date:today(),...extra});
    S.portfolio=[pos(101,'stock','GOOG'),pos(102,'stock','GOOG',{exitPrice:14,exitDate:today(),qty:5,costHKD:50,valueHKD:70}),pos(103,'stock','GOOG',{acctId:'bank2',acctLabel:'Broker B'}),pos(104,'stock','GOOG',{secId:'custom_stock'}),pos(105,'crypto','BTC'),pos(106,'pe','Synthetic PE',{invested:100,valuation:120,pct:10}),pos(107,'pe','Synthetic PE 2',{invested:100,valuation:120,pct:5,secId:'custom_pe'}),pos(108,'stock','TSLA',{exitPrice:12,exitDate:today()}),pos(109,'stock',"<x>'"),pos(110,'crypto','ETH',{secId:'custom_crypto'})];
    S.customSections=[{id:'custom_stock',name:'Custom stock',base:'stock',icon:'📈'},{id:'custom_crypto',name:'Custom crypto',base:'crypto',icon:'₿'},{id:'custom_pe',name:'Custom PE',base:'pe',icon:'🏢'}];
    const c=document.createElement('canvas');c.width=96;c.height=96;c.getContext('2d').fillRect(0,0,96,96);S.portfolio.find(p=>p.id===103).iconImage=c.toDataURL('image/png');
    saveS({skipCloud:true});applyTheme();goTab('gamble',document.querySelectorAll('.bottom-nav .tab-btn')[2]);
  },theme);
  const financial=()=>page.evaluate(()=>JSON.stringify({txns:S.txns,portfolio:S.portfolio.map(({iconImage,...p})=>p),accounts:S.accounts.map(({iconImage,...a})=>a),people:S.people,gamble:S.gamble,privateLoans:S.privateLoans,debts:S.debts,priceHist:S.priceHist,changelog:S.changelog,balanceSheet:balanceSheetBreakdown()}));
  const before=await financial();
  const otherIcon=await page.evaluate(()=>S.portfolio.find(p=>p.id===103).iconImage);
  assert.ok(await page.evaluate(()=>suggestedHoldingIcon(S.portfolio.find(p=>p.id===101))),'GOOG has a built-in image');
  assert.ok(await page.evaluate(()=>suggestedHoldingIcon(S.portfolio.find(p=>p.id===105))),'BTC has a built-in image');
  assert.equal(await page.evaluate(()=>holdingIcon({name:"<x>'",type:'stock'}).includes('<x>')),false,'ticker fallback escapes markup');
  for(const selector of ['#stock-list','#crypto-list','#pe-list','#sec-custom_stock','#sec-custom_crypto','#sec-custom_pe','#stock-records'])assert.ok(await page.locator(selector+' .holding-icon-btn').count(),selector+' exposes an image control');
  const raw=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=300;const x=c.getContext('2d');x.fillStyle='#f00';x.fillRect(0,0,300,300);x.fillStyle='#00f';x.fillRect(300,0,300,300);return c.toDataURL('image/png').split(',')[1];});
  const upload=async()=>{await page.locator('#icon-file').setInputFiles({name:'two-colors.png',mimeType:'image/png',buffer:Buffer.from(raw,'base64')});await page.waitForFunction(()=>!document.getElementById('icon-save').disabled);};
  const open=async id=>{await page.evaluate(id=>openImageIcon('holding',String(id)),id);assert.equal(await page.locator('#image-icon-modal.open').count(),1,'numeric holding ID opens cropper');};
  // The visible ticker/image box opens the same editor used by wallets.
  await page.locator('#stock-list .holding-icon-btn').first().click();
  const gallery=await page.evaluate(()=>({expected:HOLDING_ICON_PRESETS.map(p=>p.path).sort(),actual:[...document.querySelectorAll('#wallet-icon-grid img')].map(i=>i.getAttribute('src')).sort()}));
  assert.deepEqual(gallery.actual,gallery.expected,'holding gallery uses the holding catalog');
  const decoded=await page.evaluate(async()=>Promise.all(HOLDING_ICON_PRESETS.map(p=>new Promise(resolve=>{const img=new Image();img.onload=()=>resolve({path:p.path,decoded:!!img.naturalWidth});img.onerror=()=>resolve({path:p.path,decoded:false});img.src=p.path;}))));
  assert.equal(decoded.every(a=>a.decoded),true,'all local holding presets decode: '+JSON.stringify(decoded.filter(a=>!a.decoded)));
  await page.locator('#wallet-icon-presets').evaluate(e=>{e.open=true;});await page.locator('#wallet-icon-grid .wallet-icon-choice').first().click();
  await page.waitForFunction(()=>!document.getElementById('icon-save').disabled);await page.locator('#icon-cancel').click();assert.equal(await financial(),before,'preset preview cancel keeps ledger unchanged');
  await open(101);
  await upload();
  const center=await page.evaluate(()=>croppedIconImage());await page.locator('#icon-zoom').fill('2');await page.locator('#icon-x').fill('1');
  assert.notEqual(await page.evaluate(()=>croppedIconImage()),center,'crop changes the saved pixels');
  await page.locator('#icon-crop-canvas').scrollIntoViewIfNeeded();const box=await page.locator('#icon-crop-canvas').boundingBox();
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.75,box.y+box.height*.5);await page.mouse.up();
  assert.ok(await page.evaluate(()=>imageIconDraft.x<1),'drag pans the crop');
  await page.locator('#icon-x').fill('1');
  assert.ok(await page.evaluate(()=>{const p=document.getElementById('icon-crop-canvas').getContext('2d').getImageData(120,120,1,1).data;return p[2]>240&&p[0]<10;}),'blue crop visible');
  await page.screenshot({path:fileURLToPath(new URL(`crop-${width}.png`,reports))});
  await page.locator('#icon-cancel').click();assert.equal(await financial(),before);assert.equal(await page.evaluate(()=>S.portfolio.find(p=>p.id===101).iconImage),undefined);
  await open(101);await upload();await page.locator('#icon-save').click();
  const icon=await page.evaluate(()=>S.portfolio.find(p=>p.id===101).iconImage);assert.match(icon,/^data:image\/(webp|png);base64,/);assert.ok(icon.length<=32768);await page.evaluate(icon=>{window.expectedHoldingIcon=icon;},icon);
  assert.equal(await page.evaluate(()=>S.portfolio.find(p=>p.id===102).iconImage),icon,'same holding closed lot receives image');
  assert.equal(await page.evaluate(()=>S.portfolio.find(p=>p.id===103).iconImage),otherIcon,'other account image untouched');
  assert.equal(await page.evaluate(()=>S.portfolio.find(p=>p.id===104).iconImage),undefined,'other section untouched');
  assert.equal(await financial(),before,'icon-only update preserves every financial field');
  await page.evaluate(()=>openRecord('GOOG','bank','','stock'));
  assert.equal(await page.locator('#rec-list .holding-icon-btn').count(),2,'both record lots expose their saved images');
  await page.evaluate(()=>closeM('m-rec'));
  await page.screenshot({path:fileURLToPath(new URL(`holdings-${width}.png`,reports))});
  // Quota failure must roll back all captured lots, including distinct prior images.
  await page.evaluate(()=>{window.oldClosedIcon=S.portfolio.find(p=>p.id===102).iconImage;S.portfolio.find(p=>p.id===102).iconImage=S.portfolio.find(p=>p.id===103).iconImage;});
  const quotaBefore=await page.evaluate(()=>S.portfolio.map(p=>({id:p.id,had:Object.hasOwn(p,'iconImage'),value:p.iconImage})));
  await open(101);await upload();await page.locator('#icon-x').fill('0');
  await page.evaluate(()=>{window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===profileKey())throw new DOMException('test quota','QuotaExceededError');return window.originalSet.call(this,key,value);};});
  await page.locator('#icon-save').click();assert.deepEqual(await page.evaluate(()=>S.portfolio.map(p=>({id:p.id,had:Object.hasOwn(p,'iconImage'),value:p.iconImage}))),quotaBefore,'all previous icons rolled back');
  assert.match(await page.locator('#icon-crop-error').innerText(),/儲存失敗|Save failed/);
  await page.locator('#icon-restore').click();assert.deepEqual(await page.evaluate(()=>S.portfolio.map(p=>({id:p.id,had:Object.hasOwn(p,'iconImage'),value:p.iconImage}))),quotaBefore,'failed restore rolls back all previous icons');
  await page.evaluate(()=>{Storage.prototype.setItem=window.originalSet;S.portfolio.find(p=>p.id===102).iconImage=window.oldClosedIcon;});await page.locator('#icon-cancel').click();
  assert.equal(await financial(),before);
  // A changed captured lot or group cannot accept the outstanding image draft.
  for(const change of ['replace','delete','regroup','add']){
    await open(101);await upload();await page.locator('#icon-x').fill('0');
    const result=await page.evaluate(change=>{
      const original=S.portfolio.slice(),target=S.portfolio.find(p=>p.id===102),oldAcct=target.acctId;
      if(change==='replace')S.portfolio=S.portfolio.map(p=>p===target?{...p}:p);
      if(change==='delete')S.portfolio=S.portfolio.filter(p=>p!==target);
      if(change==='regroup')target.acctId='bank2';
      if(change==='add')S.portfolio=S.portfolio.concat({...target,id:991});
      saveImageIcon(false);
      const unchanged=S.portfolio.filter(p=>p.id===101||p.id===102).every(p=>p.iconImage===window.expectedHoldingIcon);
      const closed=!document.getElementById('image-icon-modal').classList.contains('open');
      if(change==='regroup')target.acctId=oldAcct;S.portfolio=original;return {unchanged,closed};
    },change);
    assert.equal(result.unchanged,true,change+' aborts before any icon write');assert.equal(result.closed,true,change+' closes stale editor');
  }
  // Cross-profile and a same-object/different-profile-key change are both blocked.
  for(const change of ['state','key']){
    await open(101);await upload();await page.locator('#icon-x').fill('0');const unchanged=await page.evaluate(change=>{
      const oldState=S,meta=ensureProfiles(),active=meta.active;
      if(change==='state')S=createAppState();else{meta.active='synthetic_other';meta.list.push({id:'synthetic_other',name:'Synthetic other',emoji:'👤'});saveProfilesMeta(meta);}
      saveImageIcon(false);const okay=oldState.portfolio.find(p=>p.id===101).iconImage===window.expectedHoldingIcon;
      S=oldState;if(change==='key'){meta.active=active;meta.list=meta.list.filter(p=>p.id!=='synthetic_other');saveProfilesMeta(meta);}return okay;
    },change);assert.equal(unchanged,true,change+' guard preserves old profile');assert.equal(await page.locator('#image-icon-modal.open').count(),0);
  }
  assert.equal(await financial(),before);
  // JSON transfer uses the actual import path and retains images and the ledger.
  await page.evaluate(()=>saveS({skipCloud:true}));const transfer=await page.evaluate(()=>buildSafeTransfer());
  const imported=await page.evaluate(data=>{const plan=planBackupImport(data);plan.profiles[0].name+=' copy';plan.profiles[0].data.accounts[0].label+=' copy';const ids=commitBackupImport(plan);return JSON.parse(localStorage.getItem(profileKey(ids[0])));},transfer);
  assert.equal(imported.portfolio.find(p=>p.id===101).iconImage,icon);assert.equal(imported.portfolio.find(p=>p.id===102).iconImage,icon);assert.deepEqual(imported.txns,transfer.profiles[0].data.txns);
  await page.reload();assert.equal(await page.evaluate(()=>S.portfolio.find(p=>p.id===101).iconImage),icon);assert.equal(await financial(),before,'cold reload retains icon and unchanged financial fields');
  await page.evaluate(()=>goTab('gamble',document.querySelectorAll('.bottom-nav .tab-btn')[2]));
  // Restore removes only the group image and returns recognized holdings to built-in logos.
  await open(101);await page.locator('#icon-restore').click();
  assert.equal(await page.evaluate(()=>S.portfolio.filter(p=>p.id===101||p.id===102).some(p=>Object.hasOwn(p,'iconImage'))),false);
  assert.equal(await page.evaluate(()=>S.portfolio.find(p=>p.id===103).iconImage),otherIcon);assert.equal(await financial(),before);
  await page.reload();assert.equal(await page.evaluate(()=>S.portfolio.filter(p=>p.id===101||p.id===102).some(p=>Object.hasOwn(p,'iconImage'))),false);
  // Synthetic partial sale carries the picture into its newly created realized lot.
  await page.evaluate(icon=>{S.portfolio.find(p=>p.id===101).iconImage=icon;openSell('101');document.getElementById('sell-qty').value='2';document.getElementById('sell-price').value='14';confirmSell();},icon);
  const sale=await page.evaluate(()=>{const p=S.portfolio.find(p=>p.id===101),lot=S.portfolio.find(p=>p.name==='GOOG'&&p.acctId==='bank'&&p.id!==101&&p.id!==102&&p.exitPrice);return {open:p.iconImage,closed:lot?.iconImage,qty:p.qty+lot.qty,cost:p.costHKD+lot.costHKD};});
  assert.equal(sale.open,icon);assert.equal(sale.closed,icon);assert.equal(sale.qty,10);assert.equal(sale.cost,100);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal overflow');
  results.push({width,height,theme,allLocalPresetsDecoded:true,holdingPresetPreviewCancel:true,uploadCropDragCancel:true,numericIds:true,groupedLots:true,closedRecords:true,crossAccountAndSectionPreserved:true,financialFieldsUnchanged:true,quotaRollbackAllLots:true,restoreQuotaRollback:true,staleReplacementDeletionRegroupAdditionGuard:true,profileStateAndKeyGuards:true,jsonTransferAndColdReload:true,restore:true,partialSellRetainsImage:true});
  await context.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,results},null,2));
}finally{await browser.close();server.close();}
