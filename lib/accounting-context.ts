import {norm,tableLabel} from './accounting-plan';
// Explicitly approved identity only; JANG YOON HO remains a different player.
export function playerIdentity(name:unknown,rules:any[]=[]){
 const value=norm(name);
 if(value==='CHANGCALEBYOONHO'&&rules.some(r=>/CHANG CALEB YOON-HO/.test(String(r.content))&&/CHANG YOON HO/.test(String(r.content))))return 'CHANGYOONHO';
 return value;
}
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
 const gameNumbers=Array.from(new Set(Array.from(text.matchAll(/((?:\d{1,2}\s*[,·/]\s*)*\d{1,2})\s*(?:번째|번)\s*게임/g)).flatMap(m=>m[1].split(/[,·/]/).map(Number))));
 const game=gameNumbers.length===1?gameNumbers[0]:null;
 const attendance=(ops||[]).filter(o=>['add','total','cancel'].includes(o.kind));
 const tables=new Set(attendance.map(o=>Number(o.table)));
 const mentionedTables=Array.from(new Set(Array.from(text.matchAll(/(\d{1,2})\s*번\s*테이블/g)).map(m=>Number(m[1]))));
 const label=text.match(/(?:시트에|테이블(?:은|는)?)\s*(\d{1,2})\s*-\s*\d{1,2}/);
 const scopedTable=mentionedTables.length===1?mentionedTables[0]:label?Number(label[1]):null;
 const players=canonicalPlayers(master);
 const floors=Array.from(text.matchAll(/([2-5])\s*층/g)).map(m=>m[1]+'F');
 const amounts=Array.from(text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(만|천)?\s*(?:(\d+)\s*천)?\s*동/g)).map(m=>Number(m[1].replace(/,/g,''))*(m[2]==='만'?10000:m[2]==='천'?1000:1)+Number(m[3]||0)*1000);
 const onlyFnb=(ops||[]).filter(o=>o.kind==='fnb').length===1;
 return (ops||[]).map(op=>{
  const matches=players.filter(r=>norm(r[0])===playerIdentity(op.player,rules));
  // A follow-up about one receipt must never renumber every receipt in a photo.
  const applies=game&&['add','total','cancel'].includes(op.kind)&&(scopedTable?Number(op.table)===scopedTable:tables.size===1);
  const fixed={...op,...(matches.length===1?{player:matches[0][0]}:{}),...(applies?{game:game,gameConfirmed:true}:gameNumbers.length>1&&gameNumbers.includes(op.game)?{gameConfirmed:true}:{})};
  if(!applies&&Number.isInteger(op.printedGame)&&['add','total','cancel'].includes(op.kind)){
   for(const rule of rules){if(!String(rule.content).startsWith('게임번호 대응: '))continue;try{const a=JSON.parse(rule.content.slice('게임번호 대응: '.length));if(a.date===op.date&&a.table===op.table&&a.printedGame===op.printedGame&&Number.isInteger(a.game)&&a.game>0&&a.game<=100){fixed.game=a.game;fixed.gameConfirmed=true;}}catch{}}
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
 }).filter(op=>{
  if(op.kind!=='register')return true;
  const matches=master.slice(1).filter(r=>norm(r[0])===playerIdentity(op.player,rules));
  if(matches.length!==1)return true;
  const existing=matches[0];
  // OCR sometimes emits register + add for a known player. Do not send that
  // no-op through registration authorization or overwrite their master code.
  if(!String(existing[2]||'').trim())return true;
  const sameCode=!op.agency||norm(op.agency)===norm(existing[2]);
  const sameCard=!op.card||String(op.card).trim()===String(existing[1]||'').trim();
  if(sameCode&&sameCard)return false;
  const explicitlyNamed=norm(text).includes(norm(op.player));
  return explicitlyNamed||!!op.card;
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

export function clearResolvedIdentityQuestion(question:unknown,ops:any[],master:any[][],rules:any[]=[]){
 const match=String(question||'').match(/^(.+?)님 명단의 이름과 소속을 확인해주세요\.$/);
 if(!match)return question;
 const identity=playerIdentity(match[1],rules);
 const found=canonicalPlayers(master).filter(r=>norm(r[0])===identity);
 if(found.length!==1||!String(found[0][2]||'').trim())return question;
 return ops.some(o=>['add','total'].includes(o.kind)&&norm(o.player)===identity)?null:question;
}
