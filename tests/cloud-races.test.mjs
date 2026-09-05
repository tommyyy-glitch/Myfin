import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function declaration(name){
  const start=new RegExp('^(?:async )?function '+name+'\\(','m').exec(html)?.index;
  assert.notEqual(start,undefined,name);
  let end=html.indexOf('\n',start);
  while(end>=0){const code=html.slice(start,end);try{new vm.Script(code);return code;}catch{}end=html.indexOf('\n',end+1);}
  throw new Error('Cannot extract '+name);
}
const names=['defaultQuoteApis','ensureQuoteApis','quoteApiCloudSafe','createAppState','profilesMeta','ensureProfiles','saveProfilesMeta','activeProfileId','profileKey','resetProfileRuntime','reloadActiveProfile','switchProfile','loadS','profileSnapshot','saveS','cloudCfg','cloudReady','persistCloudMeta','markCloudConflict','cloudPush','cloudPull'];
// Optional during the red/green baseline; the scenarios assert real behavior, not helper presence.
for(const n of ['cloudContent','cloudOperation','cloudOperationCurrent','cloudSchedule','cloudFinish','validateProfileData','checkpointProfile','recurringRunKey','migrateRecurringRuns','cloudSignedIn','cloudPath'])if(html.includes('function '+n+'('))names.push(n);
const code=['DEF_CATS','DEF_ACCTS'].map(n=>html.match(new RegExp('const '+n+'=\\[[\\s\\S]*?\\n\\];'))[0]).concat(names.map(declaration)).join('\n');
const data=new Map();
const context=vm.createContext({assert,console,Date,JSON,encodeURIComponent,localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)},window:{},setTimeout:()=>1,clearTimeout(){},location:{reload(){}},confirm:()=>true});
vm.runInContext(code+`
const DEFAULT_FX={USD:7.8},FX={...DEFAULT_FX},ACCT_SECONDARY_KINDS=['none'];
let S=createAppState(),_cloudKey=null,_cloudKeyFor='',resume=null,requests=[],status=[],encryptedPayload;
function showStorageError(a,e){throw e;}function clearStorageError(){}function notifyCfg(){return S.notify;}
function syncSectionAccountLinks(){return false;}function ensureDebtOpenMoves(){return false;}function ensureRPIncomeAccruals(){return false;}function notifySchedule(){}
function applyTheme(){}function applyPrivacy(){}function applyI18n(){}function renderHome(){}function updateFab(){}function refreshWallet(){}function renderGamble(){}function renderSettings(){}function renderProfileChip(){}function closeM(){}
function setCloudStatus(s){status.push(s);}function tt(z,e){return e;}function showToast(){}
function response(rows){return {ok:true,status:200,json:async()=>rows};}
async function untilPaused(){for(let i=0;i<50&&!resume;i++)await Promise.resolve();assert.ok(resume,'request must reach controlled pause');}
function seed(){
  window._cloudOperation=null;window._cloudEpoch=0;window._storageReadOnly=false;window._cloudMute=false;
  localStorage.setItem('fos_profiles',JSON.stringify({active:'a',list:[{id:'a',name:'A'},{id:'b',name:'B'}]}));
  for(const id of ['a','b']){const p=createAppState();p.txns=[{id:id+'-local'}];p.cloud={url:'https://'+id+'.test',key:id,pass:id,salt:id,on:true,ver:1,pending:false,authVersion:2,linked:true,userId:'user-a',vaultId:'fos8_p_'+id};localStorage.setItem('fos8_p_'+id,JSON.stringify(p));}
  S=createAppState();loadS();resume=null;requests=[];status=[];
  window._cloudAuthApproved=true;window._cloudAuthClient={status:()=>({userId:'user-a',projectUrl:'https://a.test',epoch:1})};
}
`,context);

