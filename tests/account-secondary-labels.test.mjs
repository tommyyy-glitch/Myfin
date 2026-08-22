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
assert.match(declaration('renderHome'),/eye-off/);

const code=`
const ACCT_SECONDARY_KINDS=['none','retirement','locked','physical','emergency','business'];
let calls={save:0,home:0,wallet:0,gamble:0,settings:0};
const S={activeTab:'home',accounts:[{id:'mpf',kind:'invest',secondaryKind:'retirement'}],pnlNetHidden:{},physicalAssets:[]};
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
${declaration('acctIsPhysical')}
${declaration('acctCountsInNet')}
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
assert.equal(context.hiddenBalance.physicalAccountAsset,0);
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
assert.equal(context.calls.save,6);
assert.equal(context.calls.home,6);
assert.equal(context.calls.wallet,6);
