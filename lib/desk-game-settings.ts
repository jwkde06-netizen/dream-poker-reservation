import {randomUUID} from 'node:crypto';
import {sheetGameIdentity} from './sheet-game-status';
import type {LedgerSource} from './desk-ledger-plan';
const get=async(client:any,op:any)=>{const r=await client.from('dream_sheet_game_status').select('*').eq('business_date',op.date).eq('game_no',op.game).maybeSingle();if(r.error)throw Error('게임 상태를 읽지 못했습니다.');return r.data;};
export async function prepareGameSettings(client:any,s:LedgerSource,op:any){
 if(op.kind!=='game_edit')return op;
 const identity=sheetGameIdentity(s,op.date,op.game),before=await get(client,op);
 if(identity.table_label!==op.expectedTable||identity.blind!==op.expectedBlind||(before?.version??null)!==op.version)throw Error('게임 정보가 변경됐습니다. 새로고침 후 수정해주세요.');
 const matches=before?.table_label===identity.table_label&&before?.blind===identity.blind;
 return {...op,gameSettingsBefore:before,gameSettingsStatus:matches?before.status:'unconfirmed',gameSettingsVersion:randomUUID()};
}
export async function checkGameSettings(client:any,op:any){
 if(op.kind!=='game_edit')return;
 const before=await get(client,op);
 if((before?.version??null)!==(op.gameSettingsBefore?.version??null))throw Error('다른 직원이 게임 상태를 수정했습니다. 다시 확인해주세요.');
 if(op.gameSettingsStatus==='active'){
  const q=await client.from('dream_sheet_game_status').select('game_no,physical_table,status').eq('business_date',op.date).eq('status','active');
  if(q.error)throw Error('진행 중인 테이블을 확인하지 못했습니다.');
  if(q.data.some((r:any)=>r.game_no!==op.game&&String(r.physical_table)===op.tableLabel.split('-')[0]))throw Error('해당 테이블에 진행 중인 다른 게임이 있습니다.');
 }
}
export async function finishGameSettings(client:any,s:LedgerSource,op:any,userId:string){
 if(op.kind!=='game_edit')return;
 const identity=sheetGameIdentity(s,op.date,op.game),before=await get(client,op),sourceNo=op.sourceNo||null;
 if(identity.table_label!==op.tableLabel||identity.blind!==op.blind)throw Error('수정한 게임의 시트 결과를 확인하지 못했습니다.');
 const exact=(r:any)=>r?.version===op.gameSettingsVersion&&r.table_label===identity.table_label&&r.blind===identity.blind&&r.status===op.gameSettingsStatus&&r.source_no===sourceNo;
 if(exact(before))return;
 await checkGameSettings(client,op);
 const now=new Date().toISOString(),record={...identity,status:op.gameSettingsStatus,source_no:sourceNo,version:op.gameSettingsVersion,updated_at:now,updated_by:userId,history:[...(before?.history||[]),{at:now,by:userId,action:'game_edit',from:before?.status??null,to:op.gameSettingsStatus,table:identity.table_label,previousTable:before?.table_label??op.expectedTable,previousBlind:op.expectedBlind,sourceNo,previousSourceNo:before?.source_no??null}]};
 const q=before?await client.from('dream_sheet_game_status').update(record).eq('business_date',op.date).eq('game_no',op.game).eq('version',before.version).select('version'):await client.from('dream_sheet_game_status').insert(record).select('version');
 if(q.error||q.data?.length!==1||!exact(await get(client,op)))throw Error('게임 설정의 저장 결과 확인이 필요합니다.');
}