const failures=[];
async function scenario(name,body){try{await vm.runInContext(`(async()=>{${body}})()`,context);console.log('PASS '+name);}catch(e){failures.push(name+': '+e.message);console.error('FAIL '+name+': '+e.message);}}
await scenario('pull cannot replace another profile',`
seed();cloudApi=async(path,opt,cfg)=>{requests.push({path,url:cfg?.url||S.cloud.url});return response(path.includes('salt,iv,data')?[{ver:2,salt:'a',iv:'x',data:'x'}]:[{ver:2}]);};
cloudDecrypt=()=>new Promise(r=>{resume=r;});const pending=cloudPull(false);await untilPaused();
switchProfile('b');resume(JSON.stringify({...createAppState(),txns:[{id:'a-remote'}]}));await pending;
assert.equal(JSON.parse(localStorage.getItem('fos8_p_b')).txns[0].id,'b-local');
`);
await scenario('push cannot change destination after profile switch',`
seed();cloudApi=async(path,opt,cfg)=>{requests.push({path,url:cfg?.url||S.cloud.url,body:opt?.body?JSON.parse(opt.body):null});return response([{ver:opt?2:1}]);};
cloudEncrypt=raw=>{encryptedPayload=JSON.parse(raw);return new Promise(r=>{resume=r;});};const pending=cloudPush();await untilPaused();
switchProfile('b');resume({iv:'x',data:'x'});await pending;
assert.ok(requests.every(r=>r.url==='https://a.test'));assert.ok(requests.filter(r=>r.body).every(r=>r.body.id==='fos8_p_a'));
assert.equal(S.cloud.ver,1);
`);
await scenario('new local edit remains pending after earlier upload acknowledgement',`
seed();cloudApi=async(path,opt)=>opt?new Promise(r=>{resume=()=>r(response([{ver:2}]));}):response([{ver:1}]);
cloudEncrypt=async raw=>{encryptedPayload=JSON.parse(raw);return {iv:'x',data:'x'};};const pending=cloudPush();await untilPaused();
S.txns.push({id:'new-during-upload'});saveS();resume();await pending;
assert.equal(encryptedPayload.txns.length,1);assert.equal(S.txns.length,2);assert.equal(S.cloud.pending,true);
assert.equal(JSON.parse(localStorage.getItem('fos8_p_a')).cloud.pending,true);assert.notEqual(status.at(-1),'ok');
`);
await scenario('local edit during download is not overwritten',`
seed();cloudApi=async path=>response(path.includes('salt,iv,data')?[{ver:2,salt:'a',iv:'x',data:'x'}]:[{ver:2}]);
cloudDecrypt=()=>new Promise(r=>{resume=r;});const pending=cloudPull(false);await untilPaused();
S.txns.push({id:'new-during-download'});saveS();resume(JSON.stringify({...createAppState(),txns:[{id:'remote'}]}));await pending;
assert.equal(JSON.parse(localStorage.getItem('fos8_p_a')).txns.at(-1).id,'new-during-download');assert.equal(S.cloud.pending,true);
`);
await scenario('overlapping sync requests are serialized',`
seed();cloudApi=async(path,opt)=>{requests.push({path,opt});return response([{ver:opt?2:1}]);};
cloudEncrypt=()=>new Promise(r=>{resume=r;});const pending=cloudPush();await untilPaused();
assert.equal(await cloudPush(),false);assert.equal(await cloudPull(true),false);assert.equal(requests.length,1);
resume({iv:'x',data:'x'});assert.equal(await pending,true);assert.equal(requests.length,2);
`);
await scenario('changed credentials invalidate an in-flight upload',`
seed();cloudApi=async(path,opt)=>{requests.push({path,opt});return response([{ver:1}]);};
cloudEncrypt=()=>new Promise(r=>{resume=r;});const pending=cloudPush();await untilPaused();
S.cloud.url='https://different.test';resume({iv:'x',data:'x'});assert.equal(await pending,false);assert.equal(requests.length,1);assert.equal(S.cloud.ver,1);
`);
await scenario('valid download checkpoints local data before replacing it',`
seed();cloudApi=async path=>response(path.includes('salt,iv,data')?[{ver:2,salt:'new-salt',iv:'x',data:'x'}]:[{ver:2}]);
cloudDecrypt=async()=>JSON.stringify({...createAppState(),txns:[{id:'remote-valid'}]});
assert.equal(await cloudPull(false),true);
assert.equal(JSON.parse(localStorage.getItem('myfin.recovery.v1.fos8_p_a')).profile.txns[0].id,'a-local');
assert.equal(JSON.parse(localStorage.getItem('fos8_p_a')).txns[0].id,'remote-valid');
assert.equal(JSON.parse(localStorage.getItem('fos8_p_a')).cloud.salt,'new-salt');
`);
await scenario('checkpoint storage failure leaves the local profile intact',`
seed();cloudApi=async path=>response(path.includes('salt,iv,data')?[{ver:2,salt:'a',iv:'x',data:'x'}]:[{ver:2}]);
cloudDecrypt=async()=>JSON.stringify({...createAppState(),txns:[{id:'remote-valid'}]});
const set=localStorage.setItem;localStorage.setItem=(k,v)=>{if(k.startsWith('myfin.recovery.'))throw Error('Disk full');set(k,v);};
try{assert.equal(await cloudPull(false),false);assert.equal(JSON.parse(localStorage.getItem('fos8_p_a')).txns[0].id,'a-local');assert.equal(window._cloudMute,false);}finally{localStorage.setItem=set;}
`);
await scenario('decryption failure never offers destructive cloud overwrite',`
seed();cloudApi=async(path,opt)=>{requests.push({path,opt});return response(path.includes('salt,iv,data')?[{ver:2,salt:'a',iv:'x',data:'x'}]:[{ver:2}]);};
cloudDecrypt=async()=>{throw Error('wrong passphrase');};assert.equal(await cloudPull(true),false);
assert.ok(requests.every(r=>!r.opt));assert.equal(JSON.parse(localStorage.getItem('fos8_p_a')).txns[0].id,'a-local');
`);
await scenario('invalid downloaded data cannot replace a valid local profile',`
seed();cloudApi=async path=>response(path.includes('salt,iv,data')?[{ver:2,salt:'a',iv:'x',data:'x'}]:[{ver:2}]);cloudDecrypt=async()=>JSON.stringify({txns:[],accounts:'broken'});
assert.equal(await cloudPull(false),false);assert.equal(JSON.parse(localStorage.getItem('fos8_p_a')).txns[0].id,'a-local');
`);
assert.deepEqual(failures,[]);
