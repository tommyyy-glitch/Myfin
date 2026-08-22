import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const html=fs.readFileSync(path.join(here,'..','index.html'),'utf8');
function declaration(name){const start=html.indexOf(`function ${name}(`);assert.notEqual(start,-1,`missing function ${name}`);const next=html.indexOf('\nfunction ',start+10);return html.slice(start,next<0?html.length:next);}

const code=`
const S={lang:'zh',rpLabels:{},activeTab:'wallet',_arFilter:'all'};
function escapeHtml(v){return String(v);}
function inlineJsString(v){return JSON.stringify(String(v));}
function saveS(){globalThis.saved=(globalThis.saved||0)+1;}
function filterAR(){globalThis.rendered=(globalThis.rendered||0)+1;}
function renderPrivateLoans(){}
${declaration('rpLabelDefs')}
${declaration('rpLabelsFor')}
${declaration('rpLabelBadges')}
${declaration('rpLabelPicker')}
${declaration('toggleRPLabel')}
globalThis.count=rpLabelDefs().length;
toggleRPLabel('alex','late');
globalThis.afterAdd=[...rpLabelsFor('alex')];
globalThis.badge=rpLabelBadges('alex');
globalThis.picker=rpLabelPicker('alex');
toggleRPLabel('alex','late');
globalThis.afterRemove=[...rpLabelsFor('alex')];
`;
const context={};vm.createContext(context);vm.runInContext(code,context);
assert.equal(context.count,6);
assert.deepEqual([...context.afterAdd],['late']);
assert.deepEqual([...context.afterRemove],[]);
assert.match(context.badge,/經常延遲/);
assert.match(context.picker,/信用不太好/);
assert.equal(context.saved,2);
assert.equal(context.rendered,2);
assert.doesNotMatch(html,/function friendCredit\(/);
assert.doesNotMatch(html,/friendCreditBadge/);

console.log('Manual R/P status-label tests passed.');
