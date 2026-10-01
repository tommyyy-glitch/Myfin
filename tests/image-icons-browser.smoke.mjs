// Synthetic-only end-to-end checks: no user ledger or external image uploads.
import fs from 'node:fs';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.MYFIN_PLAYWRIGHT_PATH||'playwright');
const root=new URL('../',import.meta.url);
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';if(!['index.html','cloud-auth.js','cloud-ui.js','browser-chrome.js'].includes(name)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(new URL(name,root)));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.MYFIN_BROWSER_EXECUTABLE});
const errors=[],results=[];fs.mkdirSync(new URL('../reports/image-icons/',import.meta.url),{recursive:true});
try{
 for(const [width,height,theme] of [[360,640,'dark'],[393,852,'light'],[852,393,'dark'],[1280,900,'dark']]){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);
  await page.evaluate(theme=>{S=createAppState();S.theme=theme;S.automationPaused=true;S.fx={...DEFAULT_FX,updated:Date.now()};S.accounts=[{id:'bank',kind:'bank',secondaryKind:'none',label:'測試銀行',icon:'🏦',opening:1000,cur:'HKD'}];S.txns=[{id:'sample',type:'expense',amount:12,amtHKD:12,cur:'HKD',catId:'food',acctId:'bank',note:'Lunch',date:today()}];saveS({skipCloud:true});applyTheme();renderHome();},theme);
  const financial=()=>page.evaluate(()=>JSON.stringify({txns:S.txns,accounts:S.accounts.map(({iconImage,...r})=>r),cats:S.cats.map(({iconImage,...r})=>r),balance:acctCash('bank')}));
  const before=await financial();
  await page.locator('.bottom-nav .tab-btn').nth(3).click();
  const expand=async key=>{const el=page.locator('[data-colkey="'+key+'"]');if(await el.evaluate(e=>e.classList.contains('col')))await el.click();};
  await expand('allaccts');await page.locator('#acct-mgr .icon-edit-btn').click();
  const raw=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=300;const x=c.getContext('2d');x.fillStyle='#f00';x.fillRect(0,0,300,300);x.fillStyle='#00f';x.fillRect(300,0,300,300);return c.toDataURL('image/png').split(',')[1];});
  const upload=async()=>{await page.locator('#icon-file').setInputFiles({name:'two-colors.png',mimeType:'image/png',buffer:Buffer.from(raw,'base64')});await page.waitForFunction(()=>!document.getElementById('icon-save').disabled);};
  await upload();
  const center=await page.evaluate(()=>croppedIconImage());
  await page.locator('#icon-zoom').fill('2');await page.locator('#icon-x').fill('1');
  assert.notEqual(await page.evaluate(()=>croppedIconImage()),center,'crop changes pixels');
  // Drag also pans; keyboard range controls provide an equivalent accessible path.
  await page.locator('#icon-crop-canvas').scrollIntoViewIfNeeded();
  const box=await page.locator('#icon-crop-canvas').boundingBox();
  await page.mouse.move(box.x+120,box.y+120);await page.mouse.down();await page.mouse.move(box.x+180,box.y+120);await page.mouse.up();
  assert.ok(await page.evaluate(()=>imageIconDraft.x<1));
  await page.locator('#icon-x').fill('1');
  const cropped=await page.evaluate(()=>{const p=document.getElementById('icon-crop-canvas').getContext('2d').getImageData(120,120,1,1).data;return [...p];});assert.ok(cropped[2]>240&&cropped[0]<10,'selected blue crop is visible');
  await page.screenshot({path:fileURLToPath(new URL(`../reports/image-icons/crop-${width}.png`,import.meta.url))});
  await page.locator('#icon-cancel').click();assert.equal(await financial(),before);
  assert.equal(await page.evaluate(()=>S.accounts[0].iconImage),undefined);
  await page.locator('#acct-mgr .icon-edit-btn').click();await upload();
  await page.locator('#icon-save').click();
  const icon=await page.evaluate(()=>S.accounts[0].iconImage);assert.ok(icon.length<32768);assert.match(icon,/^data:image\/(webp|png);base64,/);
  assert.equal(await page.locator('#acct-mgr .item-image-icon').count(),1);
  await expand('allcats');await page.locator('#cat-mgr .icon-edit-btn').first().click();await upload();await page.locator('#icon-save').click();
  assert.equal(await financial(),before);
  await page.reload();
  assert.equal(await page.evaluate(()=>S.accounts[0].iconImage),icon);
  assert.equal(await financial(),before);
  await page.evaluate(()=>openTxnModal());
  assert.equal(await page.locator('#acct-chips .item-image-icon').count(),1);
  assert.equal(await page.locator('#cat-chips .item-image-icon').count(),1);
  await page.evaluate(()=>closeM('m-txn'));
  assert.ok(await page.evaluate(()=>txnRow(S.txns[0]).includes('item-image-icon')));
  // Error paths: malformed file, invalid HTML/SVG data, storage quota rollback.
  await page.evaluate(()=>openImageIcon('account','bank'));
  await page.locator('#icon-file').setInputFiles({name:'bad.png',mimeType:'image/png',buffer:Buffer.from('broken')});
  await page.waitForFunction(()=>document.getElementById('icon-crop-error').textContent.length>0);
  assert.equal(await page.evaluate(()=>S.accounts[0].iconImage),icon);
  assert.equal(await page.evaluate(()=>validIconImage('data:image/svg+xml;base64,PHN2Zz4=')||validIconImage('https://example.com/tracker.png')||itemIcon({icon:'<script>',iconImage:'data:image/png;base64,x" onerror="x'}).includes('<script>')),false);
  await upload();await page.locator('#icon-x').fill('0');
  await page.evaluate(()=>{window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===profileKey())throw new DOMException('test quota','QuotaExceededError');return window.originalSet.call(this,key,value);};});
  await page.locator('#icon-save').click();assert.equal(await page.evaluate(()=>S.accounts[0].iconImage),icon);
  assert.match(await page.locator('#icon-crop-error').innerText(),/儲存失敗/);
  await page.evaluate(()=>{Storage.prototype.setItem=window.originalSet;});await page.locator('#icon-cancel').click();
  // A safe transfer survives the actual import pipeline into a second profile.
  await page.evaluate(()=>saveS({skipCloud:true}));
  const data=await page.evaluate(()=>buildSafeTransfer());
  const imported=await page.evaluate(data=>{const plan=planBackupImport(data);plan.profiles[0].name+=' copy';plan.profiles[0].data.accounts[0].label+=' copy';const ids=commitBackupImport(plan);return JSON.parse(localStorage.getItem(profileKey(ids[0])));},data);
  assert.equal(imported.accounts[0].iconImage,icon);assert.equal(imported.cats[0].iconImage,data.profiles[0].data.cats[0].iconImage);assert.deepEqual(imported.txns,data.profiles[0].data.txns);
  // Different profiles cannot receive an outstanding editor's save.
  await page.evaluate(()=>openImageIcon('account','bank'));await upload();
  await page.evaluate(()=>{window.originalState=S;S=createAppState();saveImageIcon(false);S=window.originalState;});
  assert.equal(await page.locator('#image-icon-modal.open').count(),0);
  await page.evaluate(()=>openImageIcon('account','bank'));await page.locator('#icon-restore').click();
  assert.equal(await page.evaluate(()=>Object.hasOwn(S.accounts[0],'iconImage')),false);
  assert.equal(await financial(),before);
  await page.reload();assert.equal(await page.evaluate(()=>Object.hasOwn(S.accounts[0],'iconImage')),false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  results.push({width,height,theme,cropDragAndZoom:true,cancel:true,reload:true,transferImport:true,quotaRollback:true,profileGuard:true,restore:true,financialDataUnchanged:true});await context.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,results},null,2));
}finally{await browser.close();server.close();}
