import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const ui=fs.readFileSync(new URL('../cloud-ui.js',import.meta.url),'utf8');
function fixture(){
  const elements=new Map(),calls=[];
  const c=vm.createContext({window:{_cloudReceivedProfile:{id:'received',sourceKey:'original'},_cloudAuthApproved:false},
    document:{getElementById:id=>{if(!elements.has(id))elements.set(id,{hidden:false});return elements.get(id);}},clearTimeout(){},
    profileKey:()=> 'original',profilesMeta:()=>({active:'original',list:[{id:'original'},{id:'received'}]}),
    saveS:()=>true,switchProfile:id=>{calls.push(id);return true;},goTabIndex:i=>calls.push(i),TAB_ORDER:['home','wallet','gamble','settings']});
  vm.runInContext(ui,c);c.renderCloudAuth=()=>{};return {c,calls,elements};
}
test('received ledger opens only on explicit click with sync still paused',()=>{
  const {c,calls}=fixture();assert.equal(calls.length,0);c.cloudOpenReceivedProfile();
  assert.deepEqual(calls,['received',0]);assert.equal(c.window._cloudAuthApproved,false);
  assert.equal(c.window._cloudReceivedProfile,null);
});
for(const scenario of ['removed','changed','storage'])test(scenario+' prevents unsafe received-ledger navigation',()=>{
  const {c,calls}=fixture();
  if(scenario==='removed')c.profilesMeta=()=>({list:[{id:'original'}]});
  if(scenario==='changed')c.profileKey=()=> 'different';
  if(scenario==='storage')c.saveS=()=>false;
  c.cloudOpenReceivedProfile();assert.equal(calls.length,0);
  assert.equal(c.window._cloudAuthApproved,false);
});
test('session changes clear the received-ledger shortcut',()=>{
  const {c,elements}=fixture();c.cloudPauseSession();
  assert.equal(c.window._cloudReceivedProfile,null);assert.equal(elements.get('cloud-open-received').hidden,true);
});
