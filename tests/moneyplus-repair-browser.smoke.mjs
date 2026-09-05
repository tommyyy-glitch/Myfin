// Synthetic UI regression; optionally verify a credential-stripped device copy.
// All requests are intercepted: no live app, accounts, cloud or provider APIs.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const {chromium}=await import(process.env.MYFIN_PLAYWRIGHT_PATH||'playwright');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const out=process.env.MYFIN_QA_OUTPUT;assert.ok(out,'Use an explicit private output directory');
const source=process.env.MYFIN_TEST_BACKUP?JSON.parse(fs.readFileSync(process.env.MYFIN_TEST_BACKUP,'utf8')):null;
if(source)assert.equal(source.credentialsIncluded,false,'Never load a raw credential-bearing backup into UI QA');
const clone=v=>JSON.parse(JSON.stringify(v));
const omitIds=rows=>rows.map(({id,...rest})=>rest);
const synthetic={accounts:[{id:'cash',label:'QA cash',kind:'cash',opening:100,cur:'HKD'}],txns:[{id:7,imported:'mp',_mpKey:'synthetic-a',type:'expense',date:'2026-09-05',amount:3,amtHKD:3,cur:'HKD',catId:'food',acctId:'cash',note:'First distinct entry'},{id:7,imported:'mp',_mpKey:'synthetic-b',type:'expense',date:'2026-09-05',amount:7,amtHKD:7,cur:'HKD',catId:'food',acctId:'cash',note:'Second distinct entry'}],people:[],portfolio:[],gamble:[]};
const runs=[{label:'synthetic-mobile',width:390,data:synthetic},{label:'synthetic-desktop',width:1280,data:synthetic}];
if(source)runs.push({label:'phone-copy',width:390,data:source.profiles[0].data});
const browser=await chromium.launch({headless:true,...(process.env.MYFIN_BROWSER_EXECUTABLE?{executablePath:process.env.MYFIN_BROWSER_EXECUTABLE}:{})});
const results=[];
try{
  for(const run of runs){
    const ctx=await browser.newContext({viewport:{width:run.width,height:900},isMobile:run.width<500,hasTouch:run.width<500,timezoneId:'Asia/Hong_Kong',serviceWorkers:'block'});
    await ctx.route('**/*',r=>r.request().url()==='http://myfin-id.test/'?r.fulfill({contentType:'text/html',body:html}):r.abort());
    const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
    await page.clock.install({time:new Date('2026-09-05T12:00:00Z')});
    await page.goto('http://myfin-id.test/',{waitUntil:'load'});
    await page.evaluate(data=>{
      S=createAppState();Object.assign(S,data);S.theme='dark';S.motionMode='quiet';S.automationPaused=true;S.cloud={...S.cloud,on:false};
      S.setCollapsed={...S.setCollapsed,mpimport:false,databackup:true};
      saveS({skipCloud:true});applyTheme();applyI18n();renderHome();
    },run.data);
    await page.locator('.bottom-nav .tab-btn').nth(3).click();
    await page.locator('#mp-id-repair').scrollIntoViewIfNeeded();
    const before=await page.evaluate(()=>profileSnapshot());
    const planned=await page.evaluate(()=>planMoneyPlusIdRepair(S));assert.equal(planned.blocked.length,0);assert.ok(planned.changes.length>0);
    await page.locator('#mp-id-repair').click();await page.clock.runFor(50);
    const after=await page.evaluate(()=>profileSnapshot());
    for(const field of ['txns','portfolio','gamble']){assert.deepEqual(omitIds(after[field]),omitIds(before[field]),field+' financial fields must be unchanged');assert.equal(new Set(after[field].map(t=>String(t.id))).size,after[field].length);}
    for(const field of ['accounts','people','physicalAssets','privateLoans','debts','pnlImports','priceHist'])assert.deepEqual(after[field],before[field],field+' must stay unchanged');
    const recovery=await page.evaluate(()=>JSON.parse(localStorage.getItem('myfin.id-recovery.v1.'+profileKey())));assert.deepEqual(recovery.profile,before);
    assert.equal((await page.evaluate(()=>planMoneyPlusIdRepair(S))).changes.length,0);
    const durable=await page.evaluate(()=>JSON.parse(localStorage.getItem(profileKey())));assert.deepEqual(durable.txns,after.txns);
    await page.locator('#mp-id-repair').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(out,run.label+'.png'),animations:'disabled'});
    await page.locator('#mp-id-recovery').click();assert.equal(await page.locator('#backup-preview').isVisible(),true);
    assert.equal(await page.evaluate(()=>window._backupPreview.plan.profiles[0].data.txns.length),before.txns.length);
    assert.equal(await page.evaluate(()=>profilesMeta().list.length),1,'recovery preview must not add profiles');
    if(run.label.startsWith('synthetic')){
      await page.locator('.bottom-nav .tab-btn').first().click();
      await page.locator('#s-home button[onclick^="editTxn("][onclick*="'+after.txns[1].id+'"]').first().click();
      assert.equal(await page.locator('#t-note').inputValue(),'Second distinct entry','edit must select the second record after repair');
      await page.evaluate(()=>closeM('m-txn'));
    }else{
      const fixed=clone(source);fixed.profiles[0].data.txns=after.txns;fixed.profiles[0].data.portfolio=after.portfolio;fixed.profiles[0].data.gamble=after.gamble;
      fs.writeFileSync(path.join(out,'myfin-accounts-2026-09-05-id-fixed.json'),JSON.stringify(fixed),{flag:'wx',mode:0o600});
      fs.writeFileSync(path.join(out,'id-changes.json'),JSON.stringify(planned.changes,null,2),{flag:'wx',mode:0o600});
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);
    results.push({scenario:run.label,width:run.width,transactions:after.txns.length,changedIds:planned.changes.length,financialDataUnchanged:true,recoveryMatches:true,duplicateIdsAfter:0,pageErrors:errors});
    await ctx.close();
  }
}finally{await browser.close();}
fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(results,null,2),{flag:'wx',mode:0o600});
console.log(JSON.stringify(results,null,2));
