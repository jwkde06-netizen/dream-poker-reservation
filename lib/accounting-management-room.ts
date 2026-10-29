import {randomUUID} from 'node:crypto';
import {db,extract} from './accounting-agent';
import {tg} from './telegram';
import {validateMemory,ruleList,memoryReceipt} from './accounting-memory';
import {managementCommand,managementMessage,managementAdmin,managementHelp} from './accounting-management-domain';

// This handler has no ledger, image-download, reservation or Sheets write path.
// Only a verified administrator can pair one separate room or mutate shared rules.
export async function handleManagementRoom(update:any){
 const staff=process.env.STAFF_TELEGRAM_CHAT_ID||'';
 const m=managementMessage(update,staff,process.env.ACCOUNTING_REPORT_CHAT_ID||'');
 if(!m)return false;
 const chat=String(m.chat.id),text=String(m.text||'').slice(0,4096),command=managementCommand(text);
 const config=await db().from('dream_accounting_management_room').select('*').eq('id',true).maybeSingle();
 if(config.error)throw Error('Management room lookup failed');
 const bound=config.data?.chat_id===chat;
 if(!bound&&command?.action!=='link')return false;
 const member=await tg('getChatMember',{chat_id:staff,user_id:m.from.id});
 if(!managementAdmin(member.status))return true;
 const local=await tg('getChatMember',{chat_id:chat,user_id:m.from.id});
 if(!managementAdmin(local.status))return true;
 if(!bound&&config.data)return true; // An existing destination cannot be replaced by a chat command.
 if(!bound){
  const registered=await db().from('dream_accounting_management_room').insert({id:true,chat_id:chat,title:String(m.chat.title||'Dream Bot 관리실'),linked_by:String(m.from.id)});
  if(registered.error&&registered.error.code!=='23505')throw Error('Management room registration failed');
  const confirmed=await db().from('dream_accounting_management_room').select('chat_id').eq('id',true).single();
  if(confirmed.error)throw Error('Management room registration readback failed');
  if(confirmed.data.chat_id!==chat)return true;
 }
 const owner=randomUUID();
 const lock=await db().rpc('dream_accounting_acquire',{p_owner:owner});
 if(lock.error||!lock.data)throw Error('Accounting is busy; retry management update');
 try{
  const existing=await db().from('dream_accounting_management_jobs').select('*').eq('update_id',update.update_id).maybeSingle();
  if(existing.error)throw Error('Management request lookup failed');
  if(['sending','sent','uncertain'].includes(existing.data?.status))return true;
  if(!existing.data){
   const inserted=await db().from('dream_accounting_management_jobs').insert({update_id:update.update_id,chat_id:chat,message_id:m.message_id,sender_id:String(m.from.id),source_text:text});
   if(inserted.error)throw Error('Management request persistence failed');
  }
  let response=existing.data?.response||'',ruleId=existing.data?.rule_id||null;
  if(existing.data?.status!=='done'){
   const saved=await db().from('dream_accounting_rules').select('id,kind,content').eq('active',true).order('id');
   if(saved.error)throw Error('Business rule lookup failed');
   const rules=saved.data||[];
   let request:any=command?.action==='list'?{action:'list'}:command?.action==='delete'?command:null;
   if(command?.action==='link'||command?.action==='help')response=managementHelp;
   else if(m.photo||m.document)response='관리실의 사진은 실제 정산에 입력하지 않았어요. 확인할 오류와 앞으로 적용할 규칙을 글로 보내주세요.';
   else{
    if(!request){
     const result=await extract(text,undefined,{businessRules:rules,managementRoom:true,players:[],games:[],businessDate:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Ho_Chi_Minh'})});
     request=result.memory;
     if(!request)response=result.question||'이 방에서는 실제 바이인·F&B 입력을 처리하지 않아요. 저장할 규칙을 “앞으로 …”처럼 알려주세요.';
    }
    if(request){
     let rule:any;try{rule=validateMemory(request);}catch(e){response=e instanceof Error?e.message:'규칙 내용을 확인해주세요.';}
     if(rule?.action==='list')response=ruleList(rules);
     if(rule?.action==='delete'){
      const removed=await db().from('dream_accounting_rules').update({active:false}).eq('id',rule.id).eq('active',true).select('id');
      if(removed.error)throw Error('Business rule removal failed');
      const check=await db().from('dream_accounting_rules').select('id').eq('id',rule.id).eq('active',true);
      if(check.error||check.data?.length)throw Error('Business rule removal readback failed');
      response=removed.data?.length?rule.id+'번 규칙을 삭제했어요.':'활성화된 규칙이 없는 번호예요.';ruleId=rule.id;
     }
     if(rule?.action==='save'){
      const duplicate=rules.find(r=>r.content===rule.content);
      const conflicting=rules.find(r=>r.kind==='table_round_labels'&&rule.kind==='table_round_labels'&&r.content!==rule.content);
      if(conflicting)response=conflicting.id+'번에 기존 테이블 표기 규칙이 있어요. 변경하려면 해당 규칙을 먼저 삭제해주세요.';
      else if(!duplicate&&rules.length>=50)response='저장된 규칙이 50개예요. 오래된 규칙을 먼저 삭제해주세요.';
      else{
       let value=duplicate;
       if(!value){
        const written=await db().from('dream_accounting_rules').upsert({kind:rule.kind,content:rule.content,source_text:text,source_update:update.update_id,sender_id:String(m.from.id)},{onConflict:'source_update'}).select('id,kind,content').single();
        if(written.error)throw Error('Business rule save failed');value=written.data;
       }
       const check=await db().from('dream_accounting_rules').select('id,kind,content').eq('id',value!.id).eq('active',true).single();
       if(check.error||check.data.content!==rule.content||check.data.kind!==rule.kind)throw Error('Business rule save readback failed');
       ruleId=check.data.id;response=memoryReceipt(check.data.content,!!duplicate)+'\n규칙 번호: '+ruleId+'\n직원방 정산에 공통 적용합니다. 기존 영수증은 재입력하지 않았어요.';
      }
     }
    }
   }
   const done=await db().from('dream_accounting_management_jobs').update({status:'done',response,rule_id:ruleId}).eq('update_id',update.update_id);
   if(done.error)throw Error('Management result persistence failed');
  }
  // Record a send attempt first: an uncertain Telegram delivery is never blindly replayed.
  const sending=await db().from('dream_accounting_management_jobs').update({status:'sending'}).eq('update_id',update.update_id);
  if(sending.error)throw Error('Management delivery persistence failed');
  try{
   const sent=await tg('sendMessage',{chat_id:chat,text:response.slice(0,4000),reply_parameters:{message_id:m.message_id,allow_sending_without_reply:true}});
   const receipt=await db().from('dream_accounting_management_jobs').update({status:'sent',reply_id:sent.message_id}).eq('update_id',update.update_id);
   if(receipt.error)throw Error('Management delivery readback failed');
  }catch{
   await db().from('dream_accounting_management_jobs').update({status:'uncertain'}).eq('update_id',update.update_id);
  }
  return true;
 }finally{await db().rpc('dream_accounting_release',{p_owner:owner});}
}
