import {norm,tableLabel} from './accounting-plan';
export function canonicalPlayers(master:any[][]){
 const groups=new Map<string,any[][]>();
 for(const r of master.slice(1)){if(!r[0])continue;const k=norm(r[0]);groups.set(k,[...(groups.get(k)||[]),r]);}
 return Array.from(groups.values()).flatMap(rows=>{
  const codes=new Set(rows.map(r=>r[2]).filter(Boolean));
  const cards=new Set(rows.map(r=>String(r[1]||'')).filter(Boolean));
  if(codes.size>1||cards.size>1)return rows.map(r=>[r[0],r[1]||'',r[2]||'']);
  const best=rows.find(r=>r[1]&&r[2])||rows.find(r=>r[2])||rows[0];
  return [[best[0],best[1]||'',best[2]||'']];
 });
}
export function sheetContext(daily:any[][],master:any[][],businessDate:string){
 let game:any=null;
 const rows=daily.slice(1).map(r=>{
  if(r[0]!==''&&r[0]!=null)game=r[0];
  const date=typeof r[1]==='number'?new Date((r[1]-25569)*86400000).toISOString().slice(0,10):String(r[1]||'');
  return [game,date,tableLabel(r[2]),r[3],r[4],r[7]];
 }).filter(r=>r[4]&&r[1]===businessDate);
 return {businessDate,players:canonicalPlayers(master),recentGames:rows.slice(-200)};
}
export function correctedOperations(ops:any[],text:string,master:any[][]){
 const game=text.match(/(?:^|\s)(\d{1,2})\s*번\s*게임/);
 const players=canonicalPlayers(master);
 return (ops||[]).map(op=>{
  const matches=players.filter(r=>norm(r[0])===norm(op.player));
  return {...op,...(matches.length===1?{player:matches[0][0]}:{}),...(game&&['add','total','cancel'].includes(op.kind)?{game:Number(game[1])}:{})};
 });
}
