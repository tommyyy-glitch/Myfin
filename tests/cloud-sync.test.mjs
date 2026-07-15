import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const html=fs.readFileSync(path.join(here,'..','index.html'),'utf8');

function declaration(name){
  const asyncStart=html.indexOf(`async function ${name}(`);
  const start=asyncStart>=0?asyncStart:html.indexOf(`function ${name}(`);
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
  declaration('profileSnapshot'),
  declaration('saveS'),
  declaration('cloudCfg'),
  declaration('cloudReady'),
  declaration('persistCloudMeta'),
  declaration('markCloudConflict'),
  declaration('cloudPush'),
].join('\n');

const testCode=`
${appCode}

let statuses=[],requests=[],responses=[],encryptedPayload=null,lastStorageError='';
function profileKey(){return 'fos8';}
function showStorageError(action){lastStorageError=action;}
function clearStorageError(){}
function notifySchedule(){}
function setCloudStatus(state){statuses.push(state);}
async function cloudEncrypt(raw){encryptedPayload=JSON.parse(raw);return {iv:'iv',data:'cipher'};}
async function cloudApi(path,opt){requests.push({path,opt:opt||{}});const next=responses.shift();if(!next)throw new Error('missing mocked response');return next;}
function response(ok,status,data){return {ok,status,async json(){return data;}};}
function seed(ver){
  S=createAppState();
  S.ai={provider:'gemini',key:'AI-DEVICE',model:''};S.tdKey='TD-DEVICE';
  S.cloud={url:'https://sync.test',key:'ANON',pass:'PASS',salt:'SALT',on:true,ver,pending:true,pendingAt:123,lastError:'',_dirty:true};
  statuses=[];requests=[];responses=[];encryptedPayload=null;lastStorageError='';window._storageReadOnly=false;window._cloudMute=false;
  saveS({skipCloud:true});
}
function persisted(){return JSON.parse(localStorage.getItem('fos8'));}

(async function(){
  seed(3);
  responses=[response(true,200,[{ver:3}]),response(true,200,[{ver:4}])];
  assert.equal(await cloudPush(),true);
  assert.equal(requests[1].opt.method,'PATCH');
  assert.ok(requests[1].path.includes('ver=eq.3'));
  assert.equal(JSON.parse(requests[1].opt.body).ver,4);
  assert.equal(encryptedPayload.cloud.ver,4);
  assert.equal(encryptedPayload.cloud.pending,false);
  assert.equal(encryptedPayload.ai.key,'');
  assert.equal(encryptedPayload.tdKey,'');
  assert.equal(S.cloud.ver,4);
  assert.equal(S.cloud.pending,false);
  assert.equal(persisted().cloud.pending,false);

  seed(3);
  responses=[response(true,200,[{ver:3}]),response(false,503,null)];
  assert.equal(await cloudPush(),false);
  assert.equal(S.cloud.ver,3);
  assert.equal(S.cloud.pending,true);
  assert.match(S.cloud.lastError,/HTTP 503/);
  assert.equal(persisted().cloud.pending,true);

  seed(3);
  responses=[response(true,200,[{ver:3}]),response(true,200,[])];
  assert.equal(await cloudPush(),false);
  assert.equal(S.cloud.ver,3);
  assert.equal(S.cloud.pending,true);
  assert.equal(S.cloud.lastError,'compare-and-swap');
  assert.equal(statuses.at(-1),'conflict');

  seed(5);
  responses=[response(true,200,[{ver:3}]),response(true,200,[{ver:6}])];
  assert.equal(await cloudPush(),true);
  assert.ok(requests[1].path.includes('ver=eq.3'));
  assert.equal(JSON.parse(requests[1].opt.body).ver,6);
  assert.equal(S.cloud.ver,6);

  seed(3);
  responses=[response(true,200,[{ver:4}])];
  assert.equal(await cloudPush(),false);
  assert.equal(requests.length,1);
  assert.equal(S.cloud.lastError,'remote-newer');
  assert.equal(statuses.at(-1),'conflict');

  seed(3);
  responses=[response(true,200,[{ver:4}]),response(true,200,[{ver:5}])];
  assert.equal(await cloudPush(true),true);
  assert.equal(S.cloud.ver,5);

  seed(0);
  responses=[response(true,200,[]),response(true,201,[{ver:1}])];
  assert.equal(await cloudPush(),true);
  assert.equal(requests[1].opt.method,'POST');
  assert.equal(S.cloud.ver,1);

  seed(1);S.cloud.pending=false;S.cloud._dirty=false;S.cloud.pendingAt=0;
  assert.equal(saveS(),true);
  assert.equal(S.cloud.pending,true);
  assert.equal(persisted().cloud.pending,true);
})();
`;

const data=new Map();
const localStorage={
  getItem(key){return data.has(key)?data.get(key):null;},
  setItem(key,value){data.set(key,String(value));},
};

await vm.runInNewContext(testCode,{
  assert,localStorage,
  window:{_cloudT:null,_cloudMute:false,_storageReadOnly:false},
  console,Date,JSON,encodeURIComponent,
  setTimeout(){return 1;},clearTimeout(){},
},{filename:'cloud-sync.vm.js'});

console.log('Durable cloud sync and CAS tests passed.');
