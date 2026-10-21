import {createHash,createSign} from 'node:crypto';
import {weeklyDraftRows,type WeeklyAccountingDraft} from './accounting-report';

// Never accept a workbook, token endpoint or URL from a Telegram message.
export const accountingWorkbook='1QJUPswetSgSFAlKkDXdY_WMmM6LCp6nXs9EvmuQF22I';
let cached:{token:string;expires:number}|undefined;
export async function accessToken(){
 if(cached&&cached.expires>Date.now()+60000)return cached.token;
 let key:any;
 try{key=JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON||'')}catch{throw new Error('Google service account configuration is missing or invalid')}
 if(key.type!=='service_account'||typeof key.client_email!=='string'||typeof key.private_key!=='string')throw new Error('Invalid Google service account');
 const now=Math.floor(Date.now()/1000);
 const encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
 const unsigned=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:key.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
 let signature:string;
 try{signature=createSign('RSA-SHA256').update(unsigned).sign(key.private_key,'base64url')}catch{throw new Error('Invalid Google signing key')}
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+signature}),signal:AbortSignal.timeout(12000),cache:'no-store'});
 if(!response.ok)throw new Error('Google authorization failed');
 const body=await response.json();
 if(typeof body.access_token!=='string')throw new Error('Google authorization failed');
 cached={token:body.access_token,expires:Date.now()+Math.min(Number(body.expires_in)||300,3600)*1000};
 return cached.token;
}

export async function accountingSheetStatus(){
 const params=new URLSearchParams({valueRenderOption:'FORMULA'});
 params.append('ranges',"'일일 입력'!A1:O2");
 params.append('ranges',"'플레이어 명단'!A1:D1");
 const response=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${accountingWorkbook}/values:batchGet?${params}`,{headers:{Authorization:'Bearer '+await accessToken()},cache:'no-store',signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw new Error('Accounting workbook access failed');
 const body=await response.json();
 const daily=body.valueRanges?.[0]?.values||[],players=body.valueRanges?.[1]?.values||[];
 const expected=['NUMBER','DATE','T NO.','BLIND','PLAYER','CARD NO.','AGENCY','BUY IN'];
 const headers=expected.every((v,i)=>daily[0]?.[i]===v)&&players[0]?.[0]==='PLAYER';
 const formulas=[5,6,8,9,10,11,12,13,14].every(i=>String(daily[1]?.[i]||'').startsWith('=ARRAYFORMULA('));
 // Return checks only, never credentials or player records.
 return {accessible:true,headers_match:headers,formulas_present:formulas,write_enabled:false};
}

export async function readAccountingValues(ranges:string[],formula=false):Promise<any[][][]> {
 const params=new URLSearchParams({valueRenderOption:formula?'FORMULA':'UNFORMATTED_VALUE'});
 ranges.forEach(range=>params.append('ranges',range));
 const response=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${accountingWorkbook}/values:batchGet?${params}`,{
  headers:{Authorization:'Bearer '+await accessToken()},cache:'no-store',signal:AbortSignal.timeout(20000)
 });
 if(!response.ok)throw Error('Accounting workbook read failed');
 const body=await response.json();
 return body.valueRanges.map((range:any)=>range.values||[]);
}

