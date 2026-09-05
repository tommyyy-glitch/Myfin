import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.equal(1788657600000+0.5,1788657600000+0.50001,'legacy timestamp addition loses distinct random fractions');
function fn(n){const hit=new RegExp('^function '+n+'\\(','m').exec(html);assert.ok(hit,'Missing '+n);for(let e=html.indexOf('\n',hit.index);e>=0;e=html.indexOf('\n',e+1)){const code=html.slice(hit.index,e);try{new vm.Script(code);return code;}catch{}}throw Error(n);}
const helpers=['moneyPlusRecordId','planMoneyPlusIdRepair','repairMoneyPlusIds'];
const c=vm.createContext({assert,console,Date:class extends Date{static now(){return 1788657600000;}},Math:Object.assign(Object.create(Math),{random:()=>0.5})});
vm.runInContext(helpers.filter(n=>html.includes('function '+n+'(')).map(fn).join('\n')+'\n'+fn('processMpRows')+`
const MP_SKIP=[];const S={txns:[],portfolio:[],gamble:[],accounts:[]};
const document={getElementById:()=>({textContent:''})};
function showToast(){}function confirm(){return true;}function mpCur(){return 'HKD';}function toHKD(n){return n;}
function mpResolveCat(cat){return {catId:cat,catLabel:cat,catIcon:'📌'};}function mpInvestType(){return 'stock';}function saveS(){return true;}function refreshAllViews(){}
const rows=Array.from({length:10000},(_,i)=>['2026-08-01',i%3===0?'invest':i%3===1?'gambling':'other',String(i+1),'income','','source','','entry '+i]);
processMpRows(rows);let all=[...S.txns,...S.portfolio,...S.gamble];
assert.equal(all.length,10000);assert.equal(new Set(all.map(r=>String(r.id))).size,10000,'batch import must not collide under a frozen clock/random source');
assert.ok(all.every(r=>Number.isSafeInteger(r.id)&&r.id>0),'IDs remain compatible with existing numeric UI handlers');
processMpRows(rows);assert.equal(S.txns.length+S.portfolio.length+S.gamble.length,10000,'same source rows are still skipped');
const occupied=new Set();const first=moneyPlusRecordId('test-key',occupied),second=moneyPlusRecordId('test-key',occupied);
assert.notEqual(first,second,'occupied candidates must be resolved');
assert.equal(moneyPlusRecordId('test-key',new Set()),first,'source-key allocation is deterministic');
const p={txns:[{id:100,imported:'mp',_mpKey:'a',amount:10,date:'2026-01-01'},{id:100,imported:'mp',_mpKey:'b',amount:20,date:'2026-01-02'},{id:200,amount:30}],portfolio:[],gamble:[],people:[],accounts:[{id:'cash'}]};
const before=JSON.parse(JSON.stringify(p)),planned=planMoneyPlusIdRepair(p);assert.equal(planned.changes.length,2);assert.deepEqual(p,before,'planning cannot mutate data');
const changed=repairMoneyPlusIds(p);assert.equal(changed.changes.length,2);assert.equal(new Set(p.txns.map(t=>t.id)).size,3);
assert.equal(p.txns[2].id,200,'unaffected native IDs stay unchanged');
assert.deepEqual(p.txns.map(({id,...rest})=>rest),before.txns.map(({id,...rest})=>rest),'only IDs change');
const repaired=JSON.stringify(p);assert.equal(repairMoneyPlusIds(p).changes.length,0);assert.equal(JSON.stringify(p),repaired,'repeat repair is a no-op');
const shuffled=JSON.parse(JSON.stringify(before));shuffled.txns.reverse();repairMoneyPlusIds(shuffled);
assert.deepEqual(Object.fromEntries(shuffled.txns.filter(t=>t._mpKey).map(t=>[t._mpKey,t.id])),Object.fromEntries(p.txns.filter(t=>t._mpKey).map(t=>[t._mpKey,t.id])),'record order must not change repaired identities');
for(const extra of [{people:[{fromTxn:100}]},{people:[{settleTxnIds:[100]}]},{debts:[{openTxnId:100}]},{custom:{transactionId:100}}]){
  const ambiguous={...JSON.parse(JSON.stringify(before)),...extra},original=JSON.stringify(ambiguous);
  assert.throws(()=>repairMoneyPlusIds(ambiguous),/reference|引用/);assert.equal(JSON.stringify(ambiguous),original,'ambiguous references block all changes');
}
const mixed=JSON.parse(JSON.stringify(before));delete mixed.txns[0].imported;assert.throws(()=>repairMoneyPlusIds(mixed),/Money|來源/);
const sameSource=JSON.parse(JSON.stringify(before));sameSource.txns[1]._mpKey='a';assert.throws(()=>repairMoneyPlusIds(sameSource),/source|來源/);
`,c);
assert.doesNotMatch(fn('processMpRows'),/Date\.now\(\)\+Math\.random\(\)/);
for(const stage of ['cancel','checkpoint-failure','save-failure','success']){
  const saved=new Map(),messages=[];
  const c2=vm.createContext({stage,window:{},Date,console,localStorage:{getItem:k=>saved.get(k)??null,setItem(k,v){if(stage==='checkpoint-failure')throw Error('quota');saved.set(k,v);}},document:{getElementById:()=>null},confirm:()=>stage!=='cancel',showToast:m=>messages.push(m),saveS:()=>stage!=='save-failure',refreshAllViews(){},tt:(zh,en)=>en,profileKey:()=> 'fos8'});
  vm.runInContext(helpers.concat(['repairMoneyPlusRecordIds']).map(fn).join('\n')+`
    let S={txns:[{id:10,imported:'mp',_mpKey:'a',amount:3},{id:10,imported:'mp',_mpKey:'b',amount:7}],portfolio:[],gamble:[]};
    function profileSnapshot(){return JSON.parse(JSON.stringify(S));}
    globalThis.before=JSON.stringify(S);repairMoneyPlusRecordIds();globalThis.after=JSON.stringify(S);
  `,c2);
  if(stage==='success'){
    assert.notEqual(c2.before,c2.after);assert.equal(JSON.stringify(JSON.parse(saved.get('myfin.id-recovery.v1.fos8')).profile),c2.before);
  }else assert.equal(c2.before,c2.after,stage+' must not change financial state');
  if(stage==='cancel'||stage==='checkpoint-failure')assert.equal(saved.size,0);
}
console.log('Money+ batch IDs, repair preservation, idempotence and ambiguous-reference checks passed.');
