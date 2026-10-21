import {NextResponse} from 'next/server';
import {requireAdmin} from '../../../../lib/telegram';
import {agentConfig,agentOrigin,agentRoles,missingAgentSettings,secureEqual,validAgentRole, type AgentConfig} from '../../../../lib/agent-config';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
async function authorized(request: Request) {
  const bearer=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if (secureEqual(bearer,process.env.AGENT_OPS_SECRET||process.env.ACCOUNTING_OPS_SECRET||'')) return true;
  return Boolean(await requireAdmin(request));
}
async function call(config: AgentConfig,method: string,payload: Record<string,unknown>={}) {
  if (!config.token) throw Error('봇 토큰이 아직 설정되지 않았습니다.');
  const response=await fetch(`https://api.telegram.org/bot${config.token}/${method}`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store',signal:AbortSignal.timeout(12000),
  });
  const result=await response.json();
  if (!response.ok||!result.ok) throw Error(`Telegram ${method} 확인에 실패했습니다 (${response.status}).`);
  return result.result;
}
async function inspect(config: AgentConfig) {
  const base={role:config.role,name:config.name,mode:config.mode,enabled:config.enabled,chatId:config.chatId,missing:missingAgentSettings(config)};
  if (!config.token) return {...base,connected:false};
  try {
    const me=await call(config,'getMe');
    const [chat,member,hook]=await Promise.all([
      call(config,'getChat',{chat_id:config.chatId}),
      call(config,'getChatMember',{chat_id:config.chatId,user_id:me.id}),
      call(config,'getWebhookInfo'),
    ]);
    const expected=agentOrigin()+config.webhookPath;
    const visibility=member.status==='administrator'||me.can_read_all_group_messages===true;
    return {...base,bot:{id:String(me.id),username:me.username,name:me.first_name},chat:{id:String(chat.id),title:chat.title},
      visibility,memberStatus:member.status,connected:hook.url===expected,pendingUpdates:hook.pending_update_count||0,
      hasDeliveryError:Boolean(hook.last_error_date),webhookPath:config.webhookPath};
  } catch (error) { return {...base,connected:false,error:error instanceof Error?error.message:'연결 상태를 확인할 수 없습니다.'}; }
}
export async function GET(request: Request) {
  if (!await authorized(request)) return NextResponse.json({error:'관리자 로그인이 필요합니다.'},{status:403});
  return NextResponse.json({agents:await Promise.all(agentRoles.map(role=>inspect(agentConfig(role))))});
}
export async function POST(request: Request) {
  if (!await authorized(request)) return NextResponse.json({error:'관리자 로그인이 필요합니다.'},{status:403});
  try {
    const body=await request.json();
    if (body.action!=='connect'||!validAgentRole(body.role)) return NextResponse.json({error:'잘못된 연결 요청입니다.'},{status:400});
    if (process.env.VERCEL_ENV && process.env.VERCEL_ENV!=='production') throw Error('봇 연결 변경은 운영 배포에서만 가능합니다.');
    if (new URL(request.url).origin!==agentOrigin()) throw Error('운영 주소에서 연결을 진행해주세요.');
    const config=agentConfig(body.role),missing=missingAgentSettings(config);
    if (missing.length) throw Error('먼저 설정이 필요합니다: '+missing.join(', '));
    if (config.role==='reservations'&&config.mode==='shared_legacy') throw Error('회계 전용 봇으로 전환한 뒤 예약 봇을 연결해주세요.');
    const me=await call(config,'getMe');
    if (String(me.id)!==String(body.botId)) throw Error('봇 정보가 변경되었습니다. 연결 상태를 새로 확인해주세요.');
    if (agentRoles.some(role=>role!==config.role && agentConfig(role).token.split(':')[0]===config.token.split(':')[0])) throw Error('업무별로 서로 다른 봇 토큰을 설정해주세요.');
    const chat=await call(config,'getChat',{chat_id:config.chatId});
    if (String(chat.id)!==config.chatId||!['group','supergroup'].includes(chat.type)) throw Error('설정된 직원 업무방을 확인할 수 없습니다.');
    const member=await call(config,'getChatMember',{chat_id:config.chatId,user_id:me.id});
    if (!['member','administrator'].includes(member.status)) throw Error('이 봇을 해당 업무방에 먼저 추가해주세요.');
    if (member.status!=='administrator'&&me.can_read_all_group_messages!==true) throw Error('일반 채팅을 읽을 수 있는 봇 설정이 필요합니다.');
    const hook=await call(config,'getWebhookInfo'),url=agentOrigin()+config.webhookPath;
    const allowedPrevious=config.role==='reservations'?agentOrigin()+'/api/accounting/webhook':url;
    if (hook.url && hook.url!==url && hook.url!==allowedPrevious) throw Error('다른 서비스에 연결된 봇입니다. 기존 연결을 확인해주세요.');
    await call(config,'setWebhook',{url,secret_token:config.secret,allowed_updates:['message','edited_message','callback_query'],drop_pending_updates:false,max_connections:1});
    const verified=await call(config,'getWebhookInfo');
    if (verified.url!==url) throw Error('웹훅 연결 확인에 실패했습니다.');
    return NextResponse.json({ok:true,agent:await inspect(config)});
  } catch (error) {
    // Never return Telegram URLs, credentials, or arbitrary upstream response bodies.
    const message=error instanceof Error?error.message:'에이전트 연결에 실패했습니다.';
    return NextResponse.json({error:message.replace(/\d{6,}:[A-Za-z0-9_-]{20,}/g,'[redacted]')},{status:503});
  }
}
