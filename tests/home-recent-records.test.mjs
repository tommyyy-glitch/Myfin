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

assert.match(declaration('renderHome'),/dayGroupedTxnHTML\(homeRecentTxnRows\(\)/);
assert.doesNotMatch(declaration('renderHome'),/walletTxnRows\(\)\.slice\(/);

const within=Array.from({length:13},(_,i)=>({id:100+i,date:'2026-08-30',note:`today-${i}`}));
const code=`
const S={txns:[
  ...${JSON.stringify(within)},
  {id:90,date:'2026-08-29',note:'yesterday'},
  {id:80,date:'2026-08-24',note:'inclusive-start'},
  {id:70,date:'2026-08-23',note:'too-old'},
  {id:60,date:'2026-08-31',note:'future'},
  {id:50,date:'2026-09-01',note:'later-future'},
  {id:40,date:'2026-02-31',note:'invalid-date'}
]};
function realisedPnlTxnRows(){return [
  {id:'pnl_1',date:'2026-08-28',note:'realised-within'},
  {id:'pnl_2',date:'2026-09-02',note:'realised-future'}
];}
${declaration('txSortStamp')}
${declaration('walletTxnRows')}
${declaration('homeRecentTxnRows')}
${declaration('dateOnly')}
${declaration('parseDateOnly')}
${declaration('ymd')}
globalThis.rows=homeRecentTxnRows(new Date(2026,7,30,12,0,0));
`;
const context={};
vm.createContext(context);
vm.runInContext(code,context);

assert.equal(context.rows.length,16,'all records within the seven-date window should be retained');
assert.deepEqual(
  Array.from(new Set(context.rows.map(row=>row.date))),
  ['2026-08-30','2026-08-29','2026-08-28','2026-08-24']
);
assert.ok(context.rows.every(row=>row.date>='2026-08-24'&&row.date<='2026-08-30'));
