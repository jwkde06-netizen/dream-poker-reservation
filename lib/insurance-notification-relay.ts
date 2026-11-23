import {timingSafeEqual} from 'node:crypto';

const dreamStore = '108bedf9-cba7-4783-8573-57e6242a02e6';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Config = {secret?:string; botToken?:string; staffChatId?:string};
type TelegramError = {status:number; code:number; retry_after?:number};

export function createInsuranceRelay(config:Config, fetcher:typeof fetch=fetch) {
  const json=(status:number,body:unknown)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
  async function telegram(method:string,body:Record<string,unknown>) {
    const response=await fetcher(`https://api.telegram.org/bot${config.botToken}/${method}`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
      signal:AbortSignal.timeout(8000),redirect:'error',cache:'no-store'
    });
    const result=await response.json();
    if(!response.ok||result.ok!==true) {
      if(result.ok!==false)throw Error('DELIVERY_UNKNOWN');
      throw {status:response.status,code:Number(result.error_code)||response.status,
        retry_after:result.parameters?.retry_after} satisfies TelegramError;
    }
    return result.result;
  }
  return async (request:Request):Promise<Response>=>{
    if(request.method!=='POST')return json(405,{ok:false,error_code:405});
    const supplied=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
    if(!config.secret||! /^[0-9a-f]{64}$/.test(config.secret))return json(503,{ok:false,error_code:503});
    if(! /^[0-9a-f]{64}$/.test(supplied)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(config.secret)))
      return json(401,{ok:false,error_code:401});
    if(!config.botToken||!config.staffChatId||!/^-[0-9]+$/.test(config.staffChatId))
      return json(503,{ok:false,error_code:503});
    let input;
    try {
      const raw=await request.text();
      if(raw.length>8000)return json(413,{ok:false,error_code:413});
      input=JSON.parse(raw);
    }catch{return json(400,{ok:false,error_code:400});}
    if(!input||input.store_id!==dreamStore)return json(403,{ok:false,error_code:403});
    try {
      if(input.operation==='probe') {
        const [bot,chat]=await Promise.all([telegram('getMe',{}),telegram('getChat',{chat_id:config.staffChatId})]);
        const member=await telegram('getChatMember',{chat_id:config.staffChatId,user_id:bot.id});
        const canSend=['administrator','creator'].includes(member.status)||
          (member.status==='member'&&chat.permissions?.can_send_messages!==false)||
          (member.status==='restricted'&&member.is_member&&member.can_send_messages===true);
        return json(200,{ok:true,chat_id:String(chat.id),title:chat.title,type:chat.type,
          bot_username:bot.username,can_send:canSend});
      }
      if(input.operation!=='send'||!uuid.test(String(input.event_id))||typeof input.text!=='string'||
        input.text.length>3500||! /^(보험 정산 저장|보험 정산 무효 처리|\[보험 알림 연결 테스트\])\n/.test(input.text))
        return json(400,{ok:false,error_code:400});
      // The destination always comes from the existing server configuration, never the request.
      const sent=await telegram('sendMessage',{chat_id:config.staffChatId,text:input.text,disable_web_page_preview:true});
      if(!Number.isSafeInteger(sent?.message_id))throw Error('DELIVERY_UNKNOWN');
      return json(200,{ok:true,result:{message_id:sent.message_id}});
    }catch(error) {
      const known=error as TelegramError;
      if(Number.isInteger(known.code))return json(known.status>=400&&known.status<=599?known.status:502,
        {ok:false,error_code:known.code,...(known.retry_after?{parameters:{retry_after:known.retry_after}}:{})});
      // Do not claim a failed send when a timeout could follow successful Telegram delivery.
      return json(502,{error:'DELIVERY_UNKNOWN'});
    }
  };
}
