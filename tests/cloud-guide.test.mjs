import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import test from 'node:test';
const src=fs.readFileSync(new URL('../cloud-ui.js',import.meta.url),'utf8');
const c=vm.createContext({});vm.runInContext(src.slice(src.indexOf('function cloudGuideState('),src.indexOf('function renderCloudGuide(')),c);
test('signed-out and unlinked guides never claim sync is active',()=>{assert.match(c.cloudGuideState({},false,false).title,/先登入/);assert.match(c.cloudGuideState({},true,false).title,/尚未連結/);});
test('linked but paused guide asks for explicit enablement',()=>{assert.match(c.cloudGuideState({linked:true},true,false).title,/暫停/);});
test('all persisted conflict reasons offer a non-overwriting preview even when paused',()=>{for(const lastError of ['conflict','remote-newer','changed-during-download','insert-race','compare-and-swap']){const g=c.cloudGuideState({linked:true,pending:true,lastError},true,false);assert.equal(g.conflict,true);assert.match(g.next,/不覆蓋目前帳本/);assert.match(g.next,/不是逐筆合併/);}});
test('completed and pending states do not retain a stale resolved conflict',()=>{assert.equal(c.cloudGuideState({linked:true,pending:false,lastError:'remote-newer'},true,true,'ok').conflict,false);assert.match(c.cloudGuideState({linked:true,pending:true},true,true).title,/等待上傳/);});
test('in-flight and failure states never claim completion',()=>{assert.match(c.cloudGuideState({linked:true},true,true,'sync').next,/尚不能/);assert.match(c.cloudGuideState({linked:true},true,true,'err').title,/未完成/);});
