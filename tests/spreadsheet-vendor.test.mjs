import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
test('locally pinned spreadsheet library preserves existing import and export data',()=>{
 const c=vm.createContext({});vm.runInContext(fs.readFileSync(new URL('../assets/vendor/xlsx-0.20.3.full.min.js',import.meta.url),'utf8'),c);
 const x=c.XLSX;assert.equal(x.version,'0.20.3');
 const rows=[['日期','商戶','金額','幣別'],['2026-10-24','合成測試 "商戶"',123.45,'HKD'],['2026-10-25','Synthetic store',-9.99,'USD']];
 const wb=x.utils.book_new();x.utils.book_append_sheet(wb,x.utils.aoa_to_sheet(rows),'Transactions');
 const bytes=x.write(wb,{bookType:'xlsx',type:'array'}),read=x.read(bytes,{type:'array'});
 assert.equal(JSON.stringify(x.utils.sheet_to_json(read.Sheets.Transactions,{header:1})),JSON.stringify(rows));
});
