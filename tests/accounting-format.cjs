const assert=require('node:assert/strict');
const {dateTargets,prepareDateFormats,verifyDateDisplays}=require('../.test-build/accounting-format');
const changes=[{range:"'일일 입력'!A2280:E2280",values:[['',46318,'12-2','5M','CHANG YOON HO']],before:[[]]},{range:"'일일 입력'!H2280",values:[[1]],before:[[]]}];
module.exports=(async()=>{
 assert.deepEqual(dateTargets(changes),[{tab:'일일 입력',row:2280,serial:46318}]);
 assert.deepEqual(dateTargets([{range:"'일일 입력'!A2281:E2281",values:[['','','','','']]}]),[]);
 let display='46318',calls=[];
 const sheet=async(path,body)=>{calls.push(path);if(path.startsWith('?'))return {sheets:[{properties:{title:'일일 입력',sheetId:123}}]};if(path===':batchUpdate'){assert.equal(body.requests.length,1);const r=body.requests[0].repeatCell;assert.equal(r.fields,'userEnteredFormat.numberFormat');assert.deepEqual(r.range,{sheetId:123,startRowIndex:2279,endRowIndex:2280,startColumnIndex:1,endColumnIndex:2});display='2026-10-23';return {};}return {valueRanges:[{values:[[display]]}]};};
 await assert.rejects(()=>verifyDateDisplays(changes,sheet),/Date display/);
 await prepareDateFormats(changes,sheet);await verifyDateDisplays(changes,sheet);
 await assert.rejects(()=>prepareDateFormats(changes,async()=>({sheets:[]})),/sheet missing/);
 assert.equal(dateTargets([{range:"'F&B 입력'!A3:D3",values:[[46318,'2F',60000,'커피']]}])[0].tab,'F&B 입력');
})();
