// Synthetic R/P records only; never read a real phone ledger.
import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.MYFIN_PLAYWRIGHT_PATH||'playwright');
const root=new URL('../',import.meta.url),allowed=new Set(['index.html','cloud-auth.js','cloud-ui.js','browser-chrome.js','assets/vendor/xlsx-0.20.3.full.min.js']);
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
 if(!['GET','HEAD'].includes(req.method)||(!allowed.has(name)&&!/^assets\/(?:wallet-icons|holding-icons|category-icons|pnl-icons)\/[\w-]+\.(?:svg|png|jpe?g|webp)$/.test(name))){res.writeHead(404);return res.end();}
 try{const data=fs.readFileSync(new URL(name,root));res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.png')?'image/png':/\.jpe?g$/.test(name)?'image/jpeg':'text/html');res.end(req.method==='HEAD'?undefined:data);}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true,executablePath:process.env.MYFIN_BROWSER_EXECUTABLE}),results=[],errors=[];
const reports=new URL('../reports/rp-hidden/',import.meta.url);fs.mkdirSync(reports,{recursive:true});
try{
 for(const [width,height,theme] of [[360,640,'dark'],[393,852,'light'],[852,393,'dark'],[1280,900,'light']]){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);await page.waitForFunction(()=>!_refreshing);
  await page.evaluate(theme=>{
   localStorage.clear();ensureProfiles();S=createAppState();S.theme=theme;S.automationPaused=true;S.fx={...DEFAULT_FX,updated:Date.now()};
   S.accounts=[{id:'cash',label:'Synthetic cash',kind:'cash',secondaryKind:'none',cur:'HKD',opening:1000}];
   const base={cur:'HKD',date:'2026-01-01',settled:false,acctId:'cash'};
   S.people=[
    {...base,id:'old-pay',name:'Alex',desc:'Old unpaid dinner',dir:'p',originalAmount:150,originalAmtHKD:150,amount:120,amtHKD:120},
    {...base,id:'alex-recv',name:'Alex',desc:'Taxi receivable',dir:'r',amount:40,amtHKD:40},
    {...base,id:'bea-pay',name:'Bea',desc:'Recent payable',dir:'p',amount:30,amtHKD:30},
    {...base,id:'client',name:'Synthetic Client',desc:'Invoice receivable',dir:'r',amount:60,amtHKD:60,rpKind:'income',incomeReceivable:true,catId:'freelance'},
    {...base,id:'split',name:'Split Friend',desc:'Dinner split',dir:'r',amount:20,amtHKD:20,isGroupSplit:true,groupId:'synthetic-bill'},
    {...base,id:'done',name:'Completed',desc:'Already paid',dir:'p',amount:0,amtHKD:0,originalAmount:25,originalAmtHKD:25,settled:true},
   ];
   S.people.forEach(p=>{const tx=addRPMove(p,'open');if(tx)p.openTxnId=tx.id;});
   const partial=addRPMove(S.people[0],'settle',30,30);partial.date='2026-02-01';syncRPSettlementState(S.people[0]);
   addRPMove(S.people.at(-1),'settle',25,25);syncRPSettlementState(S.people.at(-1));
   saveS({skipCloud:true});applyTheme();renderHome();goTabIndex(1);setWalletPane('ar');
  },theme);
  const financial=()=>page.evaluate(()=>JSON.stringify({txns:S.txns,cash:acctCash('cash'),people:S.people.map(({excluded,...p})=>p)}));
  const before=await financial(),initialWorth=await page.evaluate(()=>balanceSheetBreakdown().netWorth);
  const assertTotals=async(recv,pay)=>{
   assert.deepEqual(await page.evaluate(()=>[rpAssetTotal(),rpDebtTotal()]),[recv,pay]);
   assert.equal(await page.locator('#ar-total').textContent(),await page.evaluate(n=>fmt(n),recv));
   assert.equal(await page.locator('#ar-pay-total').textContent(),'−'+await page.evaluate(n=>fmt(n),pay));
   const homeText=await page.locator('#home-rp-value').textContent();assert.ok(homeText.includes(await page.evaluate(n=>fmt(n),recv)));assert.ok(homeText.includes(await page.evaluate(n=>fmt(n),pay)));
   assert.deepEqual(await page.evaluate(()=>{const b=balanceSheetBreakdown();return [b.receivable,b.payable];}),[recv,pay]);
  };
  const expand=async(key)=>{const group=page.locator('#rp-group-'+key);if(!await group.evaluate(e=>e.classList.contains('open')))await group.locator('.rp-group-head').click();};
  const row=desc=>page.locator('.rp-detail-row').filter({hasText:desc});
  const screenshot=async(name)=>{
   await page.waitForFunction(()=>!document.getElementById('app-toast')||getComputedStyle(document.getElementById('app-toast')).opacity==='0');
   await page.locator('#pane-ar .seg-ctrl').evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{})));});
   await page.evaluate(()=>{document.querySelector('#s-wallet .scroll-body').scrollTop=0;});
   await page.screenshot({path:fileURLToPath(new URL(name+'-'+width+'.png',reports))});
  };
  await assertTotals(80,110);await expand('alex');
  assert.equal(await row('Old unpaid dinner').locator('.rp-payment-row').count(),1);
  await row('Old unpaid dinner').getByRole('button',{name:'暫不計入',exact:true}).click();
  await assertTotals(120,30);assert.equal(await financial(),before,'hiding never changes cash or settlement history');
  assert.equal(await page.evaluate(()=>balanceSheetBreakdown().netWorth),initialWorth+120);
  assert.equal(await row('Old unpaid dinner').count(),0);
  await row('Taxi receivable').getByRole('button',{name:'暫不計入',exact:true}).click();
  await assertTotals(80,30);await expand('synthetic_20client');
  await row('Invoice receivable').getByRole('button',{name:'暫不計入',exact:true}).click();
  await assertTotals(20,30);await expand('split_20friend');
  await row('Dinner split').getByRole('button',{name:'暫不計入',exact:true}).click();
  await assertTotals(0,30);assert.equal(await financial(),before);
  assert.equal(await page.evaluate(()=>notifyEvents().filter(e=>e.key.startsWith('rp_')).length),0,'hidden receivables do not generate overdue reminders');
  assert.equal(await page.locator('#rp-hidden-filter').textContent(),'已隱藏 (4)');
  await page.getByRole('button',{name:'已隱藏 (4)',exact:true}).click();
  assert.equal(await page.locator('#rp-hidden-hint').isVisible(),true);await expand('alex');
  assert.equal(await row('Old unpaid dinner').locator('.rp-payment-row').count(),1);
  assert.equal(await row('Old unpaid dinner').locator('[onclick^="openSettleGroup("]').count(),0);
  assert.equal(await row('Old unpaid dinner').getByRole('button',{name:'恢復計入',exact:true}).count(),1);
  assert.equal(await page.locator('#pane-ar [data-ar-filter="hidden"]').evaluate(e=>e.classList.contains('active')),true);
  await screenshot('hidden');
  const exported=await page.evaluate(()=>transferProfileData(profileSnapshot(),localStorage));
  assert.equal(exported.people.filter(p=>p.excluded===true).length,4,'backup transfer keeps hidden flags and records');
  await page.reload();await page.waitForFunction(()=>!_refreshing);await page.evaluate(()=>{goTabIndex(1);setWalletPane('ar');});
  await assertTotals(0,30);assert.equal(await financial(),before,'all financial data survive reopening');
  await page.getByRole('button',{name:'已隱藏 (4)',exact:true}).click();await expand('alex');
  await row('Old unpaid dinner').getByRole('button',{name:'恢復計入',exact:true}).click();
  await assertTotals(0,150);assert.equal(await row('Old unpaid dinner').count(),0,'restored row leaves hidden list');
  await row('Taxi receivable').getByRole('button',{name:'恢復計入',exact:true}).click();
  await expand('synthetic_20client');await row('Invoice receivable').getByRole('button',{name:'恢復計入',exact:true}).click();
  await expand('split_20friend');await row('Dinner split').getByRole('button',{name:'恢復計入',exact:true}).click();
  await assertTotals(80,110);assert.equal(await financial(),before);assert.equal(await page.evaluate(()=>balanceSheetBreakdown().netWorth),initialWorth);
  await page.getByRole('button',{name:'全部',exact:true}).click();await expand('alex');
  await screenshot('restored');
  // Storage failure leaves an unpaid visible row in place.
  await page.evaluate(()=>{const original=saveS;saveS=()=>false;toggleARExcluded('old-pay');saveS=original;});await assertTotals(80,110);
  assert.equal(await page.evaluate(()=>S.people.find(p=>p.id==='old-pay').excluded),false);
  await page.evaluate(()=>{S.lang='en';filterAR('all');});assert.equal(await page.locator('#rp-hidden-filter').textContent(),'Hidden');
  assert.equal(await row('Old unpaid dinner').getByRole('button',{name:'Hide from totals',exact:true}).count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  results.push({width,height,theme,netting:true,hidePayableAndReceivable:true,splitBill:true,partialPaymentsPreserved:true,netWorthUpdated:true,cashUnchanged:true,reload:true,backup:true,restore:true,saveFailureRollback:true});
  await context.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
