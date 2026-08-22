import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const html=fs.readFileSync(path.join(here,'..','index.html'),'utf8');

function declaration(name){
  const start=html.indexOf(`function ${name}(`);
  assert.notEqual(start,-1,`missing function ${name}`);
  const next=html.indexOf('\nfunction ',start+10);
  return html.slice(start,next<0?html.length:next);
}

const code=[
  declaration('physicalMetalValueRaw'),
  declaration('ensurePhysicalAssetHistory'),
  declaration('recordPhysicalValuation'),
  declaration('physicalLatestMarketRaw'),
  declaration('physicalMarketValueRaw'),
  declaration('physicalAssetValueRaw'),
  declaration('physicalAssetValue'),
  declaration('physicalAssetsStats'),
  declaration('metalQuoteToAssetPerGram'),
  declaration('acctPositionsCash'),
  declaration('acctLiquidAssetValue'),
  declaration('acctInvestmentAssetValue'),
  `
  function today(){return '2027-01-01';}
  function parseDateOnly(s){const p=String(s).split('-').map(Number);return new Date(p[0],p[1]-1,p[2]);}
  function dateOnly(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
  const FX={USD:7.8,RMB:1.08,JPY:0.052};
  function toHKD(v,c){return (Number(v)||0)*(c&&c!=='HKD'?(FX[c]||1):1);}
  function portCountsInNet(){return true;}
  function gambleCountsInNet(){return true;}
  const laptop={id:'fa_laptop',name:'Laptop',category:'equipment',purchaseDate:'2026-01-01',cost:12000,costHKD:12000,cur:'HKD'};
  const gold={id:'fa_gold',name:'Gold',category:'metal',purchaseDate:'2026-01-01',cost:6000,costHKD:6000,cur:'HKD',weight:10,weightUnit:'g',purityPct:99.9,spotPricePerGram:700,priceTracking:'twelvedata'};
  const watch={id:'fa_watch',name:'Watch',category:'jewelry',purchaseDate:'2026-01-01',cost:8000,costHKD:8000,cur:'HKD',marketValue:7200,valuationDate:'2026-06-01'};
  const S={portfolio:[],gamble:[],physicalAssets:[laptop,gold,watch]};
  recordPhysicalValuation(watch,7600,'2026-12-01','manual');
  globalThis.results={
    goldMarket:physicalMetalValueRaw(gold),
    laptopMarket:physicalAssetValueRaw(laptop),
    watchMarket:physicalAssetValueRaw(watch),
    watchHistory:ensurePhysicalAssetHistory(watch).map(v=>v.value),
    stats:physicalAssetsStats(),
    cashImpact:acctPositionsCash('cash'),
    goldUsdOzToHkdGram:metalQuoteToAssetPerGram(2400,'USD','oz','HKD')
  };
  S.physicalAssets.forEach(a=>a.acctId='cash');
  globalThis.cashAfterLink=acctPositionsCash('cash');
  watch.soldAt='2026-12-20';watch.saleValue=7000;watch.saleCur='HKD';watch.saleValueHKD=7000;watch.saleAcctId='cash';recordPhysicalValuation(watch,7000,watch.soldAt,'sale');
  globalThis.afterSale={value:physicalAssetValue(watch),stats:physicalAssetsStats(),cash:acctPositionsCash('cash'),history:ensurePhysicalAssetHistory(watch).map(v=>v.value)};
  S.portfolio=[{acctId:'cash',type:'stock',valueHKD:1000},{acctId:'cash',type:'pe',valueHKD:2000}];
  S.gamble=[{acctId:'cash',open:true,buyinHKD:500}];
  globalThis.classified={liquid:acctLiquidAssetValue('cash'),investment:acctInvestmentAssetValue('cash')};
  `
].join('\n');

const context={};vm.createContext(context);vm.runInContext(code,context);
assert.ok(Math.abs(context.results.goldMarket-6993)<0.01);
assert.equal(context.results.laptopMarket,12000);
assert.equal(context.results.watchMarket,7600);
assert.deepEqual([...context.results.watchHistory],[8000,7200,7600]);
assert.equal(context.results.stats.count,3);
assert.equal(context.results.cashImpact,0);
assert.equal(context.cashAfterLink,-26000);
assert.equal(context.afterSale.value,0);
assert.equal(context.afterSale.stats.count,2);
assert.equal(context.afterSale.stats.soldCount,1);
assert.equal(context.afterSale.stats.realizedCash,7000);
assert.equal(context.afterSale.stats.realizedPnl,-1000);
assert.equal(context.afterSale.cash,-19000);
assert.deepEqual([...context.afterSale.history],[8000,7200,7600,7000]);
assert.deepEqual({...context.classified},{liquid:1500,investment:2000});
assert.ok(Math.abs(context.results.goldUsdOzToHkdGram-601.86)<0.1);

assert.match(html,/id="h-invest"/);
assert.match(html,/const investmentAsset=/);
assert.match(html,/quickAsset\+investmentAsset\+fixedAsset\+receivable/);
assert.ok(html.indexOf('id="h-fixed"')<html.indexOf('id="h-recv"'));
assert.ok(html.indexOf('id="h-recv"')<html.indexOf('id="h-invest"'));
assert.ok(html.indexOf('id="h-invest"')<html.indexOf('id="h-quick"'));
assert.doesNotMatch(html,/id="h-liquid"/);
assert.match(html,/physicalFixedAssets:/);
assert.match(html,/Current market value \(HKD\)/);
assert.match(html,/Confirm sale/);
assert.match(html,/XAU\/USD/);
assert.match(html,/AI valuation research \(never auto-fills\)/);

console.log('Physical fixed-asset valuation, cash movement, and classification tests passed.');
