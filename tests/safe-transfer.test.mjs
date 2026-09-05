import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function fn(n){const hit=new RegExp('^function '+n+'\\(','m').exec(html);assert.ok(hit,'Missing '+n);let e=html.indexOf('\n',hit.index);while(e>=0){const c=html.slice(hit.index,e);try{new vm.Script(c);return c;}catch{}e=html.indexOf('\n',e+1);}throw Error(n);}
const names=['defaultQuoteApis','ensureQuoteApis','createAppState','profileSnapshot','recurringRunKey','migrateRecurringRuns','validateProfileData','transferProfileData','buildSafeTransfer','planBackupImport','commitBackupImport','profilesMeta','ensureProfiles','profileKey','activeProfileId'];
const data=new Map();let failKey='',writes=0;
const storage={getItem:k=>data.get(k)||null,setItem(k,v){writes++;if(k===failKey)throw Error('Disk full');data.set(k,String(v));},removeItem:k=>data.delete(k),key:i=>[...data.keys()][i],get length(){return data.size;}};
const code=['DEF_CATS','DEF_ACCTS'].map(n=>html.match(new RegExp('const '+n+'=\\[[\\s\\S]*?\\n\\];'))[0]).concat(names.map(fn)).join('\n');
const c=vm.createContext({assert,localStorage:storage,Date,console,window:{},crypto:{randomUUID:()=>String(Math.random()).slice(2)},showStorageError(){}});
vm.runInContext(code+`
let S=createAppState();function today(){return '2026-09-05';}
S.txns=[{id:'phone-tx',type:'expense',date:'2026-09-01',autoPayId:'bill',amount:100}];S.autopay=[{id:'bill',active:true}];
S.priceHist=Array.from({length:240},(_,i)=>({t:i,p:{stock:i}}));
S.ai.key='SECRET_AI';S.tdKey='SECRET_QUOTE';S.quoteApis.stock.keys=['SECRET_POOL'];S.cloud={on:true,url:'SECRET_URL',key:'SECRET_CLOUD',pass:'SECRET_PASS',salt:'SECRET_SALT'};
localStorage.setItem('fos_profiles',JSON.stringify({active:'default',list:[{id:'default',name:'Phone <img src=x>',emoji:'📱'}]}));
localStorage.setItem('fos8',JSON.stringify(S));localStorage.setItem('ai_unused_2026_8','1');localStorage.setItem('ap_bill_2026_7','1');
const transfer=buildSafeTransfer();
assert.ok(!JSON.stringify(transfer).includes('SECRET_'),'export must omit credential settings');
assert.equal(transfer.profiles[0].data.priceHist.length,240,'preserve all supplied history');
assert.ok(transfer.profiles[0].data.recurringRuns['ap:bill:2026-08'],'carry cancelled legacy occurrence');
assert.ok(transfer.profiles[0].data.recurringRuns['ap:bill:2026-09']);
// Simulate an existing computer with different records.
S=createAppState();S.txns=[{id:'computer-tx',date:'2026-09-02'}];
localStorage.setItem('fos8',JSON.stringify(S));const original=localStorage.getItem('fos8');
const metaBefore=localStorage.getItem('fos_profiles');
const plan=planBackupImport(transfer);assert.equal(plan.profiles.length,1);
assert.equal(localStorage.getItem('fos_profiles'),metaBefore,'preview is read-only');
const result=commitBackupImport(plan);
assert.equal(localStorage.getItem('fos8'),original,'computer data must be byte-for-byte untouched');
assert.equal(activeProfileId(),'default','do not silently activate the imported source');
const imported=JSON.parse(localStorage.getItem(profileKey(result[0])));
assert.equal(imported.txns[0].id,'phone-tx');assert.equal(imported.cloud.on,false);assert.equal(imported.automationPaused,true);
assert.equal(imported.priceHist.length,240);assert.ok(!JSON.stringify(imported).includes('SECRET_'));
assert.throws(()=>commitBackupImport(planBackupImport(transfer)),/already imported/,'same unchanged source should not create duplicates');
// Legacy backups: ignore unrelated storage keys and never restore executable/config state.
const legacy={__myfin_backup:1,data:{fos8:JSON.stringify({...createAppState(),txns:[{id:'legacy'}],cloud:{key:'SECRET'},autopay:[{id:'old'}]}),ap_old_2026_8:'1',malicious:'arbitrary overwrite'}};
const lp=planBackupImport(legacy);assert.ok(lp.profiles[0].data.recurringRuns['ap:old:2026-09']);assert.ok(!JSON.stringify(lp).includes('SECRET'));
assert.throws(()=>planBackupImport({__myfin_transfer:1,profiles:[{sourceId:'x',data:{txns:[],accounts:'broken'}}]}));
assert.throws(()=>planBackupImport(JSON.parse('{"__myfin_transfer":1,"profiles":[{"sourceId":"x","data":{"txns":[],"accounts":[{"id":"bank"}],"__proto__":{"polluted":true}}}]}')));
globalThis.failurePlan=lp;globalThis.beforeFailure=Array.from({length:localStorage.length},(_,i)=>[localStorage.key(i),localStorage.getItem(localStorage.key(i))]);
`,c);
failKey='fos_profiles';
vm.runInContext(`assert.throws(()=>commitBackupImport(failurePlan),/Disk full/);assert.deepEqual(Array.from({length:localStorage.length},(_,i)=>[localStorage.key(i),localStorage.getItem(localStorage.key(i))]),beforeFailure,'failed commit rolls back only newly staged keys');`,c);
assert.ok(writes>0);console.log('Credential-free transfer, legacy compatibility, duplicate, validation and rollback tests passed.');
