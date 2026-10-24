import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const src=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function harness(){
 const fields=Object.fromEntries(['raw','amount','last4','type','cur','message'].map(k=>[k,{value:'',textContent:''}]));
 const c=vm.createContext({S:{bankCaptureEnabled:true},fields,bankField:k=>fields[k],tt:s=>s,applyBankSuggestions:()=>{},opened:0,toasts:[],openBankInbox(){c.opened++;},resetBankForm(){for(const f of Object.values(fields))f.value='';},showToast:s=>c.toasts.push(s),location:{hash:'',pathname:'/',search:''},history:{replaceState(){c.location.hash='';}}});
 vm.runInContext(src.slice(src.indexOf('function bankCaptureEnabled('),src.indexOf('function renderBankCaptureControls(')),c);
 assert.ok(src.includes('function bankSecurityNotice('),'one security-notice guard is shared by paste, links and saving');
 vm.runInContext(src.slice(src.indexOf('function bankSecurityNotice('),src.indexOf('function applyBankSuggestions(')),c);
 vm.runInContext(src.slice(src.indexOf('function receiveBankCapture('),src.indexOf('function openTxnModal(')),c);
 return c;
}
test('security notices clear raw text and derived values rather than keeping previous purchase fields',()=>{
 const c=harness();
 for(const notice of ['OTP 123456 purchase HKD 12.34','Verification code 123456','Your password for payment HKD 1','一次性密碼 123456','登入驗證 123456','Security code: 123456','one-time passcode 123456']){
  c.fields.raw.value=notice;c.fields.amount.value='999';c.fields.last4.value='1234';c.fields.type.value='expense';
  assert.equal(c.parseBankNotice(),false);assert.equal(c.fields.raw.value,'');assert.equal(c.fields.amount.value,'');assert.equal(c.fields.last4.value,'');assert.equal(c.fields.type.value,'');
 }
});
test('capture links reject security codes before rendering, strip fragments and do not overwrite rejection messages',()=>{
 const c=harness();c.location.hash='#bank-capture='+encodeURIComponent(JSON.stringify({bank:'hsbc',text:'OTP 123456 purchase HKD 12.34'}));
 c.receiveBankCapture();assert.equal(c.location.hash,'');assert.equal(c.opened,0);assert.equal(c.fields.raw.value,'');assert.ok(c.toasts.length);
});
test('capture envelope rejects empty, oversized, malformed and unexpected fields without opening a form',()=>{
 const c=harness();
 for(const d of [null,[],{bank:'hsbc',text:''},{bank:'hsbc',text:'   '},{bank:'other',text:'Purchase HKD 1'},{bank:'hsbc',text:'Purchase HKD 1',unexpected:true},{bank:'hsbc',text:'x'.repeat(4001)}]){
  c.location.hash='#bank-capture='+encodeURIComponent(JSON.stringify(d));c.receiveBankCapture();assert.equal(c.opened,0);assert.equal(c.location.hash,'');
 }
 c.location.hash='#bank-capture=%E0%A4%A';c.receiveBankCapture();assert.equal(c.opened,0);assert.equal(c.location.hash,'');
});
test('capture pages do not load third-party executable spreadsheet code and suppress referrers',()=>{
 assert.match(src,/<meta name="referrer" content="no-referrer">/);
 assert.doesNotMatch(src,/<script[^>]*src="https?:\/\//);
 assert.match(src,/assets\/vendor\/xlsx-0\.20\.3\.full\.min\.js/);
});

test('disabled capture strips incoming payload without opening or populating the form',()=>{
 const c=harness();c.S.bankCaptureEnabled=false;
 c.location.hash='#bank-capture='+encodeURIComponent(JSON.stringify({bank:'hsbc',text:'Purchase HKD 12.34'}));
 const before=JSON.stringify(c.S);c.receiveBankCapture();
 assert.equal(c.location.hash,'');assert.equal(c.opened,0);assert.equal(c.fields.raw.value,'');assert.equal(JSON.stringify(c.S),before);assert.ok(c.toasts.length);
});
