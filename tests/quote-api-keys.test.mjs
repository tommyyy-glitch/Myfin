import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const html=fs.readFileSync(path.join(here,'..','index.html'),'utf8');

function declaration(name){
  const plain=html.indexOf(`function ${name}(`),asyncStart=html.indexOf(`async function ${name}(`);
  const start=asyncStart>=0?asyncStart:plain;
  assert.notEqual(start,-1,`missing function ${name}`);
  const matches=[html.indexOf('\nfunction ',start+10),html.indexOf('\nasync function ',start+10)].filter(n=>n>=0);
  const next=matches.length?Math.min(...matches):html.length;
  return html.slice(start,next);
}

const code=[
  declaration('defaultQuoteApis'),
  declaration('ensureQuoteApis'),
  declaration('quoteKeys'),
  declaration('hasQuoteKey'),
  declaration('quoteRequestError'),
  declaration('withQuoteKey'),
  declaration('fetchCoinGeckoPrices'),
  `
  function tt(zh,en){return zh;}
  let S={quoteApis:defaultQuoteApis(),tdKey:''};
  globalThis.S=S;
  `
].join('\n');

const calls=[];
const context={
  console,
  Date,
  encodeURIComponent,
  fetch:async(url,opt)=>{
    calls.push({url,opt});
    return {ok:true,status:200,json:async()=>({bitcoin:{hkd:500000}})};
  }
};
vm.createContext(context);
vm.runInContext(code,context);

context.S.quoteApis.stock.keys=['limited','working'];
const picked=await context.withQuoteKey('stock',async key=>{
  if(key==='limited')throw context.quoteRequestError('rate limit',429,true);
  return key;
});
assert.equal(picked,'working');
assert.ok(context.S.quoteApis.stock.cooldowns[0]>Date.now());

const secondCalls=[];
const pickedAgain=await context.withQuoteKey('stock',async key=>{secondCalls.push(key);return key;});
assert.equal(pickedAgain,'working');
assert.deepEqual(secondCalls,['working']);

context.S.quoteApis.crypto.keys=['cg-demo'];
const crypto=await context.fetchCoinGeckoPrices(['bitcoin']);
assert.equal(crypto.bitcoin.hkd,500000);
assert.equal(calls.at(-1).opt.headers['x-cg-demo-api-key'],'cg-demo');

context.S.quoteApis.crypto.keys=[];
context.S.quoteApis.crypto.cursor=0;
context.S.quoteApis.crypto.cooldowns={};
await context.fetchCoinGeckoPrices(['bitcoin']);
assert.equal(calls.at(-1).opt,undefined);

assert.match(html,/data-settings-key="assetlabels"/);
assert.match(html,/data-settings-key="quoteapi"/);
assert.match(html,/setSettingsSectionTitle\('asset-labels-title'/);
assert.match(html,/\['stock','crypto','physical'\]/);
assert.doesNotMatch(html,/id="td-key"/);
assert.match(html,/payload\.quoteApis=quoteApiCloudSafe\(\)/);

console.log('Quote API class pools, rotation, keyless crypto fallback, and settings-title tests passed.');
