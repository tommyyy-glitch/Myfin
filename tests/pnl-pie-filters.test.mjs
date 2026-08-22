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

const fields={'pnl-pie-filters':{innerHTML:''}};
const code=[
  declaration('pnlPieFilterMeta'),
  declaration('togglePnlPieFilter'),
  declaration('renderPnlPieFilters'),
  `
  const S={pnlPieFilters:[]};
  const document={getElementById(id){return fields[id]||null;}};
  function t(k){return k;}
  function tt(zh,en){return en;}
  function assetLabel(){return 'Physical fixed assets';}
  function escapeHtml(v){return String(v);}
  function secIcon(){return 'All';}
  function saveS(){}
  function renderGamble(){}
  togglePnlPieFilter('cash');
  const cash=[...S.pnlPieFilters];
  togglePnlPieFilter('stock');
  const cashStock=[...S.pnlPieFilters];
  togglePnlPieFilter('cash');
  const stockOnly=[...S.pnlPieFilters];
  renderPnlPieFilters();
  const rendered=fields['pnl-pie-filters'].innerHTML;
  togglePnlPieFilter('all');
  globalThis.result={cash,cashStock,stockOnly,rendered,all:[...S.pnlPieFilters]};
  `
].join('\n');

const context={fields};vm.createContext(context);vm.runInContext(code,context);
assert.deepEqual([...context.result.cash],['cash']);
assert.deepEqual([...context.result.cashStock],['cash','stock']);
assert.deepEqual([...context.result.stockOnly],['stock']);
assert.deepEqual([...context.result.all],[]);
assert.match(context.result.rendered,/fchip active/);
assert.match(context.result.rendered,/aria-label="crypto"/);
assert.match(context.result.rendered,/aria-label="Physical fixed assets"/);
assert.doesNotMatch(context.result.rendered,/>₿ crypto</);
assert.doesNotMatch(context.result.rendered,/>🧰 Physical fixed assets</);
assert.match(html,/pieRaw=pieRaw\.filter\(d=>pieFilters\.includes\(d\._kind\)\)/);
assert.match(html,/_kind:'physical'/);
assert.match(html,/_kind:'cash'/);

console.log('P&L multi-select asset-class filter tests passed.');
