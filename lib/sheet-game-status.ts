import {randomUUID} from 'node:crypto';
import {ledgerView} from './desk-ledger-view';
import type {LedgerSource} from './desk-ledger-plan';
export function sheetGameIdentity(s:LedgerSource,day:string,game:number){
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(day)||!Number.isSafeInteger(game)||game<1)throw Error('날짜와 게임 번호를 확인해주세요.');
 const rows=ledgerView(s,day).daily.filter(r=>r.game===game);
 const ids=new Set(rows.map(r=>r.table+'|'+r.blind));
 if(!rows.length||ids.size!==1)throw Error('시트의 게임과 테이블을 하나로 확인할 수 없습니다. 장부를 확인해주세요.');
 return {business_date:day,game_no:game,table_label:rows[0].table,physical_table:String(rows[0].table).split('-')[0],blind:rows[0].blind};
}
export async function changeSheetGameStatus(client:any,s:LedgerSource,b:any,userId:string){
 const reference=b.action==='game_reference';
 if(reference&&(typeof b.sourceNo!=='string'||!/^\d{0,8}$/.test(b.sourceNo)))throw Error('No.는 8자리 이내 숫자로 입력해주세요.');
 if((!reference&&!['unconfirmed','prepared','active','closed'].includes(b.status))||!(b.version===null||typeof b.version==='string'))throw Error('진행 상태 요청을 확인해주세요.');
 const identity=sheetGameIdentity(s,b.day,b.game);
 const q=await client.from('dream_sheet_game_status').select('*').eq('business_date',b.day).eq('game_no',b.game).maybeSingle();
 if(q.error)throw Error('게임 상태를 읽지 못했습니다.');
 const previous=q.data;
 if((previous?.version??null)!==b.version)throw Error('다른 직원이 상태를 변경했습니다. 새로고침 후 확인해주세요.');
 const nextStatus=reference?(previous?.table_label===identity.table_label&&previous?.blind===identity.blind?previous.status:'unconfirmed'):b.status;
 const sourceNo=reference?(b.sourceNo||null):(previous?.source_no??null);
 if(previous&&previous.source_no===sourceNo&&previous.status===nextStatus&&previous.table_label===identity.table_label&&previous.blind===identity.blind)return;
 const now=new Date().toISOString();
 const record={...identity,status:nextStatus,source_no:sourceNo,version:randomUUID(),updated_at:now,updated_by:userId,history:[...(previous?.history||[]),{at:now,by:userId,from:previous?.status??null,to:nextStatus,table:identity.table_label,sourceNo,previousSourceNo:previous?.source_no??null}]};
 const result=previous?await client.from('dream_sheet_game_status').update(record).eq('business_date',b.day).eq('game_no',b.game).eq('version',b.version).select('version'):await client.from('dream_sheet_game_status').insert(record).select('version');
 if(result.error?.code==='23505')throw Error('이 테이블에 이미 진행 중인 게임이 있거나 다른 직원이 상태를 변경했습니다. 새로고침 후 확인해주세요.');
 if(result.error||result.data?.length!==1)throw Error('상태 저장을 확인하지 못했습니다. 새로고침 후 확인해주세요.');
}
