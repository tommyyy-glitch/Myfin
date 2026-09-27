// Synthetic ledgers and safe-area values: this is not an iOS status-bar emulator.
import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.MYFIN_PLAYWRIGHT_PATH||'playwright');
const {PNG}=await import(process.env.MYFIN_PNGJS_PATH||'pngjs');
const root=new URL('../',import.meta.url),out=new URL('../reports/iphone-safe-area-2026-09-27/',import.meta.url);
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(!['index.html','cloud-auth.js','cloud-ui.js','browser-chrome.js','manifest.webmanifest'].includes(name)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.webmanifest')?'application/manifest+json':'text/html');
  res.end(fs.readFileSync(name==='index.html'&&process.env.MYFIN_TEST_HTML?process.env.MYFIN_TEST_HTML:new URL(name,root)));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.MYFIN_BROWSER_EXECUTABLE});
const errors=[],results=[];
try{
  // Hold the blocking external script: inspect first paint before app initialization.
  for(const theme of ['light','dark']){
    const context=await browser.newContext({serviceWorkers:'block'});
    await context.addInitScript(theme=>localStorage.setItem('fos8',JSON.stringify({theme})),theme);
    let release;const gate=new Promise(resolve=>{release=resolve;});
    await context.route('**/*',async route=>{
      if(new URL(route.request().url()).origin===origin)return route.continue();
      if(route.request().url().includes('xlsx.full.min.js'))await gate;
      return route.abort();
    });
    const page=await context.newPage();
    try{
      await page.goto(origin,{waitUntil:'commit'});
      await page.waitForFunction(()=>document.documentElement.dataset.initialTheme);
      const first=await page.evaluate(()=>({mode:document.documentElement.dataset.initialTheme,bg:getComputedStyle(document.documentElement).backgroundColor,body:!!document.body}));
      assert.equal(first.mode,theme);assert.equal(first.bg,theme==='dark'?'rgb(15, 110, 86)':'rgb(29, 158, 117)');
      assert.equal(first.body,false,'theme must resolve before the blocked body/app is parsed');
    }finally{release();await context.close();}
  }
  // A zero top inset matches the layout reported by older installed iOS apps,
  // but Chromium still cannot model the system-owned area above that viewport.
  for(const [width,height,top,side] of [[393,852,59,0],[393,852,0,0],[852,393,0,59],[360,780,47,0],[1280,900,0,0]]){
    for(const standalone of [false,true]){
      const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,serviceWorkers:'block',timezoneId:'Asia/Hong_Kong'});
      await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
      await context.addInitScript(value=>Object.defineProperty(navigator,'standalone',{value}),standalone);
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
      await page.goto(origin,{waitUntil:'load'});
      assert.equal(await page.locator('meta[name="apple-mobile-web-app-capable"]').count(),1,'full-screen capability must be declared');
      assert.equal(await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute('content'),'yes');
      assert.equal(await page.locator('meta[name="apple-mobile-web-app-status-bar-style"]').getAttribute('content'),'black-translucent');
      assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('pwa-standalone')),standalone);
      await page.waitForFunction(()=>typeof _refreshing!=='undefined'&&!_refreshing);
      await page.addStyleTag({content:`:root{--st:${top}px!important;--sl:${side}px!important;--sr:${side}px!important}*{animation:none!important;transition:none!important}`});
      await page.evaluate(()=>{S=createAppState();S.automationPaused=true;S.motionMode='quiet';});
      for(const theme of ['light','dark','auto']){
        await page.evaluate(theme=>{S.theme=theme;applyTheme();},theme);
        const paint=await page.evaluate(()=>({root:getComputedStyle(document.documentElement).backgroundColor,body:getComputedStyle(document.body).backgroundColor,bodyImage:getComputedStyle(document.body).backgroundImage,scheme:getComputedStyle(document.documentElement).colorScheme,meta:document.querySelector('meta[name="theme-color"]').content,mode:document.body.classList.contains('dark')?'dark':'light'}));
        const pageColor=paint.mode==='dark'?'rgb(14, 14, 18)':'rgb(240, 239, 233)';
        const heroColor=paint.mode==='dark'?'rgb(15, 110, 86)':'rgb(29, 158, 117)';
        assert.equal(paint.root,heroColor,'document canvas must match the green hero');
        if(paint.bodyImage==='none')assert.equal(paint.body,pageColor);
        else assert.ok(paint.bodyImage.includes(pageColor),'wide-layout gradient must retain the theme background');
        assert.equal(paint.scheme,paint.mode);
        assert.equal(paint.meta,heroColor);
        for(let tab=0;tab<4;tab++){
          await page.evaluate(tab=>goTabIndex(tab),tab);
          const title=page.locator('.screen.active .nav-title');
          if(await title.count())assert.ok((await title.first().boundingBox()).y>=top,'navigation title must clear status area');
          if(tab>0){
            assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'),pageColor);
            assert.equal(await page.locator('#app-status-guard').evaluate(el=>getComputedStyle(el).backgroundColor),pageColor,'global cap follows the active tab');
          }
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        }
        await page.evaluate(()=>{goTabIndex(0);const sc=document.getElementById('home-scroll');sc.scrollTop=0;sc.dispatchEvent(new Event('scroll'));updateBrowserChrome();});
        const profile=await page.locator('#profile-chip').boundingBox();
        assert.ok(profile.y>=top);
        // The app also uses its existing navigator.standalone class as a CSS fallback.
        // This exercises that fallback, not native iOS system chrome.
        const capApplies=await page.evaluate(()=>matchMedia('(max-width:759px),(display-mode:standalone)').matches||document.documentElement.classList.contains('pwa-standalone'));
        const cap=await page.locator('#app-status-guard').evaluate(el=>{
          const s=getComputedStyle(el),r=el.getBoundingClientRect();
          return {position:s.position,opacity:s.opacity,bg:s.backgroundColor,image:s.backgroundImage,pointerEvents:s.pointerEvents,x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};
        });
        if(capApplies){
          assert.equal(cap.position,'fixed');assert.equal(cap.opacity,'1');assert.equal(cap.bg,heroColor);
          assert.equal(cap.image,'none');assert.equal(cap.pointerEvents,'none');
          assert.equal(cap.x,0);assert.equal(cap.y,0);assert.equal(cap.width,width);
          assert.equal(cap.height,Math.max(top,12),'a solid edge remains when an older install reports zero safe inset');
          assert.ok(cap.bottom<=profile.y,'fixed cap must stay above profile controls');
        }else{
          assert.equal(await page.locator('#app-status-guard').isVisible(),false,'desktop layout has no overlay cap');
          assert.equal(cap.height,0);
        }
        await page.evaluate(()=>{const sc=document.getElementById('home-scroll');sc.scrollTop=100;sc.dispatchEvent(new Event('scroll'));updateBrowserChrome();});
        const guard=await page.locator('#app-status-guard').evaluate(el=>{const s=getComputedStyle(el);return {opacity:s.opacity,bg:s.backgroundColor,mask:s.maskImage,height:el.getBoundingClientRect().height};});
        assert.equal(guard.opacity,'1');assert.equal(guard.bg,heroColor,'the pinned home toolbar keeps chrome stable throughout scrolling');assert.equal(guard.mask,'none');assert.equal(guard.height,capApplies?Math.max(top,12):0);
        assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).backgroundColor),guard.bg,'native canvas and fixed toolbar retain the same color');
        if(width===393&&standalone&&theme!=='auto')await page.screenshot({path:fileURLToPath(new URL(`${theme}-inset-${top}-scrolled.png`,out))});
        await page.evaluate(()=>{const sc=document.getElementById('home-scroll');sc.scrollTop=0;sc.dispatchEvent(new Event('scroll'));updateBrowserChrome();});
        assert.equal(await page.locator('#app-status-guard').evaluate(el=>getComputedStyle(el).opacity),'1');
        if(width===393&&standalone&&theme!=='auto'){
          // These are actual DOM cap/hero pixels only. Do not model the native
          // status bar as exposed html: iOS may instead sample a fixed container.
          const png=PNG.sync.read(await page.screenshot({path:fileURLToPath(new URL(`${theme}-inset-${top}-home.png`,out))}));
          const pixel=(x,y)=>Array.from(png.data.subarray((y*png.width+x)*4,(y*png.width+x)*4+4));
          const expected=paint.mode==='dark'?[15,110,86,255]:[29,158,117,255];
          for(const x of [8,196,384]){
            assert.deepEqual(pixel(x,4),expected,'fixed cap must paint a solid top edge');
            assert.deepEqual(pixel(x,cap.height),expected,'cap and hero must match inside the web viewport');
          }
        }
        results.push({width,height,standaloneSimulated:standalone,theme,safeAreaSimulated:{top,side},fixedCapApplied:capApplies,passed:true});
      }
      await context.close();
    }
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(new URL('results.json',out),JSON.stringify({engine:'Chromium',limitations:'Synthetic safe-area and navigator.standalone flag only; CSS standalone media is not emulated; the existing pwa-standalone class fallback is exercised. Zero safe inset tests web content geometry, not installed iOS metadata, native color sampling, Safari chrome or iPhone status icons. Native cold-launch acceptance is required.',results,errors},null,2));
  console.log(`2 blocked-startup theme checks and ${results.length} layout/theme scenarios passed; no page errors.`);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
