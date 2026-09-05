import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../cloud-ui.js',import.meta.url),'utf8');
function declaration(name){
  const start=new RegExp('^(?:async )?function '+name+'\\(','m').exec(html).index;
  for(let end=html.indexOf('\n',start);end>=0;end=html.indexOf('\n',end+1)){
    const code=html.slice(start,end);try{new vm.Script(code);return code;}catch{}
  }
  throw Error(name);
}
function fixture(options={}){
  const elements=new Map(),storage=new Map(),writes=[],requests=[],events=[];
  const config={url:'https://synthetic.supabase.co',key:'public-test',pass:'synthetic encryption phrase',vaultId:'main',on:false,linked:false};
  const state={accounts:Array.from({length:25},(_,i)=>({id:'account-'+i})),txns:Array.from({length:3879},(_,i)=>({id:'record-'+i,amount:i%31})),cloud:{...config}};
  const element=id=>{if(!elements.has(id))elements.set(id,{value:'',hidden:false,disabled:false,textContent:''});return elements.get(id);};
  for(const [id,k] of [['cloud-url','url'],['cloud-key','key'],['cloud-pass','pass'],['cloud-vault','vaultId']])element(id).value=config[k];
  storage.set('profile-a',JSON.stringify(state));storage.set('myfin.recovery.v1.profile-a','existing recovery must survive');
  const original=storage.get('profile-a');
  const c=vm.createContext({S:state,window:{},document:{getElementById:element},JSON,Date,DOMException,clearTimeout(){},setTimeout(){},
    localStorage:{getItem:k=>storage.get(k)||null,setItem(k,v){
      writes.push(k);
      if(k.startsWith('myfin.recovery.'))throw new DOMException('private details must not be shown','QuotaExceededError');
      if(options.failSave==='all'||(options.failSave==='link'&&requests.length))throw new DOMException('private details must not be shown','QuotaExceededError');
      storage.set(k,String(v));
    }},
    profileKey:()=> 'profile-a',profileSnapshot:()=>JSON.parse(JSON.stringify(c.S)),cloudCfg:()=>c.S.cloud,
    cloudContent:()=>JSON.stringify({accounts:c.S.accounts,txns:c.S.txns}),showStorageError(){},clearStorageError(){},
    cloudFetchVault:async()=>{events.push('check');if(options.checkError)throw options.checkError;return options.current??null;},
    cloudEncrypt:async(raw,cfg)=>{events.push('encrypt');if(options.encryptError)throw options.encryptError;if(options.duringEncrypt)options.duringEncrypt(c);cfg.salt='synthetic-salt';return{iv:'synthetic-iv',data:'synthetic-ciphertext'};},
    cloudApi:async(path,init)=>{
      requests.push({path,...init});events.push('post');
      if(options.duringPost)options.duringPost(c);
      if(options.postError)throw options.postError;
      return{ok:!options.status,status:options.status||201,json:async()=>{if(options.jsonError)throw options.jsonError;return options.result??[{ver:1}];}};
    }
  });
  // Execute real confirm, preview guards, error rendering and local persistence.
  const fetch=c.cloudFetchVault;
  vm.runInContext(ui+'\n'+['saveS','persistCloudMeta','checkpointProfile'].map(declaration).join('\n'),c);
  c.cloudFetchVault=fetch;c.renderCloudAuth=()=>{};
  c.window._cloudAuthClient={status:()=>({userId:'synthetic-owner',projectUrl:config.url,epoch:1})};
  c.cloudAuthClient=()=>c.window._cloudAuthClient;
  c.cloudFormConfig=()=>({...config});
  c.window._cloudPreview={...c.cloudFirstContext(),direction:'upload',row:null};
  return{c,storage,writes,requests,events,original,element,message:()=>element('cloud-auth-message').textContent};
}
function assertSafe(f){
  assert.equal(f.storage.get('myfin.recovery.v1.profile-a'),'existing recovery must survive');
  assert.deepEqual(JSON.parse(f.storage.get('profile-a')).txns,JSON.parse(f.original).txns);
  assert.equal(f.c.window._cloudFirstBusy,false);assert.equal(f.element('cloud-first-confirm').disabled,false);
  assert.equal(f.c.window._cloudAuthApproved,false);
  assert.ok(!f.message().includes('private details'));
}
test('first upload needs only primary storage, not another full recovery copy',async()=>{
  const f=fixture();await f.c.cloudConfirmFirst();
  assert.equal(f.requests.length,1);assert.equal(f.writes.filter(k=>k.startsWith('myfin.recovery.')).length,0);
  assert.equal(f.writes.filter(k=>k==='profile-a').length,2,'primary save before upload and link save after acknowledgement');
  assert.equal(JSON.parse(f.storage.get('profile-a')).cloud.linked,true);
  assert.match(f.message(),/已建立並連結/);assertSafe(f);
});
test('primary save failure stops before encryption or POST',async()=>{
  const f=fixture({failSave:'all'});await f.c.cloudConfirmFirst();
  assert.deepEqual(f.events,['check']);assert.equal(f.storage.get('profile-a'),f.original);
  assert.match(f.message(),/FIRST-UPLOAD\/LOCAL-SAVE/);assert.match(f.message(),/未傳送/);assertSafe(f);
});
test('crypto failure has a safe stage code, not a login/network claim',async()=>{
  const f=fixture({encryptError:new DOMException('private details','OperationError')});await f.c.cloudConfirmFirst();
  assert.equal(f.requests.length,0);assert.match(f.message(),/FIRST-UPLOAD\/ENCRYPT\/OperationError/);
  assert.match(f.message(),/未傳送/);assert.doesNotMatch(f.message(),/登入失敗/);assertSafe(f);
});
test('native storage exceptions use names rather than numeric DOM codes',()=>{
  const f=fixture();assert.match(f.c.cloudAuthError(new DOMException('private details','QuotaExceededError')),/儲存空間/);
  assert.match(f.c.cloudAuthError(new DOMException('private details','SecurityError')),/儲存/);
});
test('failed remote read cannot be mistaken for a completed upload',async()=>{
  const f=fixture({checkError:new TypeError('private details')});await f.c.cloudConfirmFirst();
  assert.equal(f.requests.length,0);assert.match(f.message(),/FIRST-UPLOAD\/REMOTE-CHECK\/TypeError/);assert.match(f.message(),/未傳送/);assertSafe(f);
});
for(const options of [{postError:new TypeError('private details')},{jsonError:new SyntaxError('private details')},{result:[]},{status:503}]){
  test('unacknowledged POST is explicitly uncertain and requires a new preview',async()=>{
    const f=fixture(options);await f.c.cloudConfirmFirst();
    assert.equal(f.requests.length,1);assert.match(f.message(),/FIRST-UPLOAD\/UPLOAD/);
    assert.match(f.message(),/未能確認/);assert.doesNotMatch(f.message(),/未傳送/);
    assert.equal(f.c.window._cloudPreview,null);assert.equal(f.c.S.cloud.linked,false);
    await f.c.cloudConfirmFirst();assert.equal(f.requests.length,1,'no blind duplicate POST');assertSafe(f);
  });
}
test('known conflict does not overwrite the existing cloud ledger',async()=>{
  const f=fixture({status:409});await f.c.cloudConfirmFirst();
  assert.equal(f.requests[0].method,'POST');assert.equal(f.requests[0].headers.Prefer,'return=representation');
  assert.match(f.message(),/已有資料/);assert.doesNotMatch(f.message(),/未能確認/);assertSafe(f);
});
test('acknowledged upload with failed link save reports cloud created, restores local config',async()=>{
  const f=fixture({failSave:'link'});await f.c.cloudConfirmFirst();
  assert.equal(f.requests.length,1);assert.equal(f.storage.get('profile-a'),f.original);
  assert.equal(f.c.S.cloud.linked,false);assert.equal(f.c.S.cloud.salt,undefined);
  assert.match(f.message(),/雲端副本已建立/);assert.match(f.message(),/本機.*連結/);
  assert.match(f.message(),/FIRST-UPLOAD\/LINK-SAVE/);assert.equal(f.c.window._cloudPreview,null);assertSafe(f);
});
test('local edits during encryption invalidate confirmation before POST',async()=>{
  const f=fixture({duringEncrypt:c=>c.S.txns.push({id:'new-local-edit'})});await f.c.cloudConfirmFirst();
  assert.equal(f.requests.length,0);assert.match(f.message(),/重新預覽/);assert.equal(f.c.S.txns.at(-1).id,'new-local-edit');assertSafe(f);
});
test('busy confirmation cannot send a second concurrent POST',async()=>{
  let release,entered;const ready=new Promise(r=>entered=r);
  const f=fixture();f.c.cloudApi=async()=>{f.requests.push({method:'POST'});entered();await new Promise(r=>release=r);return{ok:true,json:async()=>[{ver:1}]};};
  const pending=f.c.cloudConfirmFirst();await ready;await f.c.cloudConfirmFirst();
  assert.equal(f.requests.length,1);release();await pending;assertSafe(f);
});
test('profile switch during POST never links the destination profile',async()=>{
  const f=fixture({duringPost:c=>{c.S={accounts:[],txns:[{id:'other-profile'}],cloud:{}};}});await f.c.cloudConfirmFirst();
  assert.equal(f.requests.length,1);assert.equal(f.c.S.cloud.linked,undefined);
  assert.match(f.message(),/雲端副本已建立/);assert.equal(f.c.window._cloudPreview,null);assertSafe(f);
});
