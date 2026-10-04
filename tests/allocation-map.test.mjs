import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const declaration=name=>{const start=html.indexOf(`function ${name}(`),end=html.indexOf('\nfunction ',start+10);assert.ok(start>=0);return html.slice(start,end);};
const ctx={};vm.createContext(ctx);vm.runInContext(declaration('allocationRects')+'\n'+declaration('allocationDirection'),ctx);
for(const values of [[100],[50,50],[9000,300,100,50,40,30,20,10,9,8,7,6,5,4,3,2,1],[1e6,1,.01,.0001],Array.from({length:100},(_,i)=>i+1)]){
 for(const [width,height] of [[288,250],[321,250],[740,250]]){
  const raw=values.map(val=>({val})),rects=ctx.allocationRects(raw,width,height),total=values.reduce((a,b)=>a+b,0);
  assert.equal(rects.length,values.length,'no grouping or percentage cutoff');
  assert.equal(new Set(rects.map(r=>r.index)).size,values.length);
  for(const r of rects){assert.ok([r.x,r.y,r.w,r.h].every(Number.isFinite));assert.ok(r.w>0&&r.h>0);assert.ok(r.x>=-1e-6&&r.y>=-1e-6&&r.x+r.w<=width+1e-6&&r.y+r.h<=height+1e-6);assert.ok(Math.abs(r.w*r.h-values[r.index]/total*width*height)<1e-6,'value-proportional area');}
  for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j],ox=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x),oy=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);assert.ok(ox<1e-6||oy<1e-6,'no overlapping tiles');}
  assert.ok(Math.abs(rects.reduce((n,r)=>n+r.w*r.h,0)-width*height)<1e-6,'fills full rectangle');
  assert.deepEqual(raw,values.map(val=>({val})),'layout does not mutate records');
 }
}
assert.equal(ctx.allocationRects([{val:0},{val:-5},{val:NaN}],300,250).length,0);
assert.equal(ctx.allocationDirection({_pnl:12}),'gain');assert.equal(ctx.allocationDirection({_pnl:-1}),'loss');assert.equal(ctx.allocationDirection({_pnl:0}),'flat');assert.equal(ctx.allocationDirection({}),'flat');
console.log('Allocation area, small holdings, bounds, overlap, neutral colours and data preservation passed.');
