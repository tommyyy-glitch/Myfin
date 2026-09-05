// Isolated browser QA: synthetic identities, encrypted fixtures, no live Supabase requests.
import fs from 'node:fs';import http from 'node:http';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.MYFIN_PLAYWRIGHT_PATH||'playwright');
const root=new URL('../',import.meta.url),out=new URL('../reports/personal-cloud-2026-09-06/',import.meta.url);
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';if(!['index.html','cloud-auth.js','cloud-ui.js'].includes(name)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(new URL(name,root)));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.MYFIN_BROWSER_EXECUTABLE?{executablePath:process.env.MYFIN_BROWSER_EXECUTABLE}:{})});
const errors=[],requests=[],contexts=[];let remote=null;
async function device(width,id){
  const ctx=await browser.newContext({viewport:{width,height:960},isMobile:width<500,hasTouch:width<500,timezoneId:'Asia/Hong_Kong',colorScheme:'dark',serviceWorkers:'block'});contexts.push(ctx);
  await ctx.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());if(url.origin===origin)return route.continue();
    if(url.origin!=='https://synthetic-test.supabase.co')return route.abort();
    requests.push({device:id,path:url.pathname,query:url.search,method:req.method(),headers:req.headers(),body:req.postDataJSON()});
    if(url.pathname.startsWith('/auth/v1/token'))return route.fulfill({json:{access_token:'test-access',refresh_token:'test-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'00000000-0000-4000-8000-000000000001',email:'synthetic@example.com'}}});
    if(url.pathname==='/auth/v1/signup')return route.fulfill({json:{user:{id:'00000000-0000-4000-8000-000000000001'}}});
    if(url.pathname==='/auth/v1/logout')return route.fulfill({json:{}});
    assert.equal(req.headers().authorization,'Bearer test-access');assert.equal(req.headers().apikey,'sb_publishable_test');
    if(req.method()==='GET')return route.fulfill({json:remote?[{ver:remote.ver,salt:remote.salt,iv:remote.iv,data:remote.data}]:[]});
    if(req.method()==='POST'){if(remote)return route.fulfill({status:409,json:{}});remote=req.postDataJSON();return route.fulfill({status:201,json:[{ver:remote.ver}]});}
    throw new Error('Unexpected request '+req.method()+' '+url);
  });
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(origin+'/?cloud=login',{waitUntil:'load'});
  assert.equal(await page.locator('#cloud-email').isVisible(),true,'direct login link opens actual email field');
  await page.locator('.cloud-panel').screenshot({path:fileURLToPath(new URL('login-form-'+width+'.png',out))});
  await page.evaluate(id=>{S=createAppState();S.theme='dark';S.motionMode='quiet';S.automationPaused=true;S.fx={...DEFAULT_FX,updated:Date.now()};S.txns=[{id,date:'2026-09-04',type:'expense',amount:12,amtHKD:12,cur:'HKD',catId:'food',acctId:'cash'}];saveS({skipCloud:true});applyTheme();applyI18n();renderHome();},id);
  await page.locator('.bottom-nav .tab-btn').nth(3).click();if(!await page.locator('#cloud-email').isVisible())await page.locator('[data-i="cloudsync"]').click();
  await page.locator('#cloud-service-settings summary').click();
  await page.locator('#cloud-url').fill('https://synthetic-test.supabase.co');await page.locator('#cloud-key').fill('sb_publishable_test');
  await page.locator('#cloud-pass').fill('synthetic encryption phrase');await page.locator('#cloud-email').fill('synthetic@example.com');
  await page.locator('#cloud-password').fill('x'.repeat(5));await page.getByRole('button',{name:'建立 Myfin 帳戶',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('cloud-auth-message').textContent.includes('至少 6 個字元'));
  assert.equal(requests.filter(r=>r.device===id).length,0,'under-minimum signup is blocked before any network request');
  await page.locator('#cloud-password').fill('x'.repeat(6));await page.getByRole('button',{name:'建立 Myfin 帳戶',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('cloud-auth-message').textContent.includes('請到電郵按確認連結'));
  const signup=requests.filter(r=>r.device===id);assert.equal(signup.length,1);assert.equal(signup[0].path,'/auth/v1/signup');
  assert.equal(signup[0].body.password.length,6);assert.equal(await page.locator('#cloud-password').inputValue(),'');
  assert.equal(await page.locator('#cloud-signout').isVisible(),false,'signup still does not auto-login');
  await page.locator('#cloud-password').fill('test password not stored');
  await page.getByRole('button',{name:'登入 Myfin',exact:true}).click();await page.locator('#cloud-signout').waitFor({state:'visible'});
  assert.equal(requests.filter(r=>r.device===id&&r.path.startsWith('/rest/')).length,0,'login never reads/writes ledger');
  assert.equal(await page.locator('#cloud-password').inputValue(),'');
  const stored=await page.evaluate(()=>JSON.stringify({...localStorage}));assert.ok(!stored.includes('test-access')&&!stored.includes('test password not stored'));
  assert.equal(await page.evaluate(()=>cloudReady()),false);
  return page;
}
try{
  const phone=await device(390,'phone-original');
  await phone.locator('#cloud-service-settings summary').click();
  await phone.locator('.cloud-panel').screenshot({path:fileURLToPath(new URL('login-phone.png',out))});
  await phone.getByRole('button',{name:'預覽：本機 → 新雲端副本',exact:true}).click();await phone.locator('#cloud-preview').waitFor({state:'visible'});
  assert.equal(remote,null,'preview must not upload');
  // Stale previews fail closed when the local ledger changes before confirmation.
  await phone.evaluate(()=>{S.txns.push({id:'added-before-confirmation'});saveS();});
  await phone.locator('#cloud-first-confirm').click();await phone.waitForFunction(()=>document.getElementById('cloud-auth-message').textContent.includes('重新預覽'));
  assert.equal(remote,null);
  await phone.getByRole('button',{name:'預覽：本機 → 新雲端副本',exact:true}).click();await phone.waitForFunction(()=>document.getElementById('cloud-auth-message').textContent.includes('預覽完成'));
  await phone.locator('#cloud-first-confirm').click();await phone.waitForFunction(()=>document.getElementById('cloud-auth-message').textContent.includes('已建立並連結'));
  assert.equal(remote.id,'main');assert.equal(remote.owner_id,'00000000-0000-4000-8000-000000000001');assert.ok(!remote.data.includes('phone-original'));
  assert.equal(await phone.evaluate(()=>cloudReady()),false,'first upload does not enable automatic sync');
  const uploads=requests.filter(r=>r.method==='POST'&&r.path.startsWith('/rest/')).length;
  // Saving while paused remains dirty, so a later cloud version cannot silently overwrite offline edits.
  await phone.evaluate(()=>{S.txns.push({id:'edited-while-paused'});saveS();});assert.equal(await phone.evaluate(()=>S.cloud.pending),true);
  await phone.getByRole('button',{name:'預覽：本機 → 新雲端副本',exact:true}).click();await phone.waitForFunction(()=>document.getElementById('cloud-auth-message').textContent.includes('已有資料'));
  assert.equal(requests.filter(r=>r.method==='POST'&&r.path.startsWith('/rest/')).length,uploads);
  const desktop=await device(1280,'desktop-original');
  const before=await desktop.evaluate(()=>localStorage.getItem('fos8'));
  await desktop.getByRole('button',{name:'預覽：雲端 → 另一份本機帳本',exact:true}).click();await desktop.locator('#cloud-preview').waitFor({state:'visible'});
  assert.equal(await desktop.evaluate(()=>profilesMeta().list.length),1);
  await desktop.locator('#cloud-preview').screenshot({path:fileURLToPath(new URL('receive-preview.png',out))});
  await desktop.locator('#cloud-preview').getByRole('button',{name:'取消',exact:true}).click();assert.equal(await desktop.locator('#cloud-preview').isVisible(),false);assert.equal(await desktop.evaluate(()=>profilesMeta().list.length),1);
  await desktop.getByRole('button',{name:'預覽：雲端 → 另一份本機帳本',exact:true}).click();await desktop.locator('#cloud-preview').waitFor({state:'visible'});
  await desktop.locator('#cloud-first-confirm').click();await desktop.waitForFunction(()=>document.getElementById('cloud-auth-message').textContent.includes('已接收為另一份'));
  const result=await desktop.evaluate(()=>{const meta=profilesMeta(),p=JSON.parse(localStorage.getItem(profileKey(meta.list.at(-1).id)));return {original:localStorage.getItem('fos8'),active:meta.active,profiles:meta.list.length,imported:p};});
  assert.equal(result.original,before);assert.equal(result.active,'default');assert.equal(result.profiles,2);assert.equal(result.imported.cloud.linked,true);assert.equal(result.imported.cloud.on,false);assert.equal(result.imported.automationPaused,true);assert.equal(result.imported.txns[0].id,'phone-original');
  await desktop.evaluate(()=>switchProfile(profilesMeta().list.at(-1).id));assert.equal(await desktop.evaluate(()=>S.cloud.vaultId),'main');
  // Logout cancels a prepared download without creating any second copy.
  await desktop.locator('.bottom-nav .tab-btn').nth(3).click();
  if(!await desktop.locator('#cloud-signout').isVisible())await desktop.locator('[data-i="cloudsync"]').click();
  await desktop.getByRole('button',{name:'預覽：雲端 → 另一份本機帳本',exact:true}).click();await desktop.locator('#cloud-preview').waitFor({state:'visible'});
  await desktop.locator('#cloud-signout').click();assert.equal(await desktop.locator('#cloud-preview').isVisible(),false);assert.equal(await desktop.evaluate(()=>profilesMeta().list.length),2);
  assert.equal(await desktop.evaluate(()=>cloudReady()),false);
  const ledgerRequests=requests.filter(r=>r.path.startsWith('/rest/')).length;
  await phone.reload({waitUntil:'load'});assert.equal(await phone.evaluate(()=>cloudReady()),false,'reloading a signed-in linked profile still requires explicit sync approval');
  assert.equal(requests.filter(r=>r.path.startsWith('/rest/')).length,ledgerRequests,'reload makes no cloud ledger requests');
  for(const page of [phone,desktop])assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  const evidence={passed:true,widths:[390,1280],sixCharacterSignup:true,shortSignupBlocked:true,signupLedgerRequests:0,loginLedgerRequests:0,encryptedUploads:uploads,stalePreviewBlocked:true,existingRemoteNotOverwritten:true,originalDesktopPreserved:true,importedPaused:true,logoutCancelsPreview:true,errors};
  fs.writeFileSync(new URL('browser-results.json',out),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
