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

assert.match(html,/id="new-acct-secondary"/);
assert.match(html,/id="inline-acct-secondary"/);
assert.match(html,/id="h-fixed-toggle"[^>]*onclick="toggleHomeFixedAssets\(\)"/);
assert.match(html,/id="h-longdebt-toggle"[^>]*onclick="toggleHomeLongDebt\(\)"/);
assert.match(declaration('renderAcctBalances'),/startsWith\('secondary:'\)/);
assert.match(declaration('renderHome'),/fixedRecorded/);
assert.match(declaration('renderHome'),/bs\.fixedAssetRecorded/);
assert.match(declaration('renderHome'),/eye-off/);

const code=`
const ACCT_SECONDARY_KINDS=['none','retirement','locked','physical','emergency','business'];
let calls={save:0,home:0,wallet:0,gamble:0,settings:0};
const S={activeTab:'home',accounts:[{id:'mpf',label:'MPF',labelEn:'MPF',kind:'invest',secondaryKind:'retirement'}],portfolio:[{acctId:'mpf',type:'stock',valueHKD:200,costHKD:150}],gamble:[],pnlNetHidden:{},physicalAssets:[]};
function saveS(){calls.save++;}
function renderSettings(){calls.settings++;}
function renderHome(){calls.home++;}
function refreshWallet(){calls.wallet++;}
function renderGamble(){calls.gamble++;}
function renderPnlSecMgr(){calls.settings++;}
function acctCash(){return 100;}
function acctLiquidAssetValue(){return 200;}
function acctInvestmentAssetValue(){return 0;}
function acctAsset(){return 300;}
function privateLoanAssetTotal(){return 0;}
function physicalAssetsStats(){return {value:300};}
function rpAssetTotal(){return 0;}
function rpDebtTotal(){return 0;}
function acctMarginDebt(){return 50;}
function longDebtCountsInNet(){return !pnlNetExcluded('debt');}
function debtsOutstanding(){return 400;}
function pnlNetExcluded(kind){return !!S.pnlNetHidden[kind];}
${declaration('_normName')}
${declaration('accountForRecord')}
${declaration('recordUsesPhysicalAccount')}
${declaration('recordBelongsToAccount')}
${declaration('pnlBaseSecForPort')}
${declaration('pnlBaseSecForGamble')}
${declaration('pnlSecForPort')}
${declaration('pnlSecForGamble')}
${declaration('acctIsPhysical')}
${declaration('acctCountsInNet')}
${declaration('physicalAccountAssetRecorded')}
${declaration('balanceSheetBreakdown')}
${declaration('setAcctSecondaryKind')}
${declaration('toggleHomeFixedAssets')}
${declaration('toggleHomeLongDebt')}
setAcctSecondaryKind('mpf','locked');
globalThis.afterValid=S.accounts[0].secondaryKind;
setAcctSecondaryKind('mpf','not-valid');
globalThis.afterInvalid=S.accounts[0].secondaryKind;
S.accounts[0].secondaryKind='physical';
globalThis.beforeHideBalance=balanceSheetBreakdown();
toggleHomeFixedAssets();
globalThis.afterHide=S.pnlNetHidden.physical;
globalThis.hiddenBalance=balanceSheetBreakdown();
toggleHomeFixedAssets();
globalThis.afterShow=S.pnlNetHidden.physical;
globalThis.shownBalance=balanceSheetBreakdown();
toggleHomeLongDebt();
globalThis.afterDebtHide=S.pnlNetHidden.debt;
globalThis.hiddenDebtBalance=balanceSheetBreakdown();
toggleHomeLongDebt();
globalThis.afterDebtShow=S.pnlNetHidden.debt;
globalThis.shownDebtBalance=balanceSheetBreakdown();
const legacyPosition={acctId:'old-deleted-id',acctLabel:'MPF',type:'stock',valueHKD:70,costHKD:50};
const legacyGamble={acctLabel:'MPF',open:true,buyinHKD:30};
S.portfolio.push(legacyPosition);
S.gamble.push(legacyGamble);
globalThis.legacyPortKind=pnlSecForPort(legacyPosition);
globalThis.legacyGambleKind=pnlSecForGamble(legacyGamble);
globalThis.legacyPhysicalRecorded=physicalAccountAssetRecorded('mpf');
globalThis.moneyPlusKind=pnlSecForPort({acctLabel:'MPF',type:'stock',imported:'mp'});
globalThis.moneyPlusAccount=accountForRecord({acctLabel:'MPF',type:'stock',imported:'mp'});
globalThis.calls=calls;
`;
const context={};
vm.createContext(context);
vm.runInContext(code,context);

