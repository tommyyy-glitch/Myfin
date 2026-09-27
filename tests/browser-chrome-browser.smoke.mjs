// Public, synthetic fixtures only. Chromium pixels verify web content, not iOS's native status area.
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import {fileURLToPath} from 'node:url';

const {chromium}=await import(process.env.MYFIN_PLAYWRIGHT_PATH||'playwright');
const {PNG}=await import(process.env.MYFIN_PNGJS_PATH||'pngjs');
const root=new URL('../',import.meta.url);
const out=new URL('../reports/browser-chrome-2026-09-27/',import.meta.url);
fs.mkdirSync(out,{recursive:true});
const current=fs.readFileSync(new URL('index.html',root),'utf8');
const baseline=cp.execFileSync('git',['show','7ea56f04:index.html'],{cwd:fileURLToPath(root),encoding:'utf8'});
const scripts=html=>(html.match(/<script\b[^>]*>[\s\S]*?<\/script>/g)||[])
  .filter(script=>!/^<script\b[^>]*\bsrc=["'](?:\.\/)?browser-chrome\.js(?:\?[^"']*)?["']/i.test(script));
assert.deepEqual(scripts(current),scripts(baseline),'Every existing application script must remain byte-identical to 7ea56f04');
assert.equal((current.match(/src=["'](?:\.\/)?browser-chrome\.js(?:\?[^"']*)?["']/g)||[]).length,1,'Load the isolated chrome module exactly once');

// Never expose backups or the working directory through this test server.
const publicFiles=new Set(['index.html','browser-chrome.js','cloud-auth.js','cloud-ui.js','manifest.webmanifest','icon-180.png','icon-512.png']);
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://local').pathname.slice(1)||'index.html';
  if(name==='favicon.ico'){res.writeHead(204);return res.end();}
  if(!publicFiles.has(name)){res.writeHead(404);return res.end();}
  const path=new URL(name,root);
  if(!fs.existsSync(path)){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.png')?'image/png':name.endsWith('.webmanifest')?'application/manifest+json':'text/html');
  res.end(fs.readFileSync(path));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.MYFIN_BROWSER_EXECUTABLE});
const results=[],errors=[],blockedResourceDiagnostics=[];
const rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number);
const near=(actual,expected,label,tolerance=3)=>actual.forEach((channel,index)=>assert.ok(Math.abs(channel-expected[index])<=tolerance,`${label}: actual ${actual}, expected ${expected}`));
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const snapshot=page=>page.evaluate(()=>JSON.stringify(profileSnapshot()));
async function capState(page){
  return page.locator('#app-status-guard').evaluate(el=>{
    const s=getComputedStyle(el),r=el.getBoundingClientRect();
    return {directBody:el.parentElement===document.body,hidden:el.getAttribute('aria-hidden'),display:s.display,position:s.position,opacity:s.opacity,bg:s.backgroundColor,image:s.backgroundImage,pointerEvents:s.pointerEvents,zIndex:s.zIndex,x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,meta:document.querySelector('meta[name="theme-color"]').content,root:getComputedStyle(document.documentElement).backgroundColor};
  });
}
async function pixels(page,label,visible,{compareBelow=true,save=false}={}){
  const state=await capState(page);
  if(!visible)return state;
  const png=PNG.sync.read(await page.screenshot(save?{path:fileURLToPath(new URL(label+'.png',out))}:{}));
  const hero=await page.locator('#s-home .hero-card').boundingBox();
  const x=Math.max(2,Math.ceil(hero?.x||0)+3),above=Math.max(0,Math.floor(state.bottom)-1),below=Math.ceil(state.bottom);
  const pixel=(px,py)=>Array.from(png.data.subarray((py*png.width+px)*4,(py*png.width+px)*4+3));
  // Installed landscape layouts center the page but the native status area and
  // fixed cap span the full viewport. Check both gutters as well as page content.
  const homeActive=await page.locator('#s-home').evaluate(el=>el.classList.contains('active'));
  const sampleXs=[...new Set(homeActive&&compareBelow?[x,5,png.width-5]:[x])];
  for(const px of sampleXs){
    near(pixel(px,above),rgb(state.bg),label+' cap paints its opaque color at x='+px,0);
    if(compareBelow)near(pixel(px,above),pixel(px,below),label+' cap joins the surface immediately below at x='+px);
  }
  return state;
}
async function noOverflow(page,label){
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,label+' must not overflow horizontally');
}

