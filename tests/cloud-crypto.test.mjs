import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {webcrypto} from 'node:crypto';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function fn(n){const hit=new RegExp('^(?:async )?function '+n+'\\(','m').exec(html);let e=html.indexOf('\n',hit.index);while(e>=0){const c=html.slice(hit.index,e);try{new vm.Script(c);return c;}catch{}e=html.indexOf('\n',e+1);}throw Error(n);}
const c=vm.createContext({crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,Uint8Array,assert});
vm.runInContext(['b64e','b64d','cloudCryptoKey','cloudEncrypt','cloudDecrypt'].map(fn).join('\n')+`
let _cloudKey=null,_cloudKeyFor='';const a={pass:'synthetic-A',salt:''},b={pass:'synthetic-B',salt:''};let active=a;function cloudCfg(){return active;}
`,c);
await vm.runInContext(`(async()=>{
  const first=cloudEncrypt('profile-A',a);active=b;const second=cloudEncrypt('profile-B',b);
  const [ea,eb]=await Promise.all([first,second]);assert.ok(a.salt&&b.salt&&a.salt!==b.salt);
  assert.equal(await cloudDecrypt(ea.iv,ea.data,a.salt,a),'profile-A');
  assert.equal(await cloudDecrypt(eb.iv,eb.data,b.salt,b),'profile-B');
  const originalSalt=b.salt;await assert.rejects(()=>cloudDecrypt(ea.iv,ea.data,a.salt,b));assert.equal(b.salt,originalSalt,'decryption must not modify another config');
  const damaged=b64d(ea.data);damaged[0]^=1;await assert.rejects(()=>cloudDecrypt(ea.iv,b64e(damaged),a.salt,a));
})()`,c);
console.log('Real WebCrypto cross-profile encryption, wrong-passphrase and tamper tests passed.');
