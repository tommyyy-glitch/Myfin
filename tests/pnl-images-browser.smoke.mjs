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
const reports=new URL('../reports/pnl-images/',import.meta.url);fs.mkdirSync(reports,{recursive:true});
try{
 for(const [width,height,theme] of [[360,640,'dark'],[393,852,'light'],[852,393,'dark'],[1280,900,'light']]){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
  await page.evaluate(theme=>{
   localStorage.clear();ensureProfiles();S=createAppState();S.theme=theme;S.automationPaused=true;S.fx={...DEFAULT_FX,updated:Date.now()};
   S.accounts=[{id:'cash',kind:'bank',secondaryKind:'none',label:'Synthetic bank',labelEn:'Synthetic bank',opening:100000,cur:'HKD'}];S.portfolio=[];S.txns=[];
   S.customSections=[{id:'cs_mpf',name:'EMPF',base:'stock',icon:'📈'},{id:'cs_poly',name:'Polymarket',base:'poker',icon:'🎯'},{id:'cs_other',name:"Synthetic <other> ' section",base:'pe',icon:'◆'}];
   S.gamble=[{id:701,venue:'Natural 8',date:today(),buyin:100,buyinHKD:100,cashout:150,cashoutHKD:150,cur:'HKD',open:false,acctId:'cash',secId:'cs_poly'}];
   S.physicalAssets=[{id:'fa',name:'Synthetic metal',category:'metal',fundingMode:'existing',costBasis:'opening',cost:1000,costHKD:1000,marketValue:1000,cur:'HKD',acctId:'cash',valuationDate:today(),valuationHistory:[{id:'h',date:today(),value:1000,source:'opening'}]}];
   S.privateLoans=[{id:'loan',borrower:'Synthetic borrower',principal:100,principalHKD:100,cur:'HKD',acctId:'cash',startDate:today(),dueDate:'2099-01-01',interestMode:'fixed',fixedInterest:10,fixedInterestHKD:10,payments:[]}];
   S.debts=[{id:'debt',name:'Government loan',balance:100,principal0:100,cur:'HKD',startDate:'2099-01-01',monthly:0,noInterest:true,paused:true}];
   saveS({skipCloud:true});applyTheme();goTab('gamble',document.querySelectorAll('.bottom-nav .tab-btn')[2]);renderPnlSecMgr();
  },theme);
  const financial=()=>page.evaluate(()=>{const clean=rows=>rows.map(({iconImage,iconPreset,...r})=>r);return JSON.stringify({txns:S.txns,accounts:S.accounts,cats:S.cats,portfolio:S.portfolio,physical:clean(S.physicalAssets),loans:clean(S.privateLoans),debts:clean(S.debts),poker:clean(S.gamble),sections:clean(S.customSections),balance:balanceSheetBreakdown(),history:S.priceHist,activity:S.changelog});});
  const deviceKeys=await page.evaluate(()=>['Desktop','AirPods Pro','JBL speaker','MacAir','iPhone','翡翠玉'].map(name=>physicalIconPreset({name,category:'other'})));assert.deepEqual(deviceKeys,['pnl-desktop','pnl-earbuds','pnl-speaker','pnl-laptop','pnl-phone','pnl-jade']);
  assert.ok(await page.evaluate(async()=>{await Promise.all(PNL_ICON_PRESETS.map(p=>{const img=new Image();img.src=p.path;return img.decode();}));return true;}),'all original asset pictures decode');
  const before=await financial();const saved=await page.evaluate(()=>localStorage.getItem(profileKey()));
  await page.evaluate(()=>{renderGamble();renderGamble();});assert.equal(await page.evaluate(()=>localStorage.getItem(profileKey())),saved,'automatic pictures do not write a ledger');
  for(const id of ['poker','stock','crypto','pe','physical','loan','debt'])assert.equal(await page.locator('#sec-'+id+' > .slbl > span img').count(),1,'one section picture '+id);
  assert.match(await page.locator('#sec-cs_mpf > .slbl img').getAttribute('src'),/mpfa/);assert.match(await page.locator('#sec-cs_poly > .slbl img').getAttribute('src'),/polymarket/);
  for(const sel of ['#physical-list','#loan-list','#debt-list','#sec-cs_poly'])assert.ok(await page.locator(sel+' .pnl-item-icon-btn').count(),'editable '+sel);
  for(const sel of ['#pnl-pie-filters','#pnl-calendar-filters','#pnl-sec-mgr','#pnl-pie-legend'])assert.ok(await page.locator(sel+' img').count(),sel+' carries images');
  const decoded=await page.evaluate(async()=>{const images=[...document.querySelectorAll('#s-gamble img')];await Promise.all(images.map(i=>i.decode()));return images.every(i=>i.naturalWidth>0);});assert.ok(decoded);
  const raw=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=200;const x=c.getContext('2d');x.fillStyle='red';x.fillRect(0,0,200,200);x.fillStyle='blue';x.fillRect(200,0,200,200);return c.toDataURL('image/png').split(',')[1];});
  const open=async(kind,id)=>{await page.evaluate(([k,i])=>openImageIcon(k,i),[kind,id]);assert.equal(await page.locator('#image-icon-modal.open').count(),1);const footer=await page.locator('#icon-cancel').boundingBox();assert.ok(footer.y>=0&&footer.y+footer.height<=height-34,'action stays above iPhone gesture area');};
  const upload=async()=>{await page.locator('#icon-file').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from(raw,'base64')});await page.waitForFunction(()=>!document.getElementById('icon-save').disabled);};
  for(const [kind,id] of [['section','cs_mpf'],['physical','fa'],['loan','loan'],['debt','debt'],['poker',701]]){
   await open(kind,id);await page.locator('#wallet-icon-presets').evaluate(el=>el.open=true);const footer=await page.locator('#icon-cancel').boundingBox();assert.ok(footer.y+footer.height<=height-34,'expanded gallery keeps actions safe');await page.locator('#wallet-icon-presets').evaluate(el=>el.open=false);await upload();await page.locator('#icon-cancel').click();assert.equal(await financial(),before);
   await open(kind,id);await upload();await page.evaluate(()=>saveImageIcon(false));assert.ok(await page.evaluate(([k,i])=>validIconImage(imageIconItems(k).find(x=>String(x.id)===String(i)).iconImage),[kind,id]));assert.equal(await financial(),before);
  }
  await page.evaluate(()=>renderGamble());assert.ok((await page.locator('#sec-cs_mpf > .slbl img').getAttribute('src')).startsWith('data:image/'),'uploaded section propagates');
  await page.evaluate(()=>jumpPnlSection('sec:cs_mpf'));await page.screenshot({path:fileURLToPath(new URL('pnl-'+width+'.png',reports))});
  await page.reload();await page.evaluate(()=>goTab('gamble',document.querySelectorAll('.bottom-nav .tab-btn')[2]));assert.ok(await page.evaluate(()=>S.customSections.find(x=>x.id==='cs_mpf').iconImage),'cold reload keeps image');assert.equal(await financial(),before);
  assert.ok(await page.evaluate(()=>transferProfileData(profileSnapshot(),localStorage).customSections.find(x=>x.id==='cs_mpf').iconImage),'transfer retains image');
  await open('section','cs_mpf');await upload();const old=await page.evaluate(()=>S.customSections[0].iconImage);
  await page.evaluate(()=>{window._oldSave=saveS;saveS=()=>false;saveImageIcon(false);saveS=window._oldSave;});assert.equal(await page.evaluate(()=>S.customSections[0].iconImage),old,'quota failure restores image');await page.locator('#icon-cancel').click();
  await open('section','cs_mpf');await upload();await page.evaluate(()=>{S.customSections[0].name+=' renamed';saveImageIcon(false);});assert.equal(await page.evaluate(()=>S.customSections[0].iconImage),old,'rename guard');await page.evaluate(()=>S.customSections[0].name='EMPF');
  await open('section','cs_mpf');await page.evaluate(()=>saveImageIcon(true));assert.equal(await page.evaluate(()=>S.customSections[0].iconImage),undefined,'restore automatic default');assert.match(await page.locator('#sec-cs_mpf > .slbl img').getAttribute('src'),/mpfa/);assert.equal(await financial(),before);
  results.push({width,height,theme,allSections:true,allEntityEditors:true,uploadCancelRestore:true,quotaRollback:true,coldReload:true,transfer:true,financialUnchanged:true});await context.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
