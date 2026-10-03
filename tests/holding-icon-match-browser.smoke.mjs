// Local public assets and synthetic holdings only. Never read a phone ledger.
import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const {chromium}=await import(process.env.MYFIN_PLAYWRIGHT_PATH||'playwright');
const root=new URL('../',import.meta.url);
const appFiles=new Set(['index.html','cloud-auth.js','cloud-ui.js','browser-chrome.js']);
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  const image=/^assets\/(?:wallet-icons|holding-icons)\/[a-zA-Z0-9_-]+\.(?:png|jpe?g|svg|webp|ico)$/.test(name);
  if(!['GET','HEAD'].includes(req.method)||(!appFiles.has(name)&&!image)){res.writeHead(404);return res.end();}
  try{
    const data=fs.readFileSync(new URL(name,root));
    res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.png')?'image/png':/\.jpe?g$/.test(name)?'image/jpeg':name.endsWith('.webp')?'image/webp':name.endsWith('.ico')?'image/x-icon':'text/html');
    res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.MYFIN_BROWSER_EXECUTABLE});
const errors=[],results=[];
const reports=new URL('../reports/holding-icon-match/',import.meta.url);fs.mkdirSync(reports,{recursive:true});

try{
  for(const [width,height,theme] of [[360,640,'dark'],[393,852,'light'],[852,393,'dark'],[1280,900,'light']]){
    const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
    await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin);
    await page.evaluate(theme=>{
      localStorage.clear();ensureProfiles();S=createAppState();S.theme=theme;S.automationPaused=true;S.fx={...DEFAULT_FX,updated:Date.now()};
      S.accounts=[{id:'broker',kind:'invest',isInvest:true,secondaryKind:'none',label:'Broker A',labelEn:'Broker A',icon:'🏦',opening:1000000,cur:'HKD'},{id:'other-broker',kind:'invest',isInvest:true,secondaryKind:'none',label:'Broker B',labelEn:'Broker B',icon:'🏦',opening:1000000,cur:'HKD'}];
      const pos=(id,type,name,extra={})=>({id,type,name,qty:10,entryPrice:10,currentPrice:12,exitPrice:null,exitDate:null,budgetPrice:15,cur:'HKD',apiSymbol:'',notes:'Synthetic only',costHKD:100,valueHKD:120,acctId:'broker',acctLabel:'Broker A',acctIcon:'🏦',margin:false,secId:'',divPct:0,divFreq:'none',date:today(),...extra});
      S.portfolio=[pos(101,'stock','GOOG'),pos(102,'stock','GOOG',{qty:5,costHKD:50,valueHKD:70,exitPrice:14,exitDate:today()}),pos(103,'stock','GOOG',{acctId:'other-broker',acctLabel:'Broker B'}),pos(104,'stock','GOOG',{secId:'custom-stock'}),pos(105,'crypto','GOOG'),pos(106,'crypto','BTC'),pos(107,'crypto','ETH'),pos(108,'stock','TSLA',{exitPrice:12,exitDate:today()}),pos(109,'stock',"<img src=x onerror='alert(1)'>"),pos(110,'stock','中文基金'),pos(111,'pe','Project Alpha',{invested:100,valuation:120,pct:10}),pos(112,'pe','Project Beta',{invested:100,valuation:120,pct:5,secId:'custom-pe'}),pos(113,'stock','GOOG',{acctId:'other-broker',acctLabel:'Broker B',qty:1,exitPrice:13,exitDate:today()})];
      for(let i=0;i<12;i++)S.portfolio.push(pos(200+i,'stock','Synthetic '+i));
      S.customSections=[{id:'custom-stock',name:'Custom stock',base:'stock',icon:'📈'},{id:'custom-pe',name:'Custom PE',base:'pe',icon:'🏢'}];
      S.txns=[{id:'sample',type:'expense',amount:12,amtHKD:12,cur:'HKD',acctId:'broker',catId:'food',note:'Synthetic lunch',date:today()}];
      const c=document.createElement('canvas');c.width=c.height=96;c.getContext('2d').fillStyle='#e11';c.getContext('2d').fillRect(0,0,96,96);
      S.portfolio.find(p=>p.id===113).iconImage=c.toDataURL('image/png');S.accounts[0].iconImage=c.toDataURL('image/png');
      saveS({skipCloud:true});applyTheme();renderHome();
      localStorage.setItem('myfin.icon-recovery.v1.'+profileKey(),'existing-wallet-icon-recovery');
      localStorage.setItem('myfin.recovery.v1.'+profileKey(),'existing-financial-recovery');
    },theme);
    const financial=()=>page.evaluate(()=>JSON.stringify({portfolio:S.portfolio.map(({iconImage,...p})=>p),txns:S.txns,accounts:S.accounts,cats:S.cats,people:S.people,gamble:S.gamble,physicalAssets:S.physicalAssets,privateLoans:S.privateLoans,debts:S.debts,autopay:S.autopay,autoincome:S.autoincome,customSections:S.customSections,priceHist:S.priceHist,changelog:S.changelog,budget:S.budget,tax:S.tax,recurringRuns:S.recurringRuns,recurringLedgerVersion:S.recurringLedgerVersion,creditLimit:S.creditLimit,friends:S.friends,tuScores:S.tuScores,rpLabels:S.rpLabels,balanceSheet:balanceSheetBreakdown()}));
    const icons=()=>page.evaluate(()=>JSON.stringify(S.portfolio.map(p=>({id:p.id,holdingKey:holdingIconGroupKey(p),had:Object.hasOwn(p,'iconImage'),value:p.iconImage}))));
    const recovery=()=>page.evaluate(()=>localStorage.getItem('myfin.holding-icon-recovery.v1.'+profileKey()));
    const protectedRecovery=()=>page.evaluate(()=>({wallet:localStorage.getItem('myfin.icon-recovery.v1.'+profileKey()),financial:localStorage.getItem('myfin.recovery.v1.'+profileKey())}));
    const open=()=>page.evaluate(()=>openWalletIconMatch('holding'));
    const cancel=()=>page.locator('#wallet-icon-match-cancel').click();
    const closed=()=>page.waitForFunction(()=>!document.getElementById('wallet-icon-match-modal').classList.contains('open'));
    const before=await financial(),originalIcons=await icons(),protectedBefore=await protectedRecovery();

    await page.locator('.bottom-nav .tab-btn').nth(3).click();
    const entry=await page.locator('#holding-icon-match-btn').boundingBox();
    assert(entry&&entry.y>=0&&entry.y+entry.height<=height,'holding matching is visible in settings before expanding or scrolling');
    await page.locator('#holding-icon-match-btn').click();
    assert.equal(await page.evaluate(()=>walletIconMatchDraft.kind),'holding','settings entry selects holding mode');
    const groupCount=await page.evaluate(()=>new Set(S.portfolio.map(holdingIconGroupKey)).size);
    assert.equal(await page.evaluate(()=>walletIconMatchDraft.rows.length),groupCount,'lots combine into display groups');
    assert.equal(await page.evaluate(()=>walletIconMatchDraft.selected.size),groupCount-1,'a group with a closed-lot upload stays unselected');
    assert.equal(await page.evaluate(()=>walletIconMatchDraft.rows.find(r=>r.account.id===101).items.length),2,'open and closed lots share a group');
    assert.equal(await page.evaluate(()=>walletIconMatchDraft.rows.filter(r=>r.account.name==='GOOG').length),4,'same name stays separate by account, section and type');
    assert.equal(await page.evaluate(()=>walletIconMatchDraft.selected.has(walletIconMatchDraft.rows.findIndex(r=>r.account.acctId==='other-broker'&&r.account.name==='GOOG'))),false);
    assert(await page.locator('#wallet-icon-match-list input').count()<=7,'long holding list paginates');
    for(const id of ['wallet-icon-match-save','wallet-icon-match-cancel']){
      const box=await page.locator('#'+id).boundingBox();assert(box&&box.y>=0&&box.y+box.height<=height,id+' stays visible');
    }
    if(width===393){await page.locator('#wallet-icon-match-modal .modal').screenshot({path:fileURLToPath(new URL('matching-393.png',reports))});}
    const unknown=await page.evaluate(()=>{
      const p=S.portfolio.find(p=>p.id===110),data=holdingMonogram(p);
      return {valid:validIconImage(data),stable:data===holdingMonogram(p),different:data!==holdingMonogram({...p,name:'Another fund'}),data};
    });
    assert.equal(unknown.valid,true,'unknown Chinese names get valid raster badges');assert.equal(unknown.stable,true,'badge pixels are deterministic');assert.equal(unknown.different,true,'different names get distinct badges');
    const dimensions=await page.evaluate(data=>new Promise(resolve=>{const img=new Image();img.onload=()=>resolve([img.naturalWidth,img.naturalHeight]);img.src=data;}),unknown.data);assert.deepEqual(dimensions,[96,96]);
    await page.evaluate(()=>{const i=walletIconMatchDraft.rows.findIndex(r=>r.account.id===109);walletIconMatchDraft.page=Math.floor(i/walletIconMatchDraft.pageSize);renderWalletIconMatchPage();});
    assert.equal(await page.locator('#wallet-icon-match-list [onerror]').count(),0,'holding names cannot inject DOM handlers');
    assert.match(await page.locator('#wallet-icon-match-list').innerText(),/<img src=x/,'unknown names appear as text');
    await cancel();assert.equal(await financial(),before);assert.equal(await icons(),originalIcons);assert.equal(await recovery(),null);
    await page.locator('.bottom-nav .tab-btn').nth(2).click();
    await page.locator('#pnl-holding-icon-match-btn').click();
    assert.equal(await page.evaluate(()=>walletIconMatchDraft.kind),'holding','P&L entry selects holding mode');
    await cancel();assert.equal(await financial(),before);assert.equal(await icons(),originalIcons);

    // A missing recognized logo stops the entire batch before any financial/icon write.
    await page.evaluate(()=>{window.googlePath=HOLDING_ICON_PRESETS.find(p=>p.key==='google').path;HOLDING_ICON_PRESETS.find(p=>p.key==='google').path='assets/holding-icons/missing-google.png';});
    await open();await page.locator('#wallet-icon-match-save').click();await page.waitForFunction(()=>document.getElementById('wallet-icon-match-error').textContent.length>0);
    assert.equal(await icons(),originalIcons);assert.equal(await recovery(),null);assert.equal(await financial(),before);assert.deepEqual(await protectedRecovery(),protectedBefore);
    await cancel();await page.evaluate(()=>HOLDING_ICON_PRESETS.find(p=>p.key==='google').path=window.googlePath);

    // Checkbox state survives page changes; a hidden group is included in Apply.
    await open();await page.locator('#wallet-icon-match-all').uncheck();await page.locator('#wallet-icon-match-list input[data-index="0"]').check();
    const pageSize=await page.evaluate(()=>walletIconMatchDraft.pageSize),lastPage=Math.ceil(groupCount/pageSize)-1;
    for(let i=0;i<lastPage;i++)await page.locator('#wallet-icon-match-next').click();
    await page.locator('#wallet-icon-match-list input[data-index="'+(groupCount-1)+'"]').check();
    const selectedIds=await page.evaluate(()=>[...walletIconMatchDraft.selected].flatMap(i=>walletIconMatchDraft.rows[i].items.map(p=>p.id)).sort((a,b)=>a-b));
    for(let i=0;i<lastPage;i++)await page.locator('#wallet-icon-match-prev').click();
    assert.equal(await page.locator('#wallet-icon-match-list input[data-index="0"]').isChecked(),true);
    await page.locator('#wallet-icon-match-save').click();await closed();
    assert.deepEqual(await page.evaluate(()=>S.portfolio.filter(p=>validIconImage(p.iconImage)&&p.id!==113).map(p=>p.id).sort((a,b)=>a-b)),selectedIds,'selected off-page group and all its lots get images');
    assert.equal(await page.evaluate(()=>S.portfolio.find(p=>p.id===101).iconImage===S.portfolio.find(p=>p.id===102).iconImage),true);
    assert.equal(await financial(),before);assert.deepEqual(await protectedRecovery(),protectedBefore);
    const partial=JSON.parse(await recovery());assert.equal(partial.icons.length,selectedIds.length);assert(partial.icons.every(p=>typeof p.id==='string'&&typeof p.holdingKey==='string'&&!p.had));
    await open();await page.locator('#wallet-icon-match-restore').click();await closed();assert.equal(await icons(),originalIcons);

    // The default selection fills every remaining group while preserving uploaded pixels.
    const upload=await page.evaluate(()=>S.portfolio.find(p=>p.id===113).iconImage);
    await open();await page.locator('#wallet-icon-match-save').click();await closed();
    assert.equal(await page.evaluate(()=>S.portfolio.find(p=>p.id===113).iconImage),upload,'existing uploaded image bytes stay unchanged');
    assert.equal(await page.evaluate(()=>Object.hasOwn(S.portfolio.find(p=>p.id===103),'iconImage')),false,'existing group is not rewritten');
    assert.equal(await page.evaluate(()=>S.portfolio.every(p=>holdingIconGroup(p).some(x=>validIconImage(x.iconImage)))),true,'every holding group has a saved raster image');
    assert.equal(await financial(),before);assert.deepEqual(await protectedRecovery(),protectedBefore);
    const allIcons=await icons(),allRecovery=await recovery();assert(JSON.stringify(JSON.parse(allRecovery)).length<20000,'checkpoint stores only icon metadata');
    await open();assert.equal(await page.evaluate(()=>walletIconMatchDraft.selected.size),0);assert.equal(await page.locator('#wallet-icon-match-save').isDisabled(),true);
    if(height===393){const list=await page.locator('#wallet-icon-match-list').boundingBox(),row=await page.locator('#wallet-icon-match-list .wallet-icon-match').first().boundingBox();assert(list&&row&&list.height>=row.height,'landscape shows a complete row with Restore visible');}
    await cancel();await page.reload();assert.equal(await icons(),allIcons);assert.equal(await financial(),before,'cold reload keeps images and all financial fields');
    const exported=await page.evaluate(()=>buildSafeTransfer());
    assert.deepEqual(exported.profiles[0].data.portfolio.map(p=>p.iconImage),JSON.parse(allIcons).map(p=>p.value),'safe transfer keeps per-lot images');
    const imported=await page.evaluate(data=>{const plan=planBackupImport(data);plan.profiles[0].data.accounts[0].label+=' copy';const ids=commitBackupImport(plan);return JSON.parse(localStorage.getItem(profileKey(ids[0])));},exported);
    assert.deepEqual(imported.portfolio,exported.profiles[0].data.portfolio,'actual import path keeps holding metadata and all financial fields');

    // Save and recovery failures preserve both the originals and exact prior checkpoint bytes.
    await page.evaluate(()=>{const key='myfin.holding-icon-recovery.v1.'+profileKey();localStorage.setItem(key,' \n'+localStorage.getItem(key)+'\n');});
    const rawPrior=await recovery();
    await page.evaluate(()=>{window.realSave=saveS;saveS=()=>false;openWalletIconMatch('holding');selectAllWalletIconMatches(true);});
    await page.locator('#wallet-icon-match-save').click();await page.waitForFunction(()=>document.getElementById('wallet-icon-match-error').textContent.length>0);
    assert.equal(await icons(),allIcons);assert.equal(await recovery(),rawPrior,'failed save restores exact previous checkpoint bytes');assert.equal(await financial(),before);assert.deepEqual(await protectedRecovery(),protectedBefore);
    await page.evaluate(()=>{saveS=window.realSave;closeM('wallet-icon-match-modal');});
    await page.evaluate(()=>{openWalletIconMatch('holding');window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('myfin.holding-icon-recovery.v1.'))throw new DOMException('synthetic quota','QuotaExceededError');return window.originalSet.call(this,key,value);};selectAllWalletIconMatches(true);});
    await page.locator('#wallet-icon-match-save').click();await page.waitForFunction(()=>document.getElementById('wallet-icon-match-error').textContent.length>0);
    assert.equal(await icons(),allIcons);assert.equal(await recovery(),rawPrior);assert.equal(await financial(),before);
    await page.evaluate(()=>{Storage.prototype.setItem=window.originalSet;closeM('wallet-icon-match-modal');});
    await page.evaluate(()=>{openWalletIconMatch('holding');window.realSave=saveS;saveS=()=>false;});
    await page.locator('#wallet-icon-match-restore').click();await page.waitForFunction(()=>document.getElementById('wallet-icon-match-error').textContent.length>0);
    assert.equal(await icons(),allIcons);assert.equal(await recovery(),rawPrior,'failed restore keeps checkpoint');assert.equal(await financial(),before);
    await page.evaluate(()=>{saveS=window.realSave;closeM('wallet-icon-match-modal');});

    // Gate decoding to test double-submit, cancellation and identity checks.
    const startDelayed=()=>page.evaluate(()=>{
      openWalletIconMatch('holding');selectAllWalletIconMatches(false);toggleWalletIconMatch(0,true);
      window.delayedRaster=walletPresetRaster;window.delayedSave=saveS;window.delayedSet=Storage.prototype.setItem;window.delayedCounts={checkpoint:0,save:0};
      const gate=new Promise(resolve=>{window.releaseRaster=resolve;});walletPresetRaster=async key=>{await gate;return window.delayedRaster(key);};
      Storage.prototype.setItem=function(key,value){if(key.startsWith('myfin.holding-icon-recovery.v1.'))window.delayedCounts.checkpoint++;return window.delayedSet.call(this,key,value);};
      saveS=(...args)=>{window.delayedCounts.save++;return window.delayedSave(...args);};window.pendingApply=applyWalletIconMatch();
    });
    const finishDelayed=()=>page.evaluate(async()=>{window.releaseRaster();await window.pendingApply;walletPresetRaster=window.delayedRaster;saveS=window.delayedSave;Storage.prototype.setItem=window.delayedSet;return window.delayedCounts;});
    await startDelayed();
    for(const id of ['wallet-icon-match-save','wallet-icon-match-all','wallet-icon-match-prev','wallet-icon-match-next','wallet-icon-match-restore'])assert.equal(await page.locator('#'+id).isDisabled(),true,id+' is disabled while decoding');
    assert.equal(await page.locator('#wallet-icon-match-list input:enabled').count(),0);
    await page.evaluate(async()=>{await applyWalletIconMatch();toggleWalletIconMatch(1,true);selectAllWalletIconMatches(true);moveWalletIconMatchPage(1);restoreWalletIconMatch();});
    assert.deepEqual(await page.evaluate(()=>({selected:[...walletIconMatchDraft.selected],page:walletIconMatchDraft.page,counts:window.delayedCounts})),{selected:[0],page:0,counts:{checkpoint:0,save:0}});
    assert.deepEqual(await finishDelayed(),{checkpoint:1,save:1});await closed();assert.equal(await financial(),before);
    const stableIcons=await icons(),stableRecovery=await recovery();
    await startDelayed();await cancel();assert.deepEqual(await finishDelayed(),{checkpoint:0,save:0});assert.equal(await icons(),stableIcons);assert.equal(await recovery(),stableRecovery);
    for(const change of ['key','state','replace','delete','regroup','rename','add']){
      await startDelayed();
      await page.evaluate(change=>{
        window.guardState=S;window.guardPortfolio=S.portfolio.slice();window.guardProfileKey=profileKey;window.guardLot=S.portfolio.find(p=>p.id===102);window.guardName=window.guardLot.name;window.guardAcct=window.guardLot.acctId;
        if(change==='key')profileKey=()=> 'synthetic-other';
        if(change==='state')S=createAppState();
        if(change==='replace')S.portfolio=S.portfolio.map(p=>p===window.guardLot?{...p}:p);
        if(change==='delete')S.portfolio=S.portfolio.filter(p=>p!==window.guardLot);
        if(change==='regroup')window.guardLot.acctId='other-broker';
        if(change==='rename')window.guardLot.name='Renamed';
        if(change==='add')S.portfolio=S.portfolio.concat({...window.guardLot,id:998});
      },change);
      assert.deepEqual(await finishDelayed(),{checkpoint:0,save:0},change+' after decoding starts aborts all writes');
      await page.evaluate(()=>{S=window.guardState;window.guardLot.name=window.guardName;window.guardLot.acctId=window.guardAcct;S.portfolio=window.guardPortfolio;profileKey=window.guardProfileKey;closeM('wallet-icon-match-modal');});
      assert.equal(await icons(),stableIcons);assert.equal(await recovery(),stableRecovery);assert.equal(await financial(),before);
    }

    // Reused or ambiguous IDs cannot accept old recovery metadata.
    for(const change of ['delete','regroup','duplicate']){
      await page.evaluate(change=>{window.restorePortfolio=S.portfolio.slice();window.restoreLot=S.portfolio.find(p=>p.id===102);window.restoreAcct=window.restoreLot.acctId;if(change==='delete')S.portfolio=S.portfolio.filter(p=>p!==window.restoreLot);if(change==='regroup')window.restoreLot.acctId='other-broker';if(change==='duplicate')S.portfolio=S.portfolio.concat({...window.restoreLot});openWalletIconMatch('holding');},change);
      const changedIcons=await icons(),changedFinancial=await financial();await page.locator('#wallet-icon-match-restore').click();
      await page.waitForFunction(()=>document.getElementById('wallet-icon-match-error').textContent.length>0);
      assert.equal(await icons(),changedIcons,change+' restore aborts without partial icon writes');assert.equal(await financial(),changedFinancial);assert.equal(await recovery(),stableRecovery);
      await page.evaluate(()=>{window.restoreLot.acctId=window.restoreAcct;S.portfolio=window.restorePortfolio;closeM('wallet-icon-match-modal');});
    }
    await page.evaluate(()=>{window.restorePortfolio=S.portfolio.slice();S.portfolio=S.portfolio.concat({...S.portfolio.find(p=>p.id===102)});openWalletIconMatch('holding');selectAllWalletIconMatches(true);});
    const duplicatedIcons=await icons();await page.locator('#wallet-icon-match-save').click();await page.waitForFunction(()=>document.getElementById('wallet-icon-match-error').textContent.length>0);
    assert.equal(await icons(),duplicatedIcons);assert.equal(await recovery(),stableRecovery,'ambiguous targets cannot replace recovery');
    await page.evaluate(()=>{S.portfolio=window.restorePortfolio;closeM('wallet-icon-match-modal');});

    // Recovery targets previous lot IDs only; a new related lot stays untouched.
    await page.evaluate(()=>{const lot={...S.portfolio.find(p=>p.id===102),id:999};delete lot.iconImage;S.portfolio.push(lot);saveS({skipCloud:true});});
    const extendedBefore=await financial();await open();await page.locator('#wallet-icon-match-restore').click();await closed();
    assert.equal(await page.evaluate(()=>Object.hasOwn(S.portfolio.find(p=>p.id===999),'iconImage')),false,'new lot is not included in old recovery');
    assert.equal(await financial(),extendedBefore);assert.deepEqual(await protectedRecovery(),protectedBefore);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal overflow');
    results.push({width,height,theme,groups:groupCount,numericIds:true,groupedOpenAndClosedLots:true,accountSectionTypeIsolation:true,existingUploadPreserved:true,paginationAndOffPageApply:true,cancel:true,unknownRasterAndEscapedNames:true,assetFailureAtomic:true,quotaRollback:true,exactRecoveryRollback:true,decodeInteractionGuard:true,singleBatchWrite:true,cancelProfileAndGroupGuards:true,ambiguousIdsRejected:true,newLotsExcludedFromRestore:true,coldReloadAndTransfer:true,allFinancialFieldsUnchanged:true});
    await context.close();
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,results},null,2));
}finally{await browser.close();server.close();}
