import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('function recordPriceSnapshot('),end=html.indexOf('\nasync function refreshPrices(',start);
const c=vm.createContext({assert,Date});
vm.runInContext(html.slice(start,end)+`
let S={portfolio:[{type:'stock',valueHKD:100}],priceHist:[]},pnl=0;function portfolioUnrealizedSnapshot(){return {stock:pnl};}
for(let i=0;i<240;i++){pnl=i;recordPriceSnapshot(Date.UTC(2026,0,1)+i*120000);}
assert.equal(S.priceHist.length,240);assert.equal(S.priceHist[0].p.stock,0);
const last=S.priceHist.at(-1).t;recordPriceSnapshot(last+1000);assert.equal(S.priceHist.length,240,'identical rapid refreshes can still collapse');
`,c);
console.log('Long-term P&L history survives frequent refreshes.');
