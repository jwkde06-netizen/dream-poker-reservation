const assert=require('node:assert/strict');
const {createAccountingDraftSheet}=require('../.test-build/accounting-google');
const {buildWeeklyAccountingDraft}=require('../.test-build/accounting-report');

const id='12345678-1234-4321-8123-123456789abc';
const headers=['NUMBER','DATE','T NO.','BLIND','PLAYER','CARD NO.','AGENCY','BUY IN','RAKE','RAKE BACK','MONGOL','JAPAN','CHINA (AK)','HOUSE','KOREA2'];
const draft=buildWeeklyAccountingDraft({startDate:'2026-10-12',endDate:'2026-10-12',daily:[headers],fnb:[['DATE','FLOOR','AMOUNT','NOTE']],
 evidence:[{date:'2026-10-12',source:'viber',reference:'=HYPERLINK("https://example.invalid")',totals:{rakeBack:0,fnb:0,mongol:0,japan:0,china:0,house:0,korea2:0}}],salaryAdvanceVnd:0,partnerFormulaVerified:true});
const clone=value=>JSON.parse(JSON.stringify(value));
function workbook(options={}){
 const state={sheets:[],values:[],writes:[],reads:0};
 const request=async(path,body)=>{
  if(!body){
   if(path.startsWith('?fields='))return {sheets:clone(state.sheets)};
   assert(path.startsWith('/values/'));
   assert(path.endsWith('?valueRenderOption=FORMULA'));
   state.reads++;
   return {values:clone(state.values)};
  }
  state.writes.push(clone({path,body}));
  if(path===':batchUpdate'){
   const property=body.requests[0].addSheet.properties;
   assert(property.title.includes(id)||property.title.includes('12345678-1234-4321-8123-123456789abd'));
   for(const change of body.requests.slice(1))assert.equal((change.updateCells?.start||change.repeatCell?.range||change.updateDimensionProperties?.range).sheetId,property.sheetId);
   state.sheets.push({properties:clone(property)});
   state.values=body.requests[1].updateCells.rows.map(row=>row.values.map(cell=>cell.userEnteredValue.stringValue));
   if(options.addTimeout)throw Error('Synthetic response lost after atomic creation');
   return {};
  }
  assert.equal(path,'/values:batchUpdate');
  assert.equal(body.valueInputOption,'RAW','source references must remain literal values');
  assert.equal(body.data.length,1);
  assert(body.data[0].range.includes('정산초안_'));
  state.values=clone(body.data[0].values);
  if(options.corruptReadback)state.values[2][0]='unexpected change';
  if(options.writeTimeout)throw Error('Synthetic response lost after successful RAW write');
  return {};
 };
 return {state,request};
}

(async()=>{
 const first=workbook();
 const result=await createAccountingDraftSheet(id,draft,first.request);
 assert.equal(result.verified,true);
 assert(result.url.endsWith('#gid='+result.sheetId));
 assert.equal(first.state.writes.length,2);
 assert(first.state.values.some(row=>row.some(value=>typeof value==='string'&&value.startsWith('=HYPERLINK'))),'RAW evidence text must not be interpreted as a formula');
 const repeated=await createAccountingDraftSheet(id,draft,first.request);
 assert.equal(repeated.url,result.url);
 assert.equal(first.state.writes.length,2,'a replay must verify and reuse the saved report tab');

 first.state.values[2][0]='operator correction';
 await assert.rejects(createAccountingDraftSheet(id,draft,first.request),/변경되어/);
 assert.equal(first.state.writes.length,2,'manual edits must never be overwritten');

 for(const options of [{addTimeout:true},{writeTimeout:true}]){
  const lostResponse=workbook(options);
  const recovered=await createAccountingDraftSheet(id,draft,lostResponse.request);
  assert.equal(recovered.verified,true,'unknown API outcomes must be resolved by readback');
 }
 const corrupt=workbook({corruptReadback:true});
 await assert.rejects(createAccountingDraftSheet(id,draft,corrupt.request),/저장 결과가 다릅니다/);

 for(const properties of [
  {sheetId:result.sheetId,title:'existing business tab',gridProperties:{columnCount:8}},
  {sheetId:result.sheetId+1,title:result.title,gridProperties:{columnCount:8}}
 ]){
  const collision=workbook();collision.state.sheets=[{properties}];
  await assert.rejects(createAccountingDraftSheet(id,draft,collision.request),/겹칩니다/);
  assert.equal(collision.state.writes.length,0);
 }
 const unowned=workbook();unowned.state.sheets=[{properties:{sheetId:result.sheetId,title:result.title,gridProperties:{columnCount:8}}}];
 await assert.rejects(createAccountingDraftSheet(id,draft,unowned.request),/변경되어/);
 assert.equal(unowned.state.writes.length,0,'matching tab names alone cannot grant write ownership');
 const next=workbook();
 const nextResult=await createAccountingDraftSheet('12345678-1234-4321-8123-123456789abd',draft,next.request);
 assert.notEqual(nextResult.title,result.title,'every saved report has a distinct full UUID title');
 console.log('Accounting draft tab: RAW values, ownership, replay, timeout recovery, collision and readback checks passed');
})().catch(error=>{console.error(error);process.exitCode=1});
