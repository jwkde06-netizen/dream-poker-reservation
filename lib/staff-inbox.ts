import {createClient} from "@supabase/supabase-js";
import {projectUrl} from "./telegram";

// Group membership is the initial staff boundary. Bots and anonymous senders
// cannot issue work. Edited messages are retained as separate review requests.
export function staffMessage(update:any, configuredChat:string){
 const m=update?.message||update?.edited_message;
 if(!m||!configuredChat||String(m.chat?.id)!==configuredChat)return null;
 if(!["group","supergroup"].includes(m.chat?.type)||!m.from?.id||m.from.is_bot||m.sender_chat)return null;
 if(!Number.isSafeInteger(update.update_id)||!Number.isSafeInteger(m.message_id))return null;
 const text=String(m.text||m.caption||"").slice(0,4096);
 const photos=Array.isArray(m.photo)?m.photo:[];
 const photo=photos.filter((p:any)=>typeof p.file_id==="string")
  .sort((a:any,b:any)=>(b.width||0)*(b.height||0)-(a.width||0)*(a.height||0))[0];
 const document=m.document;
 const image=document&&["image/jpeg","image/png","image/webp"].includes(document.mime_type)?document:null;
 if(!text&&!photo&&!image)return null;
 return {update_id:update.update_id,chat_id:configuredChat,message_id:m.message_id,
  sender_id:String(m.from.id),sender_name:[m.from.first_name,m.from.last_name].filter(Boolean).join(" ").slice(0,256),
  text,image_file_id:photo?.file_id||image?.file_id||null,
  image_mime:photo?"image/jpeg":image?.mime_type||null,
  media_group_id:m.media_group_id?String(m.media_group_id):null,
  reply_to_message_id:m.reply_to_message?.message_id||null,
  is_edit:!!update.edited_message,status:update.edited_message?"needs_review":"received"};
}

export async function receiveStaffMessage(update:unknown){
 if(process.env.STAFF_INBOX_ENABLED!=="true")return;
 const chat=process.env.STAFF_TELEGRAM_CHAT_ID||"";
 if(!chat)throw new Error("Staff chat is not configured");
 const row=staffMessage(update,chat);
 if(!row)return;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key)throw new Error("Inbox storage is not configured");
 const db=createClient(projectUrl,key,{auth:{persistSession:false}});
 // Duplicate delivery must never reset a completed request or repeat a write.
 const {error}=await db.from("staff_message_inbox").upsert(row,{onConflict:"update_id",ignoreDuplicates:true});
 if(error)throw new Error("Inbox persistence failed");
}