try{
  // A stalled CDN must not postpone the correct initial canvas theme.
  for(const theme of ['light','dark']){
    const context=await browser.newContext({serviceWorkers:'block'});
    await context.addInitScript(theme=>localStorage.setItem('fos8',JSON.stringify({theme})),theme);
    let release;const gate=new Promise(resolve=>{release=resolve;});
    await context.route('**/*',async route=>{
      if(new URL(route.request().url()).origin===origin)return route.continue();
      if(route.request().url().includes('xlsx.full.min.js'))await gate;
      return route.fulfill({status:200,contentType:route.request().resourceType()==='stylesheet'?'text/css':'text/javascript',body:''});
    });
    try{
      const page=await context.newPage();await page.goto(origin,{waitUntil:'commit'});
      await page.waitForFunction(()=>document.documentElement.dataset.initialTheme);
      const initial=await page.evaluate(()=>({theme:document.documentElement.dataset.initialTheme,color:getComputedStyle(document.documentElement).backgroundColor,body:!!document.body}));
      assert.equal(initial.theme,theme);assert.equal(initial.body,false);
      near(rgb(initial.color),theme==='dark'?[15,110,86]:[29,158,117],'initial '+theme,0);
    }finally{release();await context.close();}
  }

  const cases=[
    {name:'portrait',width:393,height:852,top:59,side:0,standalone:true},
    {name:'legacy',width:393,height:852,top:0,side:0,standalone:true},
    {name:'compact',width:393,height:400,top:59,side:0,standalone:true},
    {name:'landscape',width:852,height:393,top:0,side:59,standalone:true},
    {name:'desktop',width:1280,height:900,top:0,side:0,standalone:false}
  ];
  for(const scenario of cases)for(const theme of ['light','dark']){
    const {width,height,top,side,standalone}=scenario,label=scenario.name+'-'+theme;
    const context=await browser.newContext({viewport:{width,height},isMobile:width<1000,hasTouch:width<1000,deviceScaleFactor:1,serviceWorkers:'block',timezoneId:'Asia/Hong_Kong',reducedMotion:'reduce'});
    await context.route('**/*',route=>{
      if(new URL(route.request().url()).origin===origin)return route.continue();
      const type=route.request().resourceType();
      // Empty public CDN assets avoid expected network-error noise. Remote APIs stay blocked.
      if(type==='script'||type==='stylesheet'||type==='font')return route.fulfill({status:200,contentType:type==='stylesheet'?'text/css':'text/javascript',body:''});
      return route.abort();
    });
    await context.addInitScript(({standalone,theme})=>{
      Object.defineProperty(navigator,'standalone',{value:standalone});
      localStorage.setItem('fos8',JSON.stringify({theme,automationPaused:true,motionMode:'quiet'}));
    },{standalone,theme});
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push({label,type:'pageerror',message:error.message}));
    page.on('console',message=>{
      if(message.type()!=='error')return;
      const value={label,type:'console',message:message.text()};
      if(/Failed to load resource: net::ERR_FAILED/.test(value.message))blockedResourceDiagnostics.push(value);
      else errors.push(value);
    });
    await page.clock.setFixedTime(new Date('2026-09-27T14:30:00Z'));
    await page.goto(origin,{waitUntil:'load'});
    await page.waitForFunction(()=>typeof _refreshing!=='undefined'&&!_refreshing);
    await page.addStyleTag({content:`:root{--st:${top}px!important;--sl:${side}px!important;--sr:${side}px!important}*{animation:none!important;transition:none!important}`});
    await page.evaluate(theme=>{
      S=createAppState();S.theme=theme;S.motionMode='quiet';S.automationPaused=true;S.cloud={};S.notify=notifyDefaults();S.ai={};
      S.fx={...DEFAULT_FX,updated:Date.parse('2026-09-27T14:30:00Z')};FX=S.fx;
      S.txns=[{id:'chrome-synthetic',date:'2026-09-26',type:'expense',amount:123.45,amtHKD:123.45,cur:'HKD',catId:'food',acctId:'cash',note:'Synthetic UI regression fixture'}];
      applyTheme();applyI18n();goTabIndex(0);renderHome();saveS({skipCloud:true});
    },theme);
    await settle(page);
    const visible=width<760||standalone;
    let cap=await capState(page);
    assert.equal(cap.directBody,true);assert.equal(cap.hidden,'true');
    if(visible){
      assert.equal(cap.position,'fixed');assert.equal(cap.opacity,'1');assert.equal(cap.image,'none');assert.equal(cap.pointerEvents,'none');
      assert.ok(Number(cap.zIndex)>50,'cap must paint above modal backdrops');
      assert.equal(cap.x,0);assert.equal(cap.y,0);assert.equal(cap.width,width);assert.equal(cap.height,Math.max(top,12));
      const profile=await page.locator('#profile-chip').boundingBox();assert.ok(profile.y>=cap.bottom,'profile control clears cap');
    }else assert.equal(cap.display,'none','normal desktop must not get a fixed phone cap');
    near(rgb(cap.bg),theme==='dark'?[15,110,86]:[29,158,117],label+' first home cap',0);
    near(rgb(cap.root),rgb(cap.bg),label+' root canvas',0);near(rgb(cap.meta),rgb(cap.bg),label+' theme color',0);
    await pixels(page,label+'-home',visible,{save:scenario.name==='portrait'});await noOverflow(page,label);

    // The home header is outside the scroller. iOS never needs to repaint its
    // system-owned area in sync with a moving gradient beneath that header.
    const header=page.locator('#home-nav'),headerRect=await header.boundingBox();
    const structure=await header.evaluate(el=>({
      outsideScroller:!document.getElementById('home-scroll').contains(el),
      sameScreen:el.parentElement===document.getElementById('home-scroll').parentElement,
      ownsProfile:el.contains(document.getElementById('profile-chip')),
      ownsAI:el.contains(document.getElementById('ai-hero-btn')),
      background:getComputedStyle(el).backgroundColor
    }));
    assert.equal(structure.outsideScroller,true,label+' home header must not scroll with content');
    assert.equal(structure.sameScreen,true,label+' header and scroller share the home screen');
    assert.equal(structure.ownsProfile,true);assert.equal(structure.ownsAI,true);
    const homeColor=theme==='dark'?[15,110,86]:[29,158,117];
    near(rgb(structure.background),homeColor,label+' solid home header',0);
    const profileRect=await page.locator('#profile-chip').boundingBox(),aiRect=await page.locator('#ai-hero-btn').boundingBox();
    const geometry=await page.locator('#s-home .hero-card').evaluate(el=>({height:el.getBoundingClientRect().height}));
    const half=Math.floor(geometry.height*.5),past=Math.ceil(geometry.height+24);
    const scrollPositions=[...new Set([0,12,32,half,half+32,past])].sort((a,b)=>a-b);
    for(const position of scrollPositions){
      const actual=await page.locator('#home-scroll').evaluate((el,y)=>{el.scrollTop=y;el.dispatchEvent(new Event('scroll'));return el.scrollTop;},position);
      await settle(page);
      if(position>0)assert.ok(actual>0,label+' fixture must genuinely scroll');
      assert.deepEqual(await header.boundingBox(),headerRect,label+' header bounds stay fixed at scroll '+position);
      assert.deepEqual(await page.locator('#profile-chip').boundingBox(),profileRect,label+' profile control stays fixed');
      assert.deepEqual(await page.locator('#ai-hero-btn').boundingBox(),aiRect,label+' AI control stays fixed');
      const scrollRect=await page.locator('#home-scroll').boundingBox();
      assert.ok(scrollRect.y>=headerRect.y+headerRect.height-.5,label+' scrolling content remains below header');
      cap=await pixels(page,label+'-scroll-'+position,visible,{save:scenario.name==='portrait'&&(position===half||position===past)});
      near(rgb(cap.bg),homeColor,label+' stable cap at scroll '+position,0);
      near(rgb(cap.meta),homeColor,label+' stable native theme hint at scroll '+position,0);
      near(rgb(cap.root),homeColor,label+' stable root canvas at scroll '+position,0);
    }

    // Each tab owns the same top canvas; a home-only fix is insufficient.
    for(const tab of [1,2,3]){
      await page.evaluate(tab=>goTabIndex(tab),tab);await settle(page);
      cap=await capState(page);near(rgb(cap.bg),theme==='dark'?[14,14,18]:[240,239,233],label+' tab '+tab,0);
      if(visible)assert.notEqual(cap.display,'none');
      await pixels(page,label+'-tab-'+tab,visible);await noOverflow(page,label+' tab '+tab);
    }
    await page.evaluate(()=>{goTabIndex(0);const sc=document.getElementById('home-scroll');sc.scrollTop=0;sc.dispatchEvent(new Event('scroll'));});await settle(page);
    if(height<500)await page.locator('#home-add-record').evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
    else await page.locator('#home-add-record').scrollIntoViewIfNeeded();
    await settle(page);
    const before=await snapshot(page),storedBefore=await page.evaluate(()=>localStorage.getItem('fos8'));
    const base=rgb((await capState(page)).bg);
    // Open the actual entry flow and cancel through its actual close control.
    await page.locator('#home-add-record').click();await page.locator('#m-txn.open').waitFor();await settle(page);
    cap=await capState(page);near(rgb(cap.bg),base.map(value=>Math.round(value*.45)),label+' real entry dimming',1);
    const close=await page.locator('#m-txn .mclose').boundingBox(),sheet=await page.locator('#m-txn .modal').boundingBox();
    if(visible){assert.ok(sheet.y>=cap.bottom+8-.5,`${label} sheet clears top cap by 8px: sheetY=${sheet.y}, capBottom=${cap.bottom}`);assert.ok(close.y>=cap.bottom,label+' close remains below cap');}
    assert.ok(close.height>=44);assert.ok(close.y+close.height<=height,label+' close stays in viewport');
    await pixels(page,label+'-entry',visible,{compareBelow:false,save:scenario.name==='portrait'||scenario.name==='compact'});
    if(scenario.name==='portrait'){
      await page.setViewportSize({width,height:400});await settle(page);
      const resizedCap=await capState(page),resizedSheet=await page.locator('#m-txn .modal').boundingBox(),resizedClose=await page.locator('#m-txn .mclose').boundingBox();
      assert.ok(resizedSheet.y>=resizedCap.bottom+8-.5,label+' resized sheet clears cap');
      assert.ok(resizedClose.y>=resizedCap.bottom&&resizedClose.y+resizedClose.height<=400,label+' resized close stays reachable');
      await page.setViewportSize({width,height});await settle(page);
    }
    await page.locator('#m-txn .mclose').click();await settle(page);
    assert.equal(await snapshot(page),before,label+' cancelling leaves every persisted snapshot field unchanged');
    assert.equal(await page.evaluate(()=>localStorage.getItem('fos8')),storedBefore,label+' cancelling leaves stored ledger bytes unchanged');
    near(rgb((await capState(page)).bg),base,label+' close restores home color',0);

    // A second backdrop should dim the already dimmed surface once more.
    await page.evaluate(()=>{document.getElementById('m-txn').classList.add('open');document.getElementById('m-ar').classList.add('open');});await settle(page);
    cap=await capState(page);near(rgb(cap.bg),base.map(value=>Math.round(value*.45*.45)),label+' stacked modal dimming',1);
    await page.evaluate(()=>document.getElementById('m-ar').classList.remove('open'));await settle(page);
    near(rgb((await capState(page)).bg),base.map(value=>Math.round(value*.45)),label+' remove one backdrop',1);
    await page.evaluate(()=>document.getElementById('m-txn').classList.remove('open'));await settle(page);
    near(rgb((await capState(page)).bg),base,label+' remove final backdrop',0);

    // The observer must react even when body classes change without applyTheme().
    await page.evaluate(theme=>{document.getElementById('home-scroll').scrollTop=0;document.body.className=theme==='dark'?'light no-dance':'dark no-dance';},theme);await settle(page);
    near(rgb((await capState(page)).bg),theme==='dark'?[29,158,117]:[15,110,86],label+' body observer',0);
    await page.evaluate(theme=>document.body.className=theme+' no-dance',theme);await settle(page);
    await page.evaluate(()=>{
      document.documentElement.style.backgroundColor='rgb(255, 0, 255)';
      document.querySelector('meta[name="theme-color"]').content='#ff00ff';
      document.getElementById('app-status-guard').style.backgroundColor='rgb(255, 0, 255)';
      window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
    });await settle(page);
    near(rgb((await capState(page)).bg),theme==='dark'?[15,110,86]:[29,158,117],label+' pageshow restores canvas',0);
    await page.evaluate(()=>{
      document.getElementById('app-status-guard').style.backgroundColor='rgb(255, 0, 255)';
      window.visualViewport.dispatchEvent(new Event('resize'));
    });await settle(page);
    near(rgb((await capState(page)).bg),theme==='dark'?[15,110,86]:[29,158,117],label+' visual viewport resize restores canvas',0);
    await noOverflow(page,label+' final');
    results.push({scenario,theme,standaloneClassFallback:standalone&&width>=760,allExistingScriptsUnchanged:true,headerStableAcrossScroll:true,scrollPositions,capHeaderPixelsContinuous:true,homeGutterPixelsContinuous:visible?true:null,allTabs:true,realEntryCancelPreservesSnapshot:true,stackedBackdropComposition:true,bodyObserver:true,pageshow:true,visualViewportResize:true,passed:true});
    await context.close();
  }
  assert.deepEqual(errors,[],'No application console or page errors');
  fs.writeFileSync(new URL('results.json',out),JSON.stringify({baseline:'7ea56f04',engine:'Chromium',privateDataUsed:false,limitations:'Synthetic safe-area values and navigator.standalone exercise the authored .pwa-standalone CSS fallback, not Chromium display-mode emulation. Installed-iOS status icons, metadata retention, and system color sampling require separate real-device acceptance.',startupThemeChecks:2,results,errors,blockedResourceDiagnostics},null,2));
  console.log(`2 blocked-startup checks and ${results.length} browser-chrome scenarios passed; existing scripts unchanged; no application errors.`);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
