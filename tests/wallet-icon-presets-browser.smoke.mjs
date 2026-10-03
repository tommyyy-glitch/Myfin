// Public assets and synthetic accounts only. Never load a phone ledger or backup.
import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const {chromium}=await import(process.env.MYFIN_PLAYWRIGHT_PATH||'playwright');
const root=new URL('../',import.meta.url);
const sources=JSON.parse(fs.readFileSync(new URL('../assets/wallet-icons/sources.json',import.meta.url)));
assert.equal(sources.length,33,'the public catalog has all 33 prepared icons');
const allowed=new Set(['index.html','cloud-auth.js','cloud-ui.js','browser-chrome.js',...sources.map(p=>'assets/wallet-icons/'+p.file)]);
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(!allowed.has(name)){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.jpg')?'image/jpeg':name.endsWith('.png')?'image/png':'text/html');
  res.end(fs.readFileSync(new URL(name,root)));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.MYFIN_BROWSER_EXECUTABLE});
const errors=[],results=[];
const reportDir=new URL('../reports/wallet-icon-presets/',import.meta.url);
fs.mkdirSync(reportDir,{recursive:true});

// Credit cards start together so a phone-sized preview shows both exact card faces.
const labels=['HSBC Credit','Hang Seng Credit','現金','IB','JP apple store card','PayMe','Alipay','AlipayHK','Polymarket','MEXC','EMPF','WeChat','MOP Cash','投資戶口','八達通','MetaMask','Gov loan','Project budget','Longbridge','長橋','Natural8','N8','Forthright','方德','JPY CASH','China debit card','HSBC debit card','Changing pot','Live poker','Hair card','Unknown bank','Other account','Travel cash','Other credit','Other investments','Other e-wallet'];
const kinds={'Other account':'other','Travel cash':'cash','Other credit':'credit','Other investments':'invest','Other e-wallet':'ewallet'};
const accountCount=labels.length;

