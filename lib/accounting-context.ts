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
 const players=canonicalPlayers(master).map(r=>({name:r[0],cardNumber:r[1]||null,agency:r[2]||null}));
 const games:Record<string,any>={};
 for(const r of rows.slice(-200)){
  const tableNumber=Number(String(r[2]).split('-')[0]);
  const key=[r[1],r[0],tableNumber,r[3]].join('|');
  games[key]??={date:r[1],gameNumber:Number(r[0]),tableNumber,tableLabel:r[2],blind:r[3],players:[]};
  games[key].players.push({name:r[4],buyins:Number(r[5]),agency:players.find(p=>p.name===r[4])?.agency||null});
 }
 return {businessDate,players,games:Object.values(games)};
}
export function correctedOperations(ops:any[],text:string,master:any[][],rules:any[]=[]){
 const game=text.match(/(?:^|\s)(\d{1,2})\s*번\s*게임/);
 const players=canonicalPlayers(master);
 const floors=Array.from(text.matchAll(/([2-5])\s*층/g)).map(m=>m[1]+'F');
 const amounts=Array.from(text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(만|천)?\s*(?:(\d+)\s*천)?\s*동/g)).map(m=>Number(m[1].replace(/,/g,''))*(m[2]==='만'?10000:m[2]==='천'?1000:1)+Number(m[3]||0)*1000);
 const onlyFnb=(ops||[]).filter(o=>o.kind==='fnb').length===1;
 return (ops||[]).map(op=>{
  const matches=players.filter(r=>norm(r[0])===norm(op.player));
  const fixed={...op,...(matches.length===1?{player:matches[0][0]}:{}),...(game&&['add','total','cancel'].includes(op.kind)?{game:Number(game[1])}:{})};
  if(!game&&Number.isInteger(op.printedGame)&&['add','total','cancel'].includes(op.kind)){
   for(const rule of rules){if(!String(rule.content).startsWith('게임번호 대응: '))continue;try{const a=JSON.parse(rule.content.slice('게임번호 대응: '.length));if(a.date===op.date&&a.table===op.table&&a.printedGame===op.printedGame&&Number.isInteger(a.game)&&a.game>0&&a.game<=100)fixed.game=a.game;}catch{}}
  }
  if(op.kind==='fnb'&&onlyFnb){
   if(new Set(floors).size===1)fixed.floor=floors[0];
   if(amounts.length===1)fixed.amount=amounts[0];
  }
  if(['add','total'].includes(op.kind)){
   const explicitDelta=/(?:한\s*번|한\s*바인|\d+\s*회|\d+\s*바인)\s*(?:더|추가)/.test(text);
   if(!explicitDelta&&Number.isInteger(op.chips)&&op.chips>=100000&&op.chips<=5000000&&op.chips%100000===0)fixed.buyins=op.chips/100000;
   // Ground arithmetic in the staff's literal chip amount where available.
   // This fixes 100000 mistakenly interpreted as an additional buyin (=2).
   const clean=norm(text),name=norm(op.player),at=clean.indexOf(name);
   const chips=at>=0?clean.slice(at+name.length).match(/^(\d{5,8})(?!\d)/):null;
   if(chips&&Number(chips[1])%100000===0&&Number(chips[1])>=100000&&Number(chips[1])<=5000000)fixed.buyins=Number(chips[1])/100000;
  }
  return fixed;
 });
}
export function focusedQuestion(question:unknown,text:string,ops:any[]){
 if(!question)return null;
 if(/F\s*&\s*B/i.test(text)&&ops.some(o=>o.kind==='fnb')&&/배경|다른\s*(영수증|게임)/.test(String(question)))return null;
 return String(question);
}
export function certainOperations(ops:any[],question:unknown){
 // Partial execution is safe for an unknown player, but not for an uncertain
 // game identity shared by every row. Never write the guessed game first.
 if(question&&/게임.{0,12}번호|몇\s*번째|테이블.{0,6}번호|날짜|영업일/.test(String(question)))return ops.filter(op=>!['add','total','cancel'].includes(op.kind));
 return ops;
}
