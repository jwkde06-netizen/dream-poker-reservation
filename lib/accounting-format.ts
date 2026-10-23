import type {CellChange} from './accounting-plan';
// Only restore date formatting for date cells actually included in this write.
// No ledger values, validations or formula columns are changed here.
export function dateTargets(changes:CellChange[]){
 const targets:{tab:string;row:number;serial:number}[]=[];
 for(const c of changes){
  const m=c.range.match(/^'(일일 입력|F&B 입력)'!([A-Z]+)(\d+)(?::[A-Z]+\d+)?$/);if(!m)continue;
  const col=m[2].split('').reduce((n,x)=>n*26+x.charCodeAt(0)-64,0)-1;
  const dateCol=m[1]==='일일 입력'?1:0;
  for(let i=0;i<c.values.length;i++){const value=c.values[i][dateCol-col];if(typeof value==='number'&&Number.isInteger(value)&&value>40000&&value<60000)targets.push({tab:m[1],row:Number(m[3])+i,serial:value});}
 }
 return targets;
}
export async function prepareDateFormats(changes:CellChange[],sheet:(path:string,body?:unknown)=>Promise<any>){
 const targets=dateTargets(changes);if(!targets.length)return;
 const meta=await sheet('?fields=sheets.properties');
 const requests=targets.map(t=>{const id=meta.sheets.find((s:any)=>s.properties.title===t.tab)?.properties.sheetId;if(id==null)throw Error('Date format sheet missing');const col=t.tab==='일일 입력'?1:0;return {repeatCell:{range:{sheetId:id,startRowIndex:t.row-1,endRowIndex:t.row,startColumnIndex:col,endColumnIndex:col+1},cell:{userEnteredFormat:{numberFormat:{type:'DATE',pattern:'yyyy-mm-dd'}}},fields:'userEnteredFormat.numberFormat'}};});
 await sheet(':batchUpdate',{requests});
}
export async function verifyDateDisplays(changes:CellChange[],sheet:(path:string,body?:unknown)=>Promise<any>){
 const targets=dateTargets(changes);if(!targets.length)return;
 const query=new URLSearchParams({valueRenderOption:'FORMATTED_VALUE'});
 for(const t of targets)query.append('ranges',`'${t.tab}'!${t.tab==='일일 입력'?'B':'A'}${t.row}`);
 const actual=await sheet('values:batchGet?'+query);
 targets.forEach((t,i)=>{const expected=new Date((t.serial-25569)*86400000).toISOString().slice(0,10);if(actual.valueRanges?.[i]?.values?.[0]?.[0]!==expected)throw Error('Date display readback mismatch');});
}