assert.equal(context.afterValid,'locked');
assert.equal(context.afterInvalid,'none');
assert.equal(context.afterHide,true);
assert.equal(context.afterShow,false);
assert.equal(context.beforeHideBalance.fixedAsset,600);
assert.equal(context.beforeHideBalance.physicalAccountAsset,300);
assert.equal(context.beforeHideBalance.assets,600);
assert.equal(context.hiddenBalance.fixedAsset,0);
assert.equal(context.hiddenBalance.fixedAssetRecorded,600);
assert.equal(context.hiddenBalance.physicalAccountAsset,300);
assert.equal(context.hiddenBalance.assets,0);
assert.equal(context.shownBalance.assets,600);
assert.equal(context.afterDebtHide,true);
assert.equal(context.afterDebtShow,false);
assert.equal(context.hiddenDebtBalance.marginDebt,50);
assert.equal(context.hiddenDebtBalance.managedLongDebt,400);
assert.equal(context.hiddenDebtBalance.longDebt,50);
assert.equal(context.shownDebtBalance.longDebt,450);
assert.equal(context.shownDebtBalance.netWorth,150);
assert.equal(context.hiddenDebtBalance.netWorth,550);
assert.equal(context.legacyPortKind,'physical');
assert.equal(context.legacyGambleKind,'physical');
assert.equal(context.legacyPhysicalRecorded,400);
assert.equal(context.moneyPlusKind,'stock');
assert.equal(context.moneyPlusAccount,null);
assert.equal(context.calls.save,6);
assert.equal(context.calls.home,6);
assert.equal(context.calls.wallet,6);

// Reproduce the real account flow: money moves from an online bank into a
// non-withdrawable wallet whose primary type is Other and second label is
// Fixed / locked asset. The fixed-asset net-worth switch must control it.
const transferCode=`
const S={activeTab:'home',accounts:[
  {id:'online_bank',label:'Online bank',kind:'bank',secondaryKind:'none',cur:'HKD',opening:1000},
  {id:'mainland_wallet',label:'Mainland wallet card',kind:'other',secondaryKind:'locked',cur:'HKD',opening:0}
],txns:[{id:1,type:'transfer',acctId:'online_bank',toAcctId:'mainland_wallet',amtHKD:300}],portfolio:[],gamble:[],physicalAssets:[],pnlNetHidden:{}};
function toHKD(v){return Number(v)||0;}
function acctPositionsCash(){return 0;}
function acctLiquidAssetValue(){return 0;}
function acctInvestmentAssetValue(){return 0;}
function privateLoanAssetTotal(){return 0;}
function physicalAssetsStats(){return {value:0};}
function rpAssetTotal(){return 0;}
function rpDebtTotal(){return 0;}
function acctMarginDebt(){return 0;}
function debtsOutstanding(){return 0;}
function longDebtCountsInNet(){return true;}
function saveS(){}
function renderHome(){}
function refreshWallet(){}
function renderGamble(){}
function renderPnlSecMgr(){}
${declaration('pnlNetExcluded')}
${declaration('acctCashTxns')}
${declaration('acctCash')}
${declaration('acctIsPhysical')}
${declaration('acctCountsInNet')}
function physicalAccountAssetRecorded(acctId){return Math.max(acctCash(acctId),0);}
${declaration('balanceSheetBreakdown')}
${declaration('toggleHomeFixedAssets')}
globalThis.sourceCash=acctCash('online_bank');
globalThis.walletCash=acctCash('mainland_wallet');
globalThis.lockedUsesFixedFilter=acctIsPhysical(S.accounts[1]);
globalThis.visible=balanceSheetBreakdown();
toggleHomeFixedAssets();
globalThis.hidden=balanceSheetBreakdown();
`;
const transferContext={};
vm.createContext(transferContext);
vm.runInContext(transferCode,transferContext);
assert.equal(transferContext.sourceCash,700);
assert.equal(transferContext.walletCash,300);
assert.equal(transferContext.lockedUsesFixedFilter,true);
assert.equal(transferContext.visible.quickAsset,700);
assert.equal(transferContext.visible.fixedAsset,300);
assert.equal(transferContext.visible.assets,1000);
assert.equal(transferContext.hidden.quickAsset,700);
assert.equal(transferContext.hidden.fixedAsset,0);
assert.equal(transferContext.hidden.assets,700);
