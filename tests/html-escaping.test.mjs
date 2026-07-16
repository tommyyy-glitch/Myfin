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
  declaration('escapeHtml'),
  declaration('inlineJsString'),
  declaration('txnRow'),
  `
    const CUR_SYM={HKD:'HK$'};
    const CB={};
    function t(k){return k;}
    function getCat(){return {icon:'<svg onload=attack()>',label:'bad'};}
    function fmt(v){return String(v);}
    function txIsRealisedPnl(){return false;}

    const payload='<img src=x onerror=attack()>"\\\'&';
    globalThis.result={
      escaped:escapeHtml(payload),
      arg:inlineJsString(payload),
      row:txnRow({
        id:'x" onclick="attack()',type:'expense',cur:'HKD',amount:12,
        note:payload,date:'2026-07-15',acctLabel:'<iframe src=x>',
        catId:'malicious',excluded:false,oneOff:false,autoPayId:'',isGroupBill:false
      })
    };
  `
].join('\n');

const context={};
vm.createContext(context);
vm.runInContext(code,context);

assert.equal(context.result.escaped,'&lt;img src=x onerror=attack()&gt;&quot;&#39;&amp;');
assert.ok(context.result.arg.startsWith('&quot;'));
assert.ok(context.result.arg.endsWith('&quot;'));
assert.ok(!context.result.row.includes('<img'));
assert.ok(!context.result.row.includes('<svg'));
assert.ok(!context.result.row.includes('<iframe'));
assert.match(context.result.row,/&lt;img src=x onerror=attack\(\)&gt;/);
assert.match(context.result.row,/onclick="editTxn\(&quot;x\\&quot; onclick=\\&quot;attack\(\)&quot;\)"/);

console.log('HTML and inline-handler escaping tests passed.');
