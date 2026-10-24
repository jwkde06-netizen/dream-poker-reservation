import {createHash} from 'node:crypto';
import type {LedgerSource} from './desk-ledger-plan';
import type {CellChange} from './accounting-plan';
const tabs:Record<string,keyof LedgerSource>={'일일 입력':'daily','F&B 입력':'fnb','플레이어 명단':'master','F&B 가격표':'menu'};
// Sheets trims empty tails and recalculates formula columns. Compare canonical inputs.
export function undoHash(s:LedgerSource){
 const clean=(rows:any[][],cols:number[])=>{const out=rows.map(r=>cols.map(c=>r[c]??''));while(out.length&&out[out.length-1].every(v=>v===''))out.pop();return out;};
 return createHash('sha256').update(JSON.stringify({daily:clean(s.daily,[0,1,2,3,4,7]),fnb:clean(s.fnb,[0,1,2,3]),master:clean(s.master,[0,1,2,3]),menu:clean(s.menu,[0,1,2,3,4])})).digest('hex');
}
export function projectChanges(s:LedgerSource,changes:CellChange[]):LedgerSource{
 const out=Object.fromEntries(Object.entries(s).map(([k,rows])=>[k,rows.map((r:any[])=>[...r])])) as LedgerSource;
 for(const c of changes){
  const m=c.range.match(/^'([^']+)'!([A-Z]+)(\d+)(?::[A-Z]+\d+)?$/),tab=m&&tabs[m[1]];
  if(!m||!tab)throw Error('실행 취소 범위를 확인해주세요.');
  const col=m[2].split('').reduce((n,x)=>n*26+x.charCodeAt(0)-64,0)-1,row=Number(m[3])-1;
  for(let i=0;i<c.values.length;i++){while(out[tab].length<=row+i)out[tab].push([]);c.values[i].forEach((v,j)=>{out[tab][row+i][col+j]=v;});}
 }
 return out;
}
export function undoPlan(original:any,source:LedgerSource){
 if(original.status!=='applied'||original.operation?.kind==='undo'||!['game','buyins','participant','cancel'].includes(original.operation?.kind))throw Error('실행 취소할 입력을 확인해주세요.');
 if(!original.operation.undoHash||original.operation.undoHash!==undoHash(source))throw Error('이후 기록이 변경되어 실행 취소할 수 없습니다. 현재 기록을 확인해주세요.');
 return {changes:original.changes.map((c:CellChange)=>({range:c.range,before:c.values,values:c.before})),summary:['실행 취소 · '+(original.summary?.[0]||'최근 입력')]};
}
