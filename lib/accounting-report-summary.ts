// Reports use the official calculated amount in column I, before expenses.
export function summarizeDay(rows:any[][],date:string){
 const stamp=Date.parse(date+'T00:00:00Z');
 if(!/^20\d\d-\d\d-\d\d$/.test(date)||!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,10)!==date)throw Error('날짜를 YYYY-MM-DD로 입력해주세요.');
 const day=stamp/86400000+25569,games=new Map<number,string>(),seen=new Set<string>();
 let game=0,priorDay:any=null,buyins=0,amount=0;
 for(const r of rows.slice(1)){
  if(r[1]!==priorDay){game=0;priorDay=r[1];}
  if(r[0]!==''&&r[0]!=null)game=Number(r[0]);
  if(Number(r[1])!==day||!r[4])continue;
  const n=Number(r[7]),v=Number(r[8]),table=String(r[2]||'');
  if(!Number.isSafeInteger(game)||game<1||!table||!r[6]||!Number.isSafeInteger(n)||n<1||r[8]==null||r[8]===''||!Number.isSafeInteger(v)||v<0)throw Error('정산 시트에 게임번호·코드·바이인·금액 확인이 필요한 항목이 있어요.');
  if(games.has(game)&&games.get(game)!==table)throw Error('같은 게임번호에 서로 다른 테이블이 있어요.');
  games.set(game,table);
  const key=game+'|'+String(r[4]).toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(seen.has(key))throw Error('같은 게임에 중복된 선수가 있어요.');
  seen.add(key);buyins+=n;amount+=v;
 }
 if(!games.size)throw Error('해당 날짜에 기록된 게임이 없어요.');
 return {date,games:games.size,buyins,amount,text:`금일 총 ${games.size}게임 ${buyins}바이인 ${amount.toLocaleString('en-US')}동입니다.`};
}
