// Public icon assets + synthetic financial records only. No phone ledger is loaded.
import fs from 'node:fs';import http from 'node:http';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.MYFIN_PLAYWRIGHT_PATH||'playwright');
const root=new URL('../',import.meta.url),sources=JSON.parse(fs.readFileSync(new URL('../assets/wallet-icons/sources.json',import.meta.url)));
const allowed=new Set(['index.html','cloud-auth.js','cloud-ui.js','browser-chrome.js',...sources.map(p=>'assets/wallet-icons/'+p.file)]);
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';if(!allowed.has(name)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.jpg')?'image/jpeg':name.endsWith('.png')?'image/png':'text/html');res.end(fs.readFileSync(new URL(name,root)));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.MYFIN_BROWSER_EXECUTABLE});const errors=[],results=[];
fs.mkdirSync(new URL('../reports/wallet-icon-presets/',import.meta.url),{recursive:true});
const labels=['現金','IB','JP apple store card','PayMe','Alipay','AlipayHK','Polymarket','MEXC','EMPF','WeChat','MOP Cash','投資戶口','八達通','MetaMask','Gov loan','Project budget','HSBC Credit','Hang Seng Credit'];
try{
 for(const [width,height,theme] of [[360,640,'dark'],[393,852,'light'],[852,393,'dark'],[1280,900,'light']]){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);await page.evaluate(({labels,theme})=>{S=createAppState();S.theme=theme;S.automationPaused=true;S.fx={...DEFAULT_FX,updated:Date.now()};S.accounts=labels.map((label,i)=>({id:'a'+i,label,kind:'bank',secondaryKind:'none',cur:'HKD',icon:'💳',opening:i+100}));S.txns=[{id:'sample',type:'expense',amount:12,amtHKD:12,cur:'HKD',acctId:'a0',catId:'food',note:'sample',date:today()}];saveS({skipCloud:true});applyTheme();renderHome();}, {labels,theme});
  const ledger=()=>page.evaluate(()=>JSON.stringify({accounts:S.accounts.map(({iconImage,...a})=>a),txns:S.txns,cats:S.cats,balance:acctCash('a0')}));const before=await ledger();
  await page.locator('.bottom-nav .tab-btn').nth(3).click();const section=page.locator('[data-colkey="allaccts"]');if(await section.evaluate(e=>e.classList.contains('col')))await section.click();
  await page.locator('#wallet-icon-match-btn').click();assert.equal(await page.locator('#wallet-icon-match-list input:checked').count(),14);
  assert.equal(await page.evaluate(()=>suggestedWalletIcon({label:'MOP Cash'})),'lisboa');assert.equal(await page.evaluate(()=>suggestedWalletIcon({label:'Project budget'})),null);
  assert.equal(await page.evaluate(()=>suggestedWalletIcon({label:'HSBC Credit'})),null,'unknown credit card variant requires selection');
  await page.locator('#wallet-icon-match-cancel').click();assert.equal(await ledger(),before);assert.equal(await page.evaluate(()=>S.accounts.some(a=>a.iconImage)),false);
  // Asset error aborts before any write.
  await page.evaluate(()=>{window.originalMexcFile=WALLET_ICON_PRESETS.find(p=>p.key==='mexc').file;WALLET_ICON_PRESETS.find(p=>p.key==='mexc').file='missing-mexc.jpg';});
  await page.locator('#wallet-icon-match-btn').click();await page.locator('#wallet-icon-match-save').click();await page.waitForFunction(()=>document.getElementById('wallet-icon-match-error').textContent.length>0);assert.equal(await page.evaluate(()=>S.accounts.some(a=>a.iconImage)),false);assert.equal(await ledger(),before);await page.locator('#wallet-icon-match-cancel').click();await page.evaluate(()=>WALLET_ICON_PRESETS.find(p=>p.key==='mexc').file=window.originalMexcFile);
  await page.locator('#wallet-icon-match-btn').click();await page.locator('#wallet-icon-match-save').click();await page.waitForFunction(()=>!document.getElementById('wallet-icon-match-modal').classList.contains('open'));
  assert.equal(await page.evaluate(()=>S.accounts.filter(a=>validIconImage(a.iconImage)).length),14);assert.equal(await ledger(),before);
  const recovery=await page.evaluate(()=>JSON.parse(localStorage.getItem('myfin.recovery.v1.'+profileKey())).profile);assert.ok(recovery.accounts.every(a=>!a.iconImage));
  assert.equal(await page.locator('#acct-mgr img.item-image-icon').count(),14);
  await page.reload();assert.equal(await ledger(),before);assert.equal(await page.evaluate(()=>S.accounts.filter(a=>a.iconImage).length),14);
  const exported=await page.evaluate(()=>buildSafeTransfer());assert.equal(exported.profiles[0].data.accounts.filter(a=>a.iconImage).length,14);
  await page.evaluate(()=>openImageIcon('account','a0'));await page.locator('#wallet-icon-presets-label').click();
  assert.equal(await page.locator('#wallet-icon-grid .wallet-icon-choice').count(),14);
  await page.waitForFunction(()=>[...document.querySelectorAll('#wallet-icon-grid img')].every(i=>i.complete&&i.naturalWidth>0));
  await page.locator('#wallet-icon-grid').screenshot({path:fileURLToPath(new URL('../reports/wallet-icon-presets/gallery-'+width+'.png',import.meta.url))});
  await page.locator('#wallet-icon-grid button').filter({hasText:'IBKR'}).click();await page.waitForFunction(()=>!document.getElementById('icon-save').disabled);await page.locator('#icon-save').click();assert.equal(await ledger(),before);
  // Quota failure keeps all previous icon values, and no account balance changes.
  const prior=await page.evaluate(()=>JSON.stringify(S.accounts));await page.evaluate(()=>{openWalletIconMatch();window.originalSave=saveS;saveS=()=>false;});await page.locator('#wallet-icon-match-save').click();await page.waitForFunction(()=>document.getElementById('wallet-icon-match-error').textContent.length>0);assert.equal(await page.evaluate(()=>JSON.stringify(S.accounts)),prior);await page.evaluate(()=>{saveS=window.originalSave;closeM('wallet-icon-match-modal');});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  results.push({width,height,theme,matched:14,unchangedUnmatched:4,cancel:true,assetFailureAtomic:true,quotaRollback:true,reloadAndExport:true,recovery:true,ledgerUnchanged:true});await context.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,results},null,2));
}finally{await browser.close();server.close();}
