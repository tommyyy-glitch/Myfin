import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function declaration(name){
  const start=html.indexOf(`function ${name}(`);
  if(start<0)return '';
  const next=html.indexOf('\nfunction ',start+10);
  return html.slice(start,next<0?html.length:next);
}
function fixture(){
  const fields=new Map(),messages=[],confirmations=[];
  const c={S:{accounts:[{id:'bank',label:'Bank',cur:'HKD',opening:0},{id:'empty',label:'Empty'}],cats:[],txns:[],people:[],portfolio:[],physicalAssets:[],privateLoans:[],debts:[],gamble:[],autopay:[],autoincome:[],customSections:[],budget:{excludedCats:[]},tax:{excludedCats:[]},catMRU:[],acctMRU:[],mergeSelected:[],lang:'zh'},
    FX:{USD:8,JPY:0.05},CUR_SYM:{HKD:'HK$',USD:'US$',JPY:'¥'},messages,confirmations,fields,
    crypto:{randomUUID:()=> 'same-uuid'},_undoDelTxn:null,window:{},saves:0,checkpoints:0,allowSave:true,allowConfirm:true,
    document:{getElementById(id){if(!fields.has(id))fields.set(id,{value:'',style:{}});return fields.get(id);}},
    showToast(msg){messages.push(msg);},tt:(zh)=>zh,t:k=>k,
    confirm(msg){confirmations.push(msg);return c.allowConfirm;},
    saveS(){c.saves++;return c.allowSave;},checkpointProfile(){c.checkpoints++;if(c.failCheckpoint)throw new Error('quota');},profileKey:()=> 'synthetic',
    renderSettings(){},renderHome(){},refreshWallet(){},refreshAllViews(){},renderCatChips(){},budgetCfg(){return c.S.budget;},
  };
  vm.createContext(c);
  vm.runInContext(['abbrevNum','numStr','fmt','fmtCur','fmtSigned','getCat','ensureDefaultCategories','accountDeletionBlockers','deleteAcct','newCategoryId','categoryNameKey','findCategoryByName','addCat','addInlineCat','mergeCats'].map(declaration).join('\n'),c);
  return c;
}

