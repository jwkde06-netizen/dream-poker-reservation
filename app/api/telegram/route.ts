import {NextResponse} from "next/server";
import {requireAdmin,tg} from "../../../lib/telegram";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 if(!await requireAdmin(request))return NextResponse.json({error:"Admin login required"},{status:403});
 try{
 const updates=await tg("getUpdates",{limit:100,timeout:0,allowed_updates:["message","my_chat_member"]});
 const map=new Map<string,{id:string,title:string,type:string}>();
 for(const update of updates){
 const chat=update.message?.chat||update.my_chat_member?.chat;
 if(chat&&["group","supergroup"].includes(chat.type))map.set(String(chat.id),{id:String(chat.id),title:chat.title||"Group",type:chat.type});
 }
 return NextResponse.json({groups:[...map.values()],count:updates.length});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Telegram connection failed"},{status:502})}
}
export async function POST(request:Request){
 if(!await requireAdmin(request))return NextResponse.json({error:"Admin login required"},{status:403});
 try{
 const body=await request.json();
 const id=String(body.chat_id||"");
 if(!/^-?\d{5,22}$/.test(id))return NextResponse.json({error:"Invalid chat ID"},{status:400});
 const chat=await tg("getChat",{chat_id:id});
 if(!["group","supergroup"].includes(chat.type))return NextResponse.json({error:"Group required"},{status:400});
 const msg=await tg("sendMessage",{chat_id:id,text:"♠ Dream Poker 예약 알림 연결 테스트\n텔레그램 그룹 연결이 정상입니다."});
 return NextResponse.json({ok:true,chat_id:id,title:chat.title,message_id:msg.message_id});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Telegram test failed"},{status:502})}
}
