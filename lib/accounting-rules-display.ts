export type Rule={id:number;kind:string;content:string};
export function gameMapping(content:string){
 if(!content.startsWith('게임번호 대응: '))return null;
 try{const a=JSON.parse(content.slice('게임번호 대응: '.length));return /^\d{4}-\d{2}-\d{2}$/.test(a.date)&&['table','printedGame','game'].every(k=>Number.isSafeInteger(a[k])&&a[k]>0)?a:null;}catch{return null;}
}
export function ruleView(rule:Rule){
 const a=gameMapping(rule.content);
 if(a)return {category:'게임번호 보정',title:`${a.table}번 테이블 · ${a.game}번째 게임`,lines:[`${a.date}에만 적용`,`인쇄 ${a.printedGame}번 → 실제 ${a.game}번째 게임`]};
 const s=rule.content;
 const category=/F&B|음료|메뉴|영수증|층/.test(s)?'F&B':/답장|대화|응답|완료/.test(s)?'직원방 사용':/이름|선수|명단|코드|카드/.test(s)?'선수 등록':'바이인 기록';
 const title=/기본.*2F|2F.*기본/.test(s)?'F&B 기본 층과 기록 방법':/띄어쓰기/.test(s)?'선수 이름의 띄어쓰기':/카드번호.*필수|카드번호 등/.test(s)?'카드번호 없이 선수 등록':/테이블.*회차/.test(s)?'테이블별 게임 회차':/대화.*답장|직원.*대화/.test(s)?'직원 대화와 봇 응답':s.split(/[.。\n]/)[0].slice(0,42);
 return {category,title,lines:s.split(/\n+|(?<=[.!?])\s+(?=[가-힣A-Z])/).filter(Boolean)};
}
