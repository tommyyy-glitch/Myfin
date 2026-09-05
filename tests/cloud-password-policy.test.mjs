import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../cloud-ui.js',import.meta.url),'utf8');
function fixture(){
  const fields={'cloud-email':{value:'synthetic@example.test',checkValidity:()=>true},'cloud-password':{value:''}};
  const calls=[],messages=[],buttons=[{disabled:false},{disabled:false}];
  const config={url:'https://synthetic-test.supabase.co',key:'sb_publishable_test',pass:'twelve-chars',vaultId:'main'};
  const context={window:{},document:{getElementById:id=>fields[id],querySelectorAll:()=>buttons},location:{origin:'https://example.test',pathname:'/Myfin/'},confirm:()=>true};
  vm.createContext(context);vm.runInContext(source,context);
  Object.assign(context,{
    cloudMessage:message=>messages.push(message),cloudSaveSettings:()=>true,renderCloudAuth:()=>{},
    cloudCfg:()=>config,cloudFormConfig:()=>({...config}),
    cloudAuthClient:()=>({
      signUp:async()=>{calls.push('signup');return {confirmationRequired:true};},
      signIn:async()=>{calls.push('signin');},
      status:()=>({userId:'synthetic-user',projectUrl:config.url,epoch:0})
    }),
    profileKey:()=> 'synthetic-profile',S:{},cloudContent:()=> '{}'
  });
  return {context,fields,calls,messages,buttons,config};
}

for(const length of [6,11,12]){
  const f=fixture();f.fields['cloud-password'].value='x'.repeat(length);
  await f.context.cloudLoginAction(true);
  assert.deepEqual(f.calls,['signup'],`${length}-character signup must reach authentication`);
  assert.equal(f.fields['cloud-password'].value,'','submitted password cleared');
  assert.ok(f.buttons.every(button=>!button.disabled));
}
{
  const f=fixture();f.fields['cloud-password'].value='x'.repeat(5);
  await f.context.cloudLoginAction(true);
  assert.deepEqual(f.calls,[]);assert.match(f.messages.at(-1),/6 個字元/);
}
{
  const f=fixture();await f.context.cloudLoginAction(true);
  assert.deepEqual(f.calls,[]);assert.match(f.messages.at(-1),/請填寫/);
  f.fields['cloud-password'].value='old';await f.context.cloudLoginAction(false);
  assert.deepEqual(f.calls,['signin'],'new-account policy does not block an existing password');
}
{
  const f=fixture();
  for(const length of [6,11]){
    f.config.pass='x'.repeat(length);
    assert.throws(()=>f.context.cloudFirstContext(),/passphrase-short/,'encryption passphrase minimum unchanged');
  }
  f.config.pass='x'.repeat(12);assert.doesNotThrow(()=>f.context.cloudFirstContext());
}
console.log('Signup 6-character boundary, existing login, and separate 12-character encryption policy passed.');