try{
  for(const [width,height,theme] of [[360,640,'dark'],[393,852,'light'],[852,393,'dark'],[1280,900,'light']]){
    const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
    await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin);
    await page.evaluate(({labels,kinds,theme})=>{
      S=createAppState();S.theme=theme;S.automationPaused=true;S.fx={...DEFAULT_FX,updated:Date.now()};
      S.accounts=labels.map((label,i)=>({id:'a'+i,label,kind:kinds[label]||'bank',secondaryKind:'none',cur:'HKD',icon:'💳',opening:i+100}));
      S.txns=[{id:'sample',type:'expense',amount:12,amtHKD:12,cur:'HKD',acctId:'a0',catId:'food',note:'synthetic sample',date:today()}];
      saveS({skipCloud:true});applyTheme();renderHome();
    },{labels,kinds,theme});
    const ledger=()=>page.evaluate(()=>JSON.stringify({accounts:S.accounts.map(({iconImage,...a})=>a),txns:S.txns,cats:S.cats,balance:acctCash('a0')}));
    const icons=()=>page.evaluate(()=>JSON.stringify(S.accounts.map(a=>({id:a.id,had:Object.hasOwn(a,'iconImage'),value:a.iconImage}))));
    const recoveryRaw=()=>page.evaluate(()=>localStorage.getItem('myfin.icon-recovery.v1.'+profileKey()));
    const financialRecovery=()=>page.evaluate(()=>localStorage.getItem('myfin.recovery.v1.'+profileKey()));
    const closed=()=>page.waitForFunction(()=>!document.getElementById('wallet-icon-match-modal').classList.contains('open'));
    const open=async()=>{await page.evaluate(()=>openWalletIconMatch());};
    const selectAll=async()=>{await page.locator('#wallet-icon-match-all').check();};
    const before=await ledger(),originalIcons=await icons();

    await page.locator('.bottom-nav .tab-btn').nth(3).click();
    const entry=await page.locator('#wallet-icon-match-btn').boundingBox();
    assert(entry&&entry.y>=0&&entry.y+entry.height<height,'matching is visible before expanding or scrolling settings');
    await page.locator('#wallet-icon-match-btn').click();
    assert.equal(await page.evaluate(()=>walletIconMatchDraft.selected.size),accountCount);
    assert.equal(await page.evaluate(()=>walletIconMatchDraft.rows.length),accountCount);
    assert(await page.locator('#wallet-icon-match-list input').count()<=7,'a long account list is paginated');
    for(const id of ['wallet-icon-match-save','wallet-icon-match-cancel']){
      const box=await page.locator('#'+id).boundingBox();
      assert(box&&box.y>=0&&box.y+box.height<=height,'confirmation controls stay visible with a long wallet list');
    }
    const expectedMappings={'HSBC Credit':'hsbc-red','Hang Seng Credit':'hang-seng-cityu','MOP Cash':'lisboa','Project budget':'project','Gov loan':'government','Longbridge':'longbridge','長橋':'longbridge','Natural8':'natural8','N8':'natural8','Forthright':'forthright','方德':'forthright','JPY CASH':'jpy','China debit card':'cny-card','HSBC debit card':'hsbc-logo','Changing pot':'coin-jar','Live poker':'poker','Hair card':'hair','Unknown bank':'bank-card','Other account':'wallet','Travel cash':'cash','Other credit':'credit-card','Other investments':'investment','Other e-wallet':'digital-wallet'};
    for(const [label,key] of Object.entries(expectedMappings)){
      assert.equal(await page.evaluate(label=>suggestedWalletIcon(S.accounts.find(a=>a.label===label)),label),key,label+' has its meaningful image');
    }
    assert.equal(await page.evaluate(()=>suggestedWalletIcon({label:'IB',kind:'bank',secondaryKind:'business'})),'ibkr','explicit IB brand takes precedence over business fallback');
    assert.equal(await page.evaluate(()=>walletIconMatchDraft.rows.every(r=>!!walletIconAsset(r.key))),true,'every synthetic account has an available suggestion');
    if(width===393){
      await page.locator('#wallet-icon-match-list img').evaluateAll(images=>Promise.all(images.map(image=>image.complete?Promise.resolve():new Promise(resolve=>image.onload=resolve))));
      await page.locator('#wallet-icon-match-modal .modal').screenshot({path:fileURLToPath(new URL('matching-cards-393.png',reportDir))});
      await page.evaluate(()=>{walletIconMatchDraft.page=Math.floor(18/walletIconMatchDraft.pageSize);renderWalletIconMatchPage();});
      await page.locator('#wallet-icon-match-list img').evaluateAll(images=>Promise.all(images.map(image=>image.complete?Promise.resolve():new Promise(resolve=>image.onload=resolve))));
      await page.locator('#wallet-icon-match-modal .modal').screenshot({path:fileURLToPath(new URL('matching-brands-393.png',reportDir))});
    }
    await page.locator('#wallet-icon-match-cancel').click();
    assert.equal(await ledger(),before);assert.equal(await icons(),originalIcons,'cancel never applies images');

    // An off-page missing image must abort the whole selection before any writes.
    await page.evaluate(()=>{window.originalMexcFile=WALLET_ICON_PRESETS.find(p=>p.key==='mexc').file;WALLET_ICON_PRESETS.find(p=>p.key==='mexc').file='missing-mexc.jpg';});
    await open();await page.locator('#wallet-icon-match-save').click();
    await page.waitForFunction(()=>document.getElementById('wallet-icon-match-error').textContent.includes('MEXC'));
    assert.equal(await icons(),originalIcons);assert.equal(await ledger(),before);assert.equal(await recoveryRaw(),null);
    await page.locator('#wallet-icon-match-cancel').click();
    await page.evaluate(()=>WALLET_ICON_PRESETS.find(p=>p.key==='mexc').file=window.originalMexcFile);
    await page.evaluate(()=>{localStorage.setItem('myfin.recovery.v1.'+profileKey(),'existing-financial-recovery');window.fullCheckpoint=checkpointProfile;checkpointProfile=()=>{throw Error('icons must not checkpoint the financial ledger');};});

    // Real checkboxes retain their selection across pages; apply includes hidden rows.
    await open();await page.locator('#wallet-icon-match-all').uncheck();
    await page.locator('#wallet-icon-match-list input[data-index="0"]').check();
    const pageSize=await page.evaluate(()=>walletIconMatchDraft.pageSize);
    const lastPage=Math.ceil(accountCount/pageSize)-1;
    for(let i=0;i<lastPage;i++)await page.locator('#wallet-icon-match-next').click();
    await page.locator('#wallet-icon-match-list input[data-index="'+(accountCount-1)+'"]').check();
    for(let i=0;i<lastPage;i++)await page.locator('#wallet-icon-match-prev').click();
    assert.equal(await page.locator('#wallet-icon-match-list input[data-index="0"]').isChecked(),true);
    assert.deepEqual(await page.evaluate(()=>[...walletIconMatchDraft.selected].sort((a,b)=>a-b)),[0,accountCount-1]);
    await page.locator('#wallet-icon-match-save').click();await closed();
    assert.deepEqual(await page.evaluate(()=>S.accounts.filter(a=>validIconImage(a.iconImage)).map(a=>a.id)),['a0','a'+(accountCount-1)],'selected off-page account is applied');
    assert.equal(await ledger(),before);assert.equal(await financialRecovery(),'existing-financial-recovery');
    const partialRecovery=JSON.parse(await recoveryRaw());assert.equal(partialRecovery.icons.length,2);assert(partialRecovery.icons.every(a=>!a.had));
    await open();await page.locator('#wallet-icon-match-restore').click();await closed();
    assert.equal(await icons(),originalIcons,'restore affects exactly the previously selected accounts');

    await open();await selectAll();await page.locator('#wallet-icon-match-save').click();await closed();
    assert.equal(await page.evaluate(()=>S.accounts.filter(a=>validIconImage(a.iconImage)).length),accountCount);
    assert.equal(await ledger(),before);assert.equal(await financialRecovery(),'existing-financial-recovery');
    await page.evaluate(()=>{checkpointProfile=window.fullCheckpoint;});
    const recovery=JSON.parse(await recoveryRaw());assert.equal(recovery.icons.length,accountCount);assert(recovery.icons.every(a=>!a.had));
    assert(JSON.stringify(recovery).length<6000,'icon recovery does not duplicate financial records');
    assert.equal(await page.locator('#acct-mgr img.item-image-icon').count(),accountCount);
    await open();assert.equal(await page.evaluate(()=>walletIconMatchDraft.selected.size),0,'existing valid images stay unselected');
    if(height===393){
      assert(await page.locator('#wallet-icon-match-list .wallet-icon-match').count()>=1,'landscape shows an account when restore is available');
      const listBox=await page.locator('#wallet-icon-match-list').boundingBox(),rowBox=await page.locator('#wallet-icon-match-list .wallet-icon-match').first().boundingBox();
      assert(listBox&&rowBox&&listBox.height>=rowBox.height,'landscape list fits at least one complete row with the restore button visible');
    }
    assert.equal(await page.locator('#wallet-icon-match-save').isDisabled(),true);await page.locator('#wallet-icon-match-cancel').click();
    const allSetIcons=await icons();
    await page.reload();assert.equal(await ledger(),before);assert.equal(await icons(),allSetIcons,'a cold page reload retains every icon');
    const exported=await page.evaluate(()=>buildSafeTransfer());assert.equal(exported.profiles[0].data.accounts.filter(a=>validIconImageForTest(a.iconImage)).length,accountCount);
    function validIconImageForTest(value){return typeof value==='string'&&value.startsWith('data:image/');}
    await open();await selectAll();await page.locator('#wallet-icon-match-restore').click();await closed();
    assert.equal(await icons(),originalIcons);assert.equal(await ledger(),before);assert.equal(await financialRecovery(),'existing-financial-recovery');
    await open();await selectAll();await page.locator('#wallet-icon-match-save').click();await closed();

    // All public thumbnails decode; a chosen brand also works through the crop UI.
    await page.evaluate(()=>openImageIcon('account','a0'));await page.locator('#wallet-icon-presets-label').click();
    assert.equal(await page.locator('#wallet-icon-grid .wallet-icon-choice').count(),33);
    await page.waitForFunction(()=>[...document.querySelectorAll('#wallet-icon-grid img')].every(i=>i.complete&&i.naturalWidth>0));
    await page.locator('#wallet-icon-grid').screenshot({path:fileURLToPath(new URL('gallery-'+width+'.png',reportDir))});
    await page.locator('#wallet-icon-grid button').filter({hasText:'IBKR'}).click();
    await page.waitForFunction(()=>!document.getElementById('icon-save').disabled);
    const beforeCrop=await icons();await page.evaluate(()=>{window.originalSave=saveS;saveS=()=>false;});
    await page.locator('#icon-save').click();
    assert.equal(await icons(),beforeCrop,'a crop save failure retains the previous image');assert.equal(await ledger(),before);
    await page.evaluate(()=>{saveS=window.originalSave;});await page.locator('#icon-save').click();
    assert.equal(await ledger(),before);

    // Restore and quota errors leave prior account icons and recovery records intact.
    const preRestore=await icons(),preRestoreRecovery=await recoveryRaw();
    await page.evaluate(()=>{openWalletIconMatch();window.originalSave=saveS;saveS=()=>false;});
    await selectAll();await page.locator('#wallet-icon-match-restore').click();
    await page.waitForFunction(()=>document.getElementById('wallet-icon-match-error').textContent.length>0);
    assert.equal(await icons(),preRestore);assert.equal(await recoveryRaw(),preRestoreRecovery);
    await page.evaluate(()=>{saveS=window.originalSave;closeM('wallet-icon-match-modal');});
    const preRecovery=await icons(),priorRecovery=await recoveryRaw();
    await page.evaluate(()=>{openWalletIconMatch();window.originalCheckpoint=checkpointWalletIcons;checkpointWalletIcons=()=>{throw new DOMException('synthetic quota','QuotaExceededError');};});
    await selectAll();await page.locator('#wallet-icon-match-save').click();
    await page.waitForFunction(()=>document.getElementById('wallet-icon-match-error').textContent.includes('復原副本'));
    assert.equal(await icons(),preRecovery);assert.equal(await recoveryRaw(),priorRecovery);assert.equal(await ledger(),before);
    await page.evaluate(()=>{checkpointWalletIcons=window.originalCheckpoint;closeM('wallet-icon-match-modal');});
    // Preserve the original recovery bytes, not a reserialized equivalent.
    await page.evaluate(()=>{const key='myfin.icon-recovery.v1.'+profileKey();localStorage.setItem(key,' \n'+localStorage.getItem(key)+'\n');});
    const prior=await icons(),rawPrior=await recoveryRaw();
    await page.evaluate(()=>{openWalletIconMatch();window.originalSave=saveS;saveS=()=>false;});
    await selectAll();await page.locator('#wallet-icon-match-save').click();
    await page.waitForFunction(()=>document.getElementById('wallet-icon-match-error').textContent.length>0);
    assert.equal(await icons(),prior);assert.equal(await recoveryRaw(),rawPrior,'failed save restores exact previous icon recovery bytes');
    assert.equal(await ledger(),before);assert.equal(await financialRecovery(),'existing-financial-recovery');
    await page.evaluate(()=>{saveS=window.originalSave;closeM('wallet-icon-match-modal');});

    // Hold decoding open to verify the UI and programmatic double-submit guard.
    const startDelayed=()=>page.evaluate(()=>{
      openWalletIconMatch();selectAllWalletIconMatches(false);toggleWalletIconMatch(0,true);
      window.delayedRaster=walletPresetRaster;window.delayedCheckpoint=checkpointWalletIcons;window.delayedSave=saveS;
      window.delayedCounts={checkpoint:0,save:0};
      const gate=new Promise(resolve=>{window.releaseRaster=resolve;});
      walletPresetRaster=async key=>{await gate;return window.delayedRaster(key);};
      checkpointWalletIcons=(...args)=>{window.delayedCounts.checkpoint++;return window.delayedCheckpoint(...args);};
      saveS=(...args)=>{window.delayedCounts.save++;return window.delayedSave(...args);};
      window.pendingApply=applyWalletIconMatch();
    });
    const finishDelayed=()=>page.evaluate(async()=>{
      window.releaseRaster();await window.pendingApply;
      walletPresetRaster=window.delayedRaster;checkpointWalletIcons=window.delayedCheckpoint;saveS=window.delayedSave;
      return window.delayedCounts;
    });
    const waitingIcons=await icons();await startDelayed();
    for(const id of ['wallet-icon-match-save','wallet-icon-match-all','wallet-icon-match-prev','wallet-icon-match-next','wallet-icon-match-restore']){
      assert.equal(await page.locator('#'+id).isDisabled(),true,id+' stays disabled during image decoding');
    }
    assert.equal(await page.locator('#wallet-icon-match-list input:enabled').count(),0);
    const guarded=await page.evaluate(async()=>{
      await applyWalletIconMatch();toggleWalletIconMatch(1,true);selectAllWalletIconMatches(true);moveWalletIconMatchPage(1);restoreWalletIconMatch();
      return {selected:[...walletIconMatchDraft.selected],page:walletIconMatchDraft.page,counts:window.delayedCounts};
    });
    assert.deepEqual(guarded,{selected:[0],page:0,counts:{checkpoint:0,save:0}});
    assert.equal(await icons(),waitingIcons);assert.deepEqual(await finishDelayed(),{checkpoint:1,save:1});await closed();
    assert.equal(await ledger(),before);assert.equal(await financialRecovery(),'existing-financial-recovery');
    const beforeCancel=await icons(),cancelRecovery=await recoveryRaw();await startDelayed();
    await page.locator('#wallet-icon-match-cancel').click();assert.deepEqual(await finishDelayed(),{checkpoint:0,save:0});
    assert.equal(await icons(),beforeCancel);assert.equal(await recoveryRaw(),cancelRecovery);
    await startDelayed();
    await page.evaluate(()=>{window.guardedProfileKey=profileKey;profileKey=()=> 'synthetic-other-profile';});
    assert.deepEqual(await finishDelayed(),{checkpoint:0,save:0});
    await page.evaluate(()=>{profileKey=window.guardedProfileKey;closeM('wallet-icon-match-modal');});
    assert.equal(await icons(),beforeCancel);assert.equal(await recoveryRaw(),cancelRecovery);assert.equal(await ledger(),before);

    // A newly added account receives its missing icon without replacing any old image.
    const oldIcons=await icons();
    await page.evaluate(()=>{S.accounts.push({id:'added',label:'New everyday bank',kind:'bank',secondaryKind:'none',cur:'HKD',icon:'💳',opening:321});saveS({skipCloud:true});});
    const extendedLedger=await ledger();await open();
    assert.deepEqual(await page.evaluate(()=>[...walletIconMatchDraft.selected]),[accountCount]);
    await page.locator('#wallet-icon-match-save').click();await closed();
    assert.equal(await page.evaluate(()=>JSON.stringify(S.accounts.slice(0,-1).map(a=>({id:a.id,had:Object.hasOwn(a,'iconImage'),value:a.iconImage})))),oldIcons);
    assert.equal(await page.evaluate(()=>validIconImage(S.accounts.at(-1).iconImage)),true);assert.equal(await ledger(),extendedLedger);
    assert.equal(JSON.parse(await recoveryRaw()).icons.length,1);assert.equal(JSON.parse(await recoveryRaw()).icons[0].id,'added');
    await open();assert.equal(await page.evaluate(()=>walletIconMatchDraft.selected.size),0);await page.locator('#wallet-icon-match-cancel').click();
    await page.reload();assert.equal(await ledger(),extendedLedger);assert.equal(await page.evaluate(()=>S.accounts.filter(a=>validIconImage(a.iconImage)).length),accountCount+1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    results.push({width,height,theme,catalogIcons:33,matched:accountCount,meaningfulFallbacks:true,cancel:true,pagedSelection:true,offPageApply:true,assetFailureAtomic:true,quotaRollback:true,cropFailureRollback:true,rawRecoveryPreserved:true,decodeInteractionGuard:true,singleBatchWrite:true,cancelDecodeAbort:true,profileDecodeAbort:true,reloadAndExport:true,recovery:true,existingImagesPreserved:true,ledgerUnchanged:true});
    await context.close();
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,results},null,2));
}finally{await browser.close();server.close();}
