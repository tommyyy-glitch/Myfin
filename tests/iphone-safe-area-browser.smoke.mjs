// Synthetic ledgers and safe-area values: this is not an iOS status-bar emulator.
import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.MYFIN_PLAYWRIGHT_PATH||'playwright');
const root=new URL('../',import.meta.url),out=new URL('../reports/iphone-safe-area-2026-09-27/',import.meta.url);
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(!['index.html','cloud-auth.js','cloud-ui.js','manifest.webmanifest'].includes(name)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.webmanifest')?'application/manifest+json':'text/html');
  res.end(fs.readFileSync(name==='index.html'&&process.env.MYFIN_TEST_HTML?process.env.MYFIN_TEST_HTML:new URL(name,root)));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.MYFIN_BROWSER_EXECUTABLE});
const errors=[],results=[];
try{
  for(const [width,height,top,side] of [[393,852,59,0],[852,393,0,59],[360,780,47,0]]){
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
        if(paint.bodyImage==='none')assert.equal(paint.root,paint.body);
        else assert.ok(paint.bodyImage.includes(paint.root),'wide-layout gradient must retain the theme background');
        assert.equal(paint.scheme,paint.mode);
        assert.equal(paint.meta,paint.mode==='dark'?'#0F6E56':'#1D9E75');
        for(let tab=0;tab<4;tab++){
          await page.evaluate(tab=>goTabIndex(tab),tab);
          const title=page.locator('.screen.active .nav-title');
          if(await title.count())assert.ok((await title.first().boundingBox()).y>=top,'navigation title must clear status area');
          if(tab>0)assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'),paint.mode==='dark'?'#0e0e12':'#f0efe9');
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        }
        await page.evaluate(()=>{goTabIndex(0);document.getElementById('home-scroll').scrollTop=0;});
        assert.ok((await page.locator('#profile-chip').boundingBox()).y>=top);
        await page.evaluate(()=>{const sc=document.getElementById('home-scroll');sc.scrollTop=100;sc.dispatchEvent(new Event('scroll'));});
        const guard=await page.locator('#home-status-guard').evaluate(el=>{const s=getComputedStyle(el);return {opacity:s.opacity,bg:s.backgroundColor,mask:s.maskImage,height:el.getBoundingClientRect().height};});
        assert.equal(guard.opacity,'1');assert.equal(guard.bg,paint.root);assert.equal(guard.mask,'none');assert.equal(guard.height,top);
        assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'),paint.mode==='dark'?'#0e0e12':'#f0efe9');
        if(width===393&&standalone&&theme!=='auto')await page.screenshot({path:fileURLToPath(new URL(theme+'-scrolled.png',out))});
        await page.evaluate(()=>{const sc=document.getElementById('home-scroll');sc.scrollTop=0;sc.dispatchEvent(new Event('scroll'));});
        assert.equal(await page.locator('#home-status-guard').evaluate(el=>getComputedStyle(el).opacity),'0');
        if(width===393&&standalone&&theme!=='auto')await page.screenshot({path:fileURLToPath(new URL(theme+'-home.png',out))});
        results.push({width,height,standaloneSimulated:standalone,theme,safeAreaSimulated:{top,side},passed:true});
      }
      await context.close();
    }
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(new URL('results.json',out),JSON.stringify({engine:'Chromium',limitations:'Synthetic safe-area and standalone flag; no native Safari chrome or iPhone status icons',results,errors},null,2));
  console.log(`${results.length} layout/theme scenarios passed; no page errors.`);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