test('funded account deletion leaves all records and balances intact',()=>{
  const c=fixture();c.S.accounts[0].opening=1000;c.S.txns=[{id:'income',acctId:'bank',amount:500,amtHKD:500}];
  const before=JSON.stringify(c.S);c.deleteAcct('bank');
  assert.equal(JSON.stringify(c.S),before);assert.equal(c.saves,0);assert.match(c.messages.at(-1),/不能刪除/);
});
for(const [collection,row] of [
  ['txns',{acctId:'bank',excluded:true}],['txns',{toAcctId:'bank',date:'2099-01-01'}],
  ['portfolio',{acctId:'bank',exitPrice:1}],['gamble',{acctId:'bank',open:false}],
  ['people',{acctId:'empty',settleAcctId:'bank',settled:true}],['physicalAssets',{acctId:'empty',saleAcctId:'bank'}],
  ['privateLoans',{acctId:'bank',payments:[]}],['debts',{acctId:'bank',balance:0}],
  ['autopay',{acctId:'bank',active:false}],['autoincome',{acctId:'bank',active:false}],
  ['portfolio',{acctLabel:'Bank'}],['customSections',{name:'Bank'}],
  ['autopay',{acctId:'',acct:' bank ',active:false}],['autoincome',{acct:'Bank',active:false}],
  ['privateLoans',{payments:[{acctId:'bank'}]}],['changelog',{acctId:'bank',action:'delete'}],
  ['portfolio',{acctId:'old-missing-id',acctLabel:'B a n k',valueHKD:100}],
])test('account guard retains '+collection+' '+JSON.stringify(row),()=>{
  const c=fixture();c.S[collection]=[row];const before=JSON.stringify(c.S);c.deleteAcct('bank');
  assert.equal(JSON.stringify(c.S),before);assert.equal(c.saves,0);
});
test('negative opening, invalid opening and pending transaction undo also prevent deletion',()=>{
  for(const opening of [-1,'not-a-number']){const c=fixture();c.S.accounts[0].opening=opening;c.deleteAcct('bank');assert.equal(c.S.accounts.length,2);}
  const c=fixture();c._undoDelTxn={tx:{acctId:'bank'}};c.deleteAcct('bank');assert.equal(c.S.accounts.length,2);
});
test('an account used by a saved balance alert cannot be deleted',()=>{
  const c=fixture();c.S.notify={customRules:[{type:'account_balance',target:'bank',on:false}]};
  const before=JSON.stringify(c.S);c.deleteAcct('bank');assert.equal(JSON.stringify(c.S),before);
});
test('matching legacy labels do not override an explicit different account ID',()=>{
  const c=fixture();c.S.autopay=[{acctId:'empty',acct:'Bank'}];c.deleteAcct('bank');
  assert.equal(c.S.accounts.length,1);assert.equal(c.S.accounts[0].id,'empty');
});
test('empty account deletion requires confirmation and a recovery checkpoint',()=>{
  const c=fixture();c.S.selAcct='empty';c.S.selAcctTo='empty';c.S.acctFilter='empty';c.S.acctMRU=['empty','bank'];
  c.allowConfirm=false;c.deleteAcct('empty');assert.equal(c.S.accounts.length,2);assert.equal(c.saves,0);
  c.allowConfirm=true;c.deleteAcct('empty');assert.equal(c.S.accounts.length,1);assert.equal(c.checkpoints,1);
  assert.equal(c.S.selAcct,'bank');assert.equal(c.S.selAcctTo,'bank');assert.equal(c.S.acctFilter,'all');assert.deepEqual([...c.S.acctMRU],['bank']);
  c.deleteAcct('bank');assert.equal(c.S.accounts.length,1);
});
test('storage failures cannot leave an account removed in memory',()=>{
  for(const mode of ['failCheckpoint','allowSave']){const c=fixture();c.S.selAcct='empty';const before=JSON.stringify(c.S);
    if(mode==='failCheckpoint')c.failCheckpoint=true;else c.allowSave=false;
    c.deleteAcct('empty');assert.equal(JSON.stringify(c.S),before);
  }
});
test('new categories have distinct stable IDs for Chinese, emoji and punctuation',()=>{
  const c=fixture();c.S.cats=[{id:'legacy',label:'Keep'}];c.S.txns=[{catId:'legacy',amount:5}];
  for(const name of ['飲食','交通','🍜','meal!','meal?']){c.document.getElementById('new-cat-name').value=name;c.addCat();}
  assert.equal(c.S.cats.length,6);assert.equal(new Set(c.S.cats.map(x=>x.id)).size,6);assert.ok(c.S.cats.every(x=>x.id));
  assert.equal(c.S.txns[0].catId,'legacy');
  const ids=c.S.cats.map(x=>x.id);c.document.getElementById('new-cat-name').value='交通';c.addCat();
  assert.deepEqual([...c.S.cats.map(x=>x.id)],[...ids],'same-name submit must not create a silent duplicate');
  c.document.getElementById('inline-cat-name').value='新項目';c.addInlineCat();assert.ok(c.S.selCat);
  c.document.getElementById('inline-cat-name').value='交通';c.addInlineCat();assert.equal(c.S.selCat,ids[2]);
});
test('category merge keeps independent IDs and all active references together',()=>{
  const c=fixture();c.S.cats=[{id:'a',label:'A',aliases:['Alias A']},{id:'b',label:'B'},{id:'food',label:'Food'}];
  c.S.txns=[{id:1,catId:'a',amount:10},{id:2,catId:'b',amount:20},{id:3,catId:'food',amount:30}];
  c.S.autopay=[{catId:'a',id:'ap',amount:10}];c.S.autoincome=[{catId:'b',id:'ai'}];c.S.people=[{catId:'a',id:'rp'}];
  c.S.budget.excludedCats=['a','food'];c.S.tax.excludedCats=['b'];c.S.catMRU=['a','b','food'];c.S.selCat='a';c.S._billCat='b';
  c.S.mergeSelected=['a','b'];c.document.getElementById('merge-name').value='合併分類';c.mergeCats();
  const merged=c.S.cats.find(x=>x.label==='合併分類');assert.ok(merged?.id);assert.notEqual(merged.id,'food');
  for(const row of [c.S.txns[0],c.S.txns[1],c.S.autopay[0],c.S.autoincome[0],c.S.people[0]])assert.equal(row.catId,merged.id);
  assert.equal(c.S.txns[2].catId,'food');assert.equal(c.S.txns.reduce((n,x)=>n+x.amount,0),60);
  assert.deepEqual([...c.S.budget.excludedCats],['food',merged.id]);assert.deepEqual([...c.S.tax.excludedCats],[merged.id]);
  assert.deepEqual([...c.S.catMRU],[merged.id,'food']);assert.equal(c.S.selCat,merged.id);assert.equal(c.S._billCat,merged.id);
  assert.ok(merged.aliases.includes('Alias A'));assert.equal(c.checkpoints,1);
});
test('category merge cannot silently collide with an unrelated category name',()=>{
  const c=fixture();c.S.cats=[{id:'a',label:'A'},{id:'b',label:'B'},{id:'food',label:'Food'}];c.S.mergeSelected=['a','b'];
  c.document.getElementById('merge-name').value='Food';const before=JSON.stringify(c.S);c.mergeCats();assert.equal(JSON.stringify(c.S),before);
});
test('default categories stay merged across reloads and repeated merges',()=>{
  const c=fixture();c.DEF_CATS=[{id:'food',label:'Food',aliases:['Meal']},{id:'transport',label:'Transport',aliases:[]},{id:'new-default',label:'New',aliases:[]}];
  c.S.cats=c.DEF_CATS.slice(0,2).map(x=>({...x}));c.S.mergeSelected=['food','transport'];c.document.getElementById('merge-name').value='生活';c.mergeCats();
  const first=c.S.cats.find(x=>x.label==='生活');assert.deepEqual([...first.mergedFromIds],['food','transport']);
  c.S.cats=JSON.parse(JSON.stringify(c.S.cats));c.ensureDefaultCategories();
  assert.equal(c.S.cats.some(x=>x.id==='food'),false);assert.equal(c.getCat('food').id,first.id);assert.ok(c.S.cats.some(x=>x.id==='new-default'));
  c.S.mergeSelected=[first.id,'new-default'];c.document.getElementById('merge-name').value='生活總項';c.mergeCats();c.ensureDefaultCategories();
  assert.equal(c.S.cats.length,1);assert.equal(c.getCat('food').label,'生活總項');assert.equal(c.getCat('transport').label,'生活總項');
});
test('category merge rolls back if saving fails',()=>{
  const c=fixture();c.S.cats=[{id:'a',label:'A'},{id:'b',label:'B'}];c.S.mergeSelected=['a','b'];c.S.txns=[{catId:'a'}];
  c.document.getElementById('merge-name').value='合併';const before=JSON.stringify(c.S);c.allowSave=false;c.mergeCats();assert.equal(JSON.stringify(c.S),before);
});
test('category merge cannot orphan an undoable deleted transaction',()=>{
  const c=fixture();c.S.cats=[{id:'a',label:'A'},{id:'b',label:'B'}];c.S.mergeSelected=['a','b'];c._undoDelTxn={tx:{catId:'a',amtHKD:25}};
  c.document.getElementById('merge-name').value='合併';const before=JSON.stringify(c.S);c.mergeCats();
  assert.equal(JSON.stringify(c.S),before);assert.equal(c._undoDelTxn.tx.catId,'a');assert.equal(c.saves,0);
});
test('category ID fallback works without randomUUID',()=>{
  const c=fixture();delete c.crypto;
  for(const name of ['甲','乙']){c.document.getElementById('new-cat-name').value=name;c.addCat();}
  assert.equal(new Set(c.S.cats.map(x=>x.id)).size,2);assert.ok(c.S.cats.every(x=>x.id.startsWith('cat_')));
});
test('new category saves and merge checkpoints fail without changing the ledger',()=>{
  for(const fn of ['addCat','addInlineCat']){
    const c=fixture();c.allowSave=false;c.document.getElementById(fn==='addCat'?'new-cat-name':'inline-cat-name').value='測試';
    const before=JSON.stringify(c.S);c[fn]();assert.equal(JSON.stringify(c.S),before);
  }
  const c=fixture();c.S.cats=[{id:'a',label:'A'},{id:'b',label:'B'}];c.S.mergeSelected=['a','b'];
  c.document.getElementById('merge-name').value='合併';c.failCheckpoint=true;
  const before=JSON.stringify(c.S);c.mergeCats();assert.equal(JSON.stringify(c.S),before);assert.equal(c.saves,0);
});
test('money signs follow display precision, converted currency and privacy',()=>{
  const c=fixture();c.S.dispCur='HKD';c.S.numFmt='full';
  for(const n of [-0.01,-0.25,-0.49,-0.50,-1]){assert.ok(c.fmt(n).startsWith('−HK$'));assert.ok(c.fmtCur(n,'HKD').startsWith('−HK$'));}
  for(const n of [-0,-0.001,0]){assert.equal(c.fmt(n),'HK$0');assert.equal(c.fmtSigned(n),'HK$0');}
  c.S.dispCur='USD';assert.equal(c.fmt(-2),'−US$0.25');assert.equal(c.fmtCur(-2,'USD'),'−US$0.25');
  c.S.numFmt='abbr';assert.equal(c.fmt(-2),'US$0');assert.equal(c.fmtSigned(-2),'US$0');assert.equal(c.fmt(-8000),'−US$1K');
  c.S.privacy=true;for(const fn of [c.fmt,c.fmtSigned,n=>c.fmtCur(n,'USD')])assert.equal(fn(-2),'••••');
});
