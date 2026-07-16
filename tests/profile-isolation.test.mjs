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

function constantArray(name){
  const match=html.match(new RegExp(`const ${name}=\\[[\\s\\S]*?\\n\\];`));
  assert.ok(match,`missing constant ${name}`);
  return match[0];
}

const appCode=[
  constantArray('DEF_CATS'),
  constantArray('DEF_ACCTS'),
  declaration('createAppState'),
  declaration('profilesMeta'),
  declaration('ensureProfiles'),
  declaration('saveProfilesMeta'),
  declaration('activeProfileId'),
  declaration('profileKey'),
  declaration('resetProfileRuntime'),
  declaration('reloadActiveProfile'),
  declaration('switchProfile'),
  declaration('loadS'),
  declaration('profileSnapshot'),
  declaration('saveS'),
].join('\n');

const testCode=`
${appCode}

const DEFAULT_FX={RMB:0.937,USD:7.78,JPY:0.0537};
const FX={...DEFAULT_FX};
let _cloudKey='profile-a-key',_cloudKeyFor='profile-a-tag';
let lastStorageError='';

function showStorageError(action){lastStorageError=action;window._storageReadOnly=action==='load';}
function clearStorageError(){}
function notifyCfg(){return S.notify;}
function syncSectionAccountLinks(){return false;}
function ensureDebtOpenMoves(){return false;}
function notifySchedule(){}
function applyTheme(){}
function applyPrivacy(){}
function applyI18n(){}
function renderHome(){}
function updateFab(){}
function refreshWallet(){}
function renderGamble(){}
function renderSettings(){}
function renderProfileChip(){}
function closeM(){}

localStorage.setItem('fos_profiles',JSON.stringify({active:'a',list:[{id:'a',name:'A'},{id:'b',name:'B'}]}));
localStorage.setItem('fos8_p_a',JSON.stringify({
  ai:{provider:'gemini',key:'AI-A',model:'a'},tdKey:'TD-A',theme:'dark',privacy:true,
  priceHist:[{date:'2026-07-01',value:1}],fx:{USD:9,RMB:8,JPY:7},
  cloud:{url:'https://a.test',key:'CLOUD-A',pass:'PASS-A',salt:'SALT-A',on:true,ver:7,last:10}
}));
localStorage.setItem('fos8_p_b',JSON.stringify({txns:[{id:'b1'}],lang:'en'}));

loadS();
assert.equal(S.ai.key,'AI-A');
assert.equal(S.cloud.pass,'PASS-A');
assert.equal(FX.USD,9);

switchProfile('b');
assert.equal(activeProfileId(),'b');
assert.equal(S.ai.key,'');
assert.equal(S.tdKey,'');
assert.equal(S.cloud.pass,'');
assert.equal(S.cloud.key,'');
assert.equal(S.theme,'auto');
assert.equal(S.privacy,false);
assert.deepEqual(S.priceHist,[]);
assert.equal(S.fx,null);
assert.deepEqual(FX,DEFAULT_FX);
assert.equal(_cloudKey,null);
assert.equal(_cloudKeyFor,'');
assert.equal(S.txns[0].id,'b1');

localStorage.failWrites=true;
assert.equal(saveS(),false);
assert.equal(lastStorageError,'save');
window._storageReadOnly=true;
assert.equal(saveS(),false);
assert.equal(lastStorageError,'load');
`;

const data=new Map();
const localStorage={
  failWrites:false,
  getItem(key){return data.has(key)?data.get(key):null;},
  setItem(key,value){if(this.failWrites)throw new Error('quota exceeded');data.set(key,String(value));},
  removeItem(key){data.delete(key);},
};

vm.runInNewContext(testCode,{
  assert,localStorage,
  window:{_cloudT:null,_cloudMute:false,_storageReadOnly:false},
  console,setTimeout,clearTimeout,
},{filename:'profile-isolation.vm.js'});

console.log('Profile isolation and storage failure tests passed.');
