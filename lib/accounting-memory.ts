export type BusinessRule={id:number;kind:string;content:string};
export function validateMemory(value:any){
 if(!value||!['save','delete','list'].includes(value.action))throw Error('규칙 요청을 확인해주세요.');
 if(value.action==='list')return {action:'list' as const};
 if(value.action==='delete'){
  if(!Number.isSafeInteger(value.id)||value.id<1)throw Error('삭제할 규칙 번호를 알려주세요.');
  return {action:'delete' as const,id:value.id};
 }
 const content=String(value.content||'').trim();
 if(!content||content.length>800||!['instruction','table_round_labels'].includes(value.kind))throw Error('정산 업무 규칙을 800자 이내로 알려주세요.');
 if(/https?:|api.?key|token|secret|password|비밀번호|토큰|인증|권한|보안|웹훅|시스템.?프롬프트|system.?prompt/i.test(content))throw Error('인증·보안·연결 설정은 업무 규칙으로 변경할 수 없습니다.');
 return {action:'save' as const,kind:value.kind,content};
}
export function ruleList(rules:BusinessRule[]){return rules.length?'기억한 업무 규칙\n'+rules.map(r=>{
 let content=r.content;
 if(content.startsWith('게임번호 대응: ')){try{const a=JSON.parse(content.slice('게임번호 대응: '.length));content=`${a.date} · ${a.table}번 테이블: 인쇄 No.${a.printedGame}는 ${a.game}번 게임. 해당 날짜에만 적용.`;}catch{}}
 return `${r.id}. ${content}`;
}).join('\n'):'저장된 업무 규칙이 없습니다.';}