type SheetRequest=(path:string,body?:unknown)=>Promise<any>;
async function draftRequest(path:string,body?:unknown) {
 const response=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${accountingWorkbook}${path}`,{
  method:body?'POST':'GET',headers:{Authorization:'Bearer '+await accessToken(),'Content-Type':'application/json'},
  body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(20000)
 });
 if(!response.ok)throw Error('정산 초안 시트 요청을 확인해주세요.');
 return response.json();
}
function sameDraftValues(actual:unknown[][],expected:Array<Array<string|number>>) {
 const length=Math.max(actual.length,expected.length);
 for(let row=0;row<length;row++)for(let column=0;column<Math.max(actual[row]?.length||0,expected[row]?.length||0);column++){
  if((actual[row]?.[column]??'')!==(expected[row]?.[column]??''))return false;
 }
 return true;
}

// One immutable saved report owns one new tab. This function never accepts a
// destination workbook or existing business tab from an operator or model.
export async function createAccountingDraftSheet(reportId:string,draft:WeeklyAccountingDraft,request:SheetRequest=draftRequest) {
 if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(reportId))throw Error('정산 초안 ID를 확인해주세요.');
 const id=reportId.toLowerCase();
 const title=`정산초안_${draft.period.startDate}_${id}`;
 const sheetId=(createHash('sha256').update('dream-accounting:'+id).digest().readUInt32BE(0)&0x7fffffff)||1;
 const seed:Array<Array<string|number>>=[['초안 ID',id]];
 const rows=[...seed,...weeklyDraftRows(draft)];
 const metadataPath='?fields=sheets.properties(sheetId,title,gridProperties(columnCount))';
 const range=`'${title}'!A:H`;
 const read=async()=>{
  const result=await request('/values/'+encodeURIComponent(range)+'?valueRenderOption=FORMULA');
  if(result.values!==undefined&&!Array.isArray(result.values))throw Error('정산 초안 시트를 검증할 수 없습니다.');
  return (result.values||[]) as unknown[][];
 };
 const find=(metadata:any)=>{
  if(!Array.isArray(metadata.sheets))throw Error('정산 시트 목록을 확인할 수 없습니다.');
  const matches=metadata.sheets.map((sheet:any)=>sheet.properties).filter((sheet:any)=>sheet?.sheetId===sheetId||sheet?.title===title);
  if(matches.length&&!(matches.length===1&&matches[0].sheetId===sheetId&&matches[0].title===title&&matches[0].gridProperties?.columnCount===8)){
   throw Error('초안 시트 ID 또는 이름이 다른 탭과 겹칩니다. 새 정산 초안을 요청해주세요.');
  }
  return matches.length===1;
 };
 let exists=find(await request(metadataPath)),created=false;
 if(!exists){
  try{
   await request(':batchUpdate',{requests:[
    {addSheet:{properties:{sheetId,title,gridProperties:{rowCount:Math.max(rows.length,100),columnCount:8,frozenRowCount:5,hideGridlines:true}}}},
    // The ownership marker is created atomically with the tab, so a timeout can
    // be recovered without claiming an unrelated blank tab with the same name.
    {updateCells:{start:{sheetId,rowIndex:0,columnIndex:0},rows:seed.map(row=>({values:row.map(value=>({userEnteredValue:{stringValue:String(value)}}))})),fields:'userEnteredValue'}},
    {repeatCell:{range:{sheetId,startRowIndex:1,endRowIndex:2,startColumnIndex:0,endColumnIndex:8},cell:{userEnteredFormat:{backgroundColor:{red:0.08,green:0.15,blue:0.22},textFormat:{bold:true,foregroundColor:{red:1,green:1,blue:1}}}},fields:'userEnteredFormat'}},
    {updateDimensionProperties:{range:{sheetId,dimension:'COLUMNS',startIndex:0,endIndex:8},properties:{pixelSize:150},fields:'pixelSize'}},
    {updateDimensionProperties:{range:{sheetId,dimension:'COLUMNS',startIndex:0,endIndex:2},properties:{pixelSize:240},fields:'pixelSize'}},
    {updateDimensionProperties:{range:{sheetId,dimension:'COLUMNS',startIndex:6,endIndex:7},properties:{pixelSize:360},fields:'pixelSize'}}
   ]});
   created=true;
  }catch{
   // This also handles a concurrent attempt for the same saved report. No
   // recovery path writes until the exact ID, title and marker are checked.
   exists=find(await request(metadataPath));
   if(!exists)throw Error('초안 시트 생성 결과를 확인할 수 없습니다. 같은 초안 ID로 다시 요청해주세요.');
  }
 }
 const actual=await read();
 const result={reportId:id,title,sheetId,url:`https://docs.google.com/spreadsheets/d/${accountingWorkbook}/edit#gid=${sheetId}`,verified:true as const,created};
 if(sameDraftValues(actual,rows))return result;
 if(!sameDraftValues(actual,seed))throw Error('기존 초안 탭이 변경되어 덮어쓰지 않았습니다. 새 정산 초안을 요청해주세요.');
 let writeFailed=false;
 try{await request('/values:batchUpdate',{valueInputOption:'RAW',data:[{range:`'${title}'!A1:H${rows.length}`,values:rows}]});}
 catch{writeFailed=true;}
 if(!sameDraftValues(await read(),rows))throw Error(writeFailed?'초안 시트 작성 결과가 불명확합니다. 같은 초안 ID로 확인해주세요.':'정산 초안 시트의 저장 결과가 다릅니다. 확인이 필요합니다.');
 return result;
}

