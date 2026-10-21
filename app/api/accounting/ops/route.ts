import {deskCommands} from '../../../../lib/accounting-conversation';
import {jobReport,defaultAgency,completeNamedArrival} from '../../../../lib/accounting-workflow';
import {needsChipVerification,verifyChipEvidence} from '../../../../lib/accounting-vision';
import {reconcileSheet,reconcileOperation} from '../../../../lib/accounting-reconcile';
import {sheetContext,correctedOperations,focusedQuestion,certainOperations} from '../../../../lib/accounting-context';
import {planOperations} from '../../../../lib/accounting-plan';
import {auditCases,auditDaily,auditMaster} from '../../../../lib/accounting-regressions';
import {continuationText,registrationApprovals,rebuyCaption} from '../../../../lib/accounting-followup';
import {NextResponse} from 'next/server';
import {authorized,db,extract,ranges,handle,reconciliationHistory,readChipColumns} from '../../../../lib/accounting-agent';
import {tg} from '../../../../lib/telegram';
import {accessToken,accountingWorkbook} from '../../../../lib/accounting-google';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=180;
const url='https://dream-poker-reservation.vercel.app/api/accounting/webhook';
export async function POST(request:Request){
 if(!authorized(request,'ACCOUNTING_OPS_SECRET'))return NextResponse.json({error:'Unauthorized'},{status:401});
 try{
  const {action,messageId,caseName,imageData,caption}=await request.json();
  if(action==='healthReport'){
   const q=await db().from('dream_accounting_jobs').select('message_id,text,status,plan,reply_text,reply_id').gte('created_at',new Date(Date.now()-24*3600000).toISOString()).order('created_at',{ascending:false}).limit(500);
   if(q.error)throw Error('Health data unavailable');return NextResponse.json({...jobReport(q.data||[]),business_rows_changed:false});
  }
  if(action==='visionColumns'){
   if(typeof imageData!=='string'||imageData.length>4000000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(imageData))throw Error('Invalid image fixture');
   return NextResponse.json({evidence:await readChipColumns(imageData),business_rows_changed:false,telegram_messages_sent:false});
  }
  if(action==='arrivalAudit'){
   if(!Number.isSafeInteger(messageId))throw Error('Invalid message');
   const q=await db().from('dream_accounting_jobs').select('text,plan,source_message').eq('message_id',messageId).order('update_id',{ascending:true}).limit(1).single();if(q.error)throw Error('Source unavailable');
   const [daily,fnb,master]=await ranges(["'일일 입력'!A1:O5000","'F&B 입력'!A1:D2000","'플레이어 명단'!A1:D2500"],true);
   const rules=await db().from('dream_accounting_rules').select('id,kind,content').eq('active',true).order('id');if(rules.error)throw Error('Rules unavailable');
   const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(q.data.source_message.date*1000));
   const operations=completeNamedArrival([],q.data.text,daily,master,rules.data||[],date,q.data);
   const plan=operations.length?planOperations(operations,daily,fnb,master,{tableRoundLabels:true,registrationApprovals:registrationApprovals(operations,q.data.text,master,q.data.plan?.pendingQuestion||'',rules.data||[])}):null;
   return NextResponse.json({operations,changes:plan?.changes||[],business_rows_changed:false,telegram_messages_sent:false});
  }
  if(action==='resumeRegistration'){
   if(!Number.isSafeInteger(messageId))throw Error('Invalid message');
   const q=await db().from('dream_accounting_jobs').select('*').eq('message_id',messageId).order('update_id',{ascending:true}).limit(1).single();
   const j=q.data,ops=j?.plan?.operations;
   if(q.error||j?.status!=='applied'||!j.plan?.pendingQuestion||!Array.isArray(ops)||!ops.length||ops.some((o:any)=>o.kind!=='register')||!/소속|agency|코드/.test(j.plan.pendingQuestion)||!j.source_message?.date||!/^\d+$/.test(j.sender_id))throw Error('Only an incomplete named registration can resume');
   const snapshot={status:j.status,plan:j.plan,reply_text:j.reply_text,reply_id:j.reply_id};
   const reset=await db().from('dream_accounting_jobs').update({status:'received',reply_text:null,reply_id:null}).eq('update_id',j.update_id).eq('status','applied').select('update_id');
   if(reset.error||reset.data?.length!==1)throw Error('Job changed');
   await handle({update_id:j.update_id,message:{message_id:j.message_id,date:j.source_message.date,text:j.text,from:{id:Number(j.sender_id),is_bot:false},chat:{id:Number(process.env.STAFF_TELEGRAM_CHAT_ID),type:'group'}}});
   const after=await db().from('dream_accounting_jobs').select('status,plan,reply_text,reply_id').eq('update_id',j.update_id).single();
   if(after.error)throw Error('Recovery readback failed');
   const audit=await db().from('dream_accounting_jobs').update({plan:{...after.data.plan,recoveredFrom:snapshot}}).eq('update_id',j.update_id);
   if(audit.error)throw Error('Recovery audit save failed');
   return NextResponse.json(after.data);
  }
  if(action==='reconciliationAudit'){
   const [daily,fnb,master]=await ranges(["'일일 입력'!A1:O5000","'F&B 입력'!A1:D2000","'플레이어 명단'!A1:D2500"],true);
   const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   const history=await reconciliationHistory(date),state=reconcileSheet(daily,date,history);
   const job=Number.isSafeInteger(messageId)?history.find(j=>j.message_id===messageId):null;
   const operations=job?.plan?.operations||[];
   const plan=operations.length?planOperations(operations,daily,fnb,master,{tableRoundLabels:true,photoSnapshot:true,reconcile:op=>reconcileOperation(op,{state,sourceMessageId:job?.plan?.photoSourceMessageId||job?.message_id,sourceTime:job?.source_message?.date,photo:true,text:''})}):null;
   return NextResponse.json({state,sourceMessageId:job?.message_id||null,plannedChanges:plan?.changes.length||0,review:plan?.review||[],business_rows_changed:false,telegram_messages_sent:false});
  }
  if(action==='dryrunImage'){
   if(typeof imageData!=='string'||imageData.length>4000000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(imageData)||typeof caption!=='string'||caption.length>1000)throw Error('Invalid read-only image fixture');
   const [daily,fnb,master]=await ranges(["'일일 입력'!A1:O5000","'F&B 입력'!A1:D2000","'플레이어 명단'!A1:D2500"],true);
   const rules=await db().from('dream_accounting_rules').select('id,kind,content').eq('active',true).order('id');if(rules.error)throw Error('Rules unavailable');
   const businessDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   if(caseName==='rebuy_chang_before'){let game:any=null;for(const r of daily){if(r[0]!==''&&r[0]!=null)game=r[0];if(Number(game)===6&&Number(r[1])===46316&&r[4]==='CHANG YOON HO')r[7]=1;}}
   const result=await extract(caption+'\n읽기 전용 판독 검증입니다. 사진에서 대상 선수와 게임을 모두 operations로 추출해주세요. 이미 시트에 있는 항목도 추출하세요. 중복 판단은 별도 검증기가 수행하며 실제 입력은 하지 않습니다.',imageData,{...sheetContext(daily,master,businessDate),businessRules:rules.data});
   let operations=correctedOperations(result.operations,caption,master,rules.data||[]);
   result.question=focusedQuestion(result.question,caption,operations);
   operations=certainOperations(operations,result.question);
   let chipVerification:any=null;
   if(result.documentType==='paper_game'&&needsChipVerification(operations,daily)){
    const evidence=await readChipColumns(imageData);const verified=verifyChipEvidence(operations,evidence,rules.data||[]);
    chipVerification={...evidence,questions:verified.questions};operations=verified.operations;result.question=verified.questions[0]||result.question;
   }
   const plan=operations.length?planOperations(operations,daily,fnb,master,{tableRoundLabels:true,photoSnapshot:true,rebuySnapshot:rebuyCaption(caption)}):null;
   return NextResponse.json({model:result._model,usage:result._usage,chipVerification,question:result.question||null,operations,plannedChanges:plan?.changes.length||0,business_rows_changed:false,telegram_messages_sent:false});
  }
  if(action==='auditCase'){
   const fixture=auditCases[String(caseName)];if(!fixture)throw Error('Unknown audit case');
   const evidence=continuationText(fixture.text,fixture.previous||null);
   const result=await extract(fixture.text,undefined,{...sheetContext(auditDaily,auditMaster,'2026-10-21'),businessRules:fixture.rules||[],previous:fixture.previous||null,pendingRequest:fixture.previous?{...fixture.previous,continuationText:evidence}:null});
   const operations=correctedOperations(result.operations,fixture.text,auditMaster);
   const plan=operations.length?planOperations(operations,auditDaily,[],auditMaster,{tableRoundLabels:true,rebuySnapshot:rebuyCaption(evidence),registrationApprovals:registrationApprovals(operations,evidence,auditMaster,fixture.previous?.plan?.pendingQuestion||'')}):null;
   return NextResponse.json({caseName,model:result._model,usage:result._usage,expected:fixture.expected,question:result.question||null,operations,changes:plan?.changes||[],business_rows_changed:false,telegram_messages_sent:false});
  }
  if(action==='notifyApplied'){
   if(!Number.isSafeInteger(messageId))throw Error('Invalid message');
   const q=await db().from('dream_accounting_jobs').select('*').eq('message_id',messageId).single();
   if(q.error||q.data.status!=='applied'||!q.data.reply_text)throw Error('Applied result required');
   if(q.data.reply_id)return NextResponse.json({sent:true,messageId:q.data.reply_id});
   const sent=await tg('sendMessage',{chat_id:process.env.STAFF_TELEGRAM_CHAT_ID,reply_parameters:{message_id:messageId},text:q.data.reply_text.slice(0,4000)});
   const saved=await db().from('dream_accounting_jobs').update({reply_id:sent.message_id}).eq('update_id',q.data.update_id);
   if(saved.error)throw Error('Notification sent; persistence failed');
   return NextResponse.json({sent:true,messageId:sent.message_id});
  }
  if(action==='dryrunphoto'){
   if(!Number.isSafeInteger(messageId))throw Error('Invalid message');
   const q=await db().from('dream_accounting_jobs').select('text,source_message').eq('message_id',messageId).order('update_id',{ascending:false}).limit(1).single();
   if(q.error||!q.data?.source_message)throw Error('Saved photo unavailable');
   const m=q.data.source_message,photo=m.photo?.[m.photo.length-1]||m.document;if(!photo)throw Error('Saved photo unavailable');
   const f=await tg('getFile',{file_id:photo.file_id});if(!/^[\w/.-]+$/.test(f.file_path)||f.file_path.includes('..'))throw Error('Invalid path');
   const response=await fetch('https://api.telegram.org/file/bot'+process.env.TELEGRAM_BOT_TOKEN+'/'+f.file_path,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Photo download failed');
   const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>10000000)throw Error('Photo too large');
   const [daily,fnb,master]=await ranges(["'일일 입력'!A1:O5000","'F&B 입력'!A1:D2000","'플레이어 명단'!A1:D2500"],true);
   const rules=await db().from('dream_accounting_rules').select('id,kind,content').eq('active',true).order('id');if(rules.error)throw Error('Rules unavailable');
   const businessDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(m.date*1000));
   const result=await extract(q.data.text+'\n읽기 전용 판독 검증입니다. 사진에서 대상 선수와 게임을 모두 operations로 추출해주세요. 이미 시트에 있는 항목도 추출하세요. 중복 판단은 별도 검증기가 수행하며 실제 입력은 하지 않습니다.','data:image/jpeg;base64,'+bytes.toString('base64'),{...sheetContext(daily,master,businessDate),businessRules:rules.data});
   let operations=correctedOperations(result.operations,q.data.text,master,rules.data||[]);
   result.question=focusedQuestion(result.question,q.data.text,operations);
   operations=certainOperations(operations,result.question);
   const plan=operations.length?planOperations(operations,daily,fnb,master,{tableRoundLabels:true,photoSnapshot:true,rebuySnapshot:rebuyCaption(q.data.text)}):null;
   return NextResponse.json({business_rows_changed:false,telegram_messages_sent:false,model:result._model,usage:result._usage,question:result.question||null,operations,plannedChanges:plan?.changes.length||0});
  }
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
  if(action==='installDeskCommands'){
   const scope={type:'chat',chat_id:process.env.STAFF_TELEGRAM_CHAT_ID};
   if(String(scope.chat_id)!=='-5322020390')throw Error('Wrong staff group');
   await tg('setMyCommands',{scope,commands:deskCommands});
   const commands=await tg('getMyCommands',{scope});
   if(JSON.stringify(commands)!==JSON.stringify(deskCommands))throw Error('Command verification failed');
   return NextResponse.json({commands,chat_id:scope.chat_id});
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
