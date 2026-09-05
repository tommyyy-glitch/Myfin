// Isolated synthetic-data QA. Never connects to live financial or sync services.
import fs from 'node:fs';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.MYFIN_PLAYWRIGHT_PATH||'playwright');
const out=new URL('../reports/safe-transfer-2026-09-05/',import.meta.url);fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.MYFIN_BROWSER_EXECUTABLE?{executablePath:process.env.MYFIN_BROWSER_EXECUTABLE}:{})});
const errors=[],results=[];
try{
  for(const width of [390,1280]){
    const ctx=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1,isMobile:width<500,hasTouch:width<500,timezoneId:'Asia/Hong_Kong',colorScheme:'dark',serviceWorkers:'block'});
    await ctx.route('**/*',route=>{const u=route.request().url();if(u.startsWith('http://127.0.0.1:8768/'))return route.continue();if(['stylesheet','font'].includes(route.request().resourceType()))return route.continue();return route.abort();});
    const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.clock.install({time:new Date('2026-09-05T12:00:00Z')});
    await page.goto('http://127.0.0.1:8768/',{waitUntil:'load'});
    await page.evaluate(()=>{S=createAppState();S.motionMode='quiet';S.theme='dark';S.automationPaused=true;S.fx={...DEFAULT_FX,updated:Date.now()};S.txns=[{id:'phone-record',date:'2026-09-04',type:'expense',amount:100,amtHKD:100,cur:'HKD',catId:'food',acctId:'cash',catLabel:'飲食'}];S.ai.key='SYNTHETIC-SECRET';S.cloud.pass='SYNTHETIC-SECRET';saveS({skipCloud:true});applyTheme();applyI18n();renderHome();});
    await page.locator('.bottom-nav .tab-btn').nth(3).click();
    assert.equal(await page.evaluate(()=>S.activeTab),'settings','real mouse click must work');
    await page.evaluate(()=>{S.setCollapsed.data=false;});
    // Settings groups may start collapsed; expand the backup section using its actual heading.
    await page.locator('[data-i="databackup"]').click();
    const exportButton=page.locator('button[onclick="exportBackup()"]');
    if(!await exportButton.isVisible())await page.locator('[data-i="databackup"]').click();
    await exportButton.scrollIntoViewIfNeeded();
    const downloadPromise=page.waitForEvent('download');await exportButton.click();const download=await downloadPromise;
    const copy=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(copy.__myfin_transfer,1);assert.ok(!JSON.stringify(copy).includes('SYNTHETIC-SECRET'));
    await page.evaluate(()=>{S=createAppState();S.theme='dark';S.motionMode='quiet';S.automationPaused=true;S.fx={...DEFAULT_FX,updated:Date.now()};S.txns=[{id:'computer-record',date:'2026-09-03',type:'income',amtHKD:200,amount:200,cur:'HKD',acctId:'cash',catId:'income'}];saveS({skipCloud:true});window.beforeCopy=localStorage.getItem('fos8');});
    const fileInput=page.locator('input[type="file"][onchange="restoreFromFile(this)"]');
    await fileInput.setInputFiles({name:'myfin-phone.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(copy))});
    await page.locator('#backup-preview strong').waitFor();
    assert.match(await page.locator('[data-i="copybackup"]').innerText(),/不含設定密鑰/);
    assert.match(await page.locator('[data-i="restorebackup"]').innerText(),/預覽/);
    await page.locator('#backup-preview').scrollIntoViewIfNeeded();await page.clock.runFor(500);
    await page.screenshot({path:fileURLToPath(new URL('preview-'+width+'.png',out)),animations:'disabled'});
    const preview=await page.locator('#backup-preview').innerText();assert.match(preview,/未合併/);
    await page.locator('button[onclick="confirmBackupImport()"]').click();
    const evidence=await page.evaluate(()=>({originalUnchanged:localStorage.getItem('fos8')===window.beforeCopy,profiles:profilesMeta().list.length,active:activeProfileId()}));
    assert.equal(evidence.originalUnchanged,true);assert.equal(evidence.profiles,2);assert.equal(evidence.active,'default');
    await page.locator('#backup-preview button').first().click();
    const imported=await page.evaluate(()=>({id:S.txns[0].id,cloud:S.cloud.on,paused:S.automationPaused}));assert.deepEqual(imported,{id:'phone-record',cloud:false,paused:true});
    assert.equal(await page.locator('#backup-out').inputValue(),'','prior profile export text must be cleared');
    assert.equal(await page.locator('#backup-preview').innerText(),'','prior profile preview must be cleared');
    await page.locator('.bottom-nav .tab-btn').nth(3).click();
    await page.locator('[data-i="databackup"]').click();
    if(!await page.locator('#backup-automation').isVisible())await page.locator('[data-i="databackup"]').click();
    assert.equal(await page.locator('#backup-automation').isVisible(),true);
    await page.locator('#backup-automation').scrollIntoViewIfNeeded();await page.clock.runFor(500);
    await page.screenshot({path:fileURLToPath(new URL('imported-'+width+'.png',out)),animations:'disabled'});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);assert.equal(overflow,false);
    results.push({width,...evidence,imported,overflow});await ctx.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(new URL('browser-results.json',out),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors},null,2));
}finally{await browser.close();}
