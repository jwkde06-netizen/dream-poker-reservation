import {NextResponse} from 'next/server';
import {authorized,db,extract,ranges,handle} from '../../../../lib/accounting-agent';
import {tg} from '../../../../lib/telegram';
import {accessToken,accountingWorkbook} from '../../../../lib/accounting-google';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=180;
const url='https://dream-poker-reservation.vercel.app/api/accounting/webhook';
export async function POST(request:Request){
 if(!authorized(request,'ACCOUNTING_OPS_SECRET'))return NextResponse.json({error:'Unauthorized'},{status:401});
 try{
  const {action,messageId}=await request.json();
  if(action==='reviewphoto'||action==='retryphoto'){
   if(!Number.isSafeInteger(messageId))throw Error('Invalid message');
   const q=await db().from('dream_accounting_jobs').select('*').eq('message_id',messageId).single();
   if(q.error||q.data.status!=='review')throw Error('Only pending review photos can be recovered');
   const sent=await tg('sendMessage',{chat_id:process.env.STAFF_TELEGRAM_CHAT_ID,reply_parameters:{message_id:messageId},text:action==='reviewphoto'?'사진 명단을 다시 확인하고 있습니다. 추가 설명 없이 기존 선수 코드와 대조하겠습니다.':'확인한 사진을 정산 시트와 대조해 반영하겠습니다.'});
   const m=sent.reply_to_message;if(!m||String(m.chat?.id)!==process.env.STAFF_TELEGRAM_CHAT_ID||String(m.from?.id)!==q.data.sender_id)throw Error('Original message unavailable');
   const photo=m.photo?.[m.photo.length-1];if(!photo)throw Error('Original photo unavailable');
   if(action==='retryphoto'){
    const changed=await db().from('dream_accounting_jobs').update({status:'received',reply_text:null,reply_id:null}).eq('update_id',q.data.update_id).eq('status','review').select('update_id');
    if(changed.error||changed.data?.length!==1)throw Error('Review status changed');
    await handle({update_id:q.data.update_id,message:m});
    const result=await db().from('dream_accounting_jobs').select('status,plan,reply_text,failure_reason').eq('update_id',q.data.update_id).single();return NextResponse.json(result.data);
   }
   const f=await tg('getFile',{file_id:photo.file_id});if(!/^[\w/.-]+$/.test(f.file_path)||f.file_path.includes('..'))throw Error('Invalid photo path');
   const r=await fetch('https://api.telegram.org/file/bot'+process.env.TELEGRAM_BOT_TOKEN+'/'+f.file_path);if(!r.ok)throw Error('Photo download failed');
   return NextResponse.json({image:Buffer.from(await r.arrayBuffer()).toString('base64'),messageId});
  }
  if(action==='renameBuyinDesk'){
   const me=await tg('getMe');if(me.username!=='dream_poker_reservation_bot')throw Error('Wrong bot');
   const name='Dream Buy-in Desk';
   for(const language_code of ['', 'en', 'ko', 'vi'])await tg('setMyName',{name,language_code});
   const verified=await tg('getMyName',{});
   if(verified.name!==name)throw Error('Name verification failed');
   return NextResponse.json({name:verified.name,username:me.username});
  }
  if(action==='inspect'){
   const me=await tg('getMe'),chat=await tg('getChat',{chat_id:process.env.STAFF_TELEGRAM_CHAT_ID}),member=await tg('getChatMember',{chat_id:chat.id,user_id:me.id}),hook=await tg('getWebhookInfo');
   const data=await ranges(["'일일 입력'!A1:O2","'F&B 입력'!A1:D1"],true);
   const q=await db().from('dream_accounting_jobs').select('update_id',{head:true,count:'exact'});
   return NextResponse.json({bot:me.username,chat:{id:chat.id,title:chat.title},visibility:member.status==='administrator'||me.can_read_all_group_messages===true,member_status:member.status,webhook:hook,google_headers:data[0]?.[0],google_formulas:[5,6,8,9,10,11,12,13,14].every(i=>String(data[0]?.[1]?.[i]||'').startsWith('=ARRAYFORMULA(')),database:!q.error,enabled:process.env.ACCOUNTING_ENABLED==='true'});
  }
  if(action==='sheettest'){
   const token=await accessToken();
   const call=async(body:unknown)=>{const r=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+accountingWorkbook+':batchUpdate',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error('Test sheet request failed '+r.status);return r.json()};
   const title='_Dream_Agent_Test_'+Date.now();const created=await call({requests:[{addSheet:{properties:{title,hidden:true}}}]});const id=created.replies[0].addSheet.properties.sheetId;
   try{
    await call({requests:[{updateCells:{range:{sheetId:id,startRowIndex:0,endRowIndex:1,startColumnIndex:0,endColumnIndex:2},rows:[{values:[{userEnteredValue:{stringValue:'ACCOUNTING_TEST'}},{userEnteredValue:{numberValue:150000}}]}],fields:'userEnteredValue'}}]});
    const values=await ranges(["'"+title+"'!A1:B1"]);if(values[0]?.[0]?.[0]!=='ACCOUNTING_TEST'||values[0]?.[0]?.[1]!==150000)throw Error('Test readback failed');
    return NextResponse.json({sheet_write_readback:true,business_rows_changed:false});
   }finally{await call({requests:[{deleteSheet:{sheetId:id}}]});}
  }
  if(action==='memorytest'){
   const rules=await db().from('dream_accounting_rules').select('id,kind,content').eq('active',true).order('id');if(rules.error)throw Error('Rules read failed');
   const result=await extract('앞으로 층 정보는 F&B에서만 확인하고 게임 정산에서는 묻지 마. 업무 규칙으로 기억해줘.',undefined,{businessRules:rules.data});
   return NextResponse.json({rules:rules.data,classification:result,business_rows_changed:false});
  }
  if(action==='modeltest'){const result=await extract('2026-10-21 3층 대표님 말차라떼 2잔 총 150000동 F&B 추가',undefined,{});return NextResponse.json({result});}
  if(action==='connect'){
   const me=await tg('getMe');if(me.username!=='dream_poker_reservation_bot')throw Error('Wrong bot');
   const chat=await tg('getChat',{chat_id:process.env.STAFF_TELEGRAM_CHAT_ID});if(String(chat.id)!=='-5322020390'||!['group','supergroup'].includes(chat.type))throw Error('Wrong group');
   const member=await tg('getChatMember',{chat_id:chat.id,user_id:me.id});if(member.status!=='administrator'&&me.can_read_all_group_messages!==true)throw Error('Bot needs group message visibility');
   const hook=await tg('getWebhookInfo');if(hook.url&&hook.url!==url)throw Error('Existing webhook must be preserved: '+hook.url);
   if(process.env.ACCOUNTING_ENABLED!=='true')throw Error('Agent not enabled');
   await tg('setWebhook',{url,secret_token:process.env.TELEGRAM_WEBHOOK_SECRET,allowed_updates:['message','edited_message','callback_query'],drop_pending_updates:false,max_connections:1});
   const verified=await tg('getWebhookInfo');return NextResponse.json({connected:verified.url===url,webhook:verified});
  }
  return NextResponse.json({error:'Unknown action'},{status:400});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Operation failed'},{status:503});}
}
