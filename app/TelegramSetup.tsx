"use client";
import {useState} from "react";
import {db} from "../lib/db";
type Group={id:string;title:string;type:string};
export default function TelegramSetup({lang="ko"}:{lang?:"ko"|"en"|"vi"}){
 const tr=(ko:string,en:string,vi:string)=>lang==="ko"?ko:lang==="en"?en:vi;
 const [groups,setGroups]=useState<Group[]>([]),[selected,setSelected]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState<{kind:"login"|"choose"|"empty"|"sent"|"error";title?:string}|null>(null);
 async function call(method:"GET"|"POST"){
 if(!db)return;
 setBusy(true);setMessage(null);
 const {data:{session}}=await db.auth.getSession();
 if(!session){setMessage({kind:"login"});setBusy(false);return}
 try{
 const response=await fetch("/api/telegram",{method,headers:{Authorization:"Bearer "+session.access_token,...(method==="POST"?{"Content-Type":"application/json"}:{})},body:method==="POST"?JSON.stringify({chat_id:selected}):undefined});
 const body=await response.json();
 if(!response.ok)throw new Error(body.error||"연결 오류");
 if(method==="GET"){setGroups(body.groups||[]);setSelected(body.groups?.[0]?.id||"");setMessage({kind:body.groups?.length?"choose":"empty"})}
 else setMessage({kind:"sent",title:body.title});
 }catch(e){setMessage({kind:"error"})}finally{setBusy(false)}
 }
 const messageText=message?{
 login:tr('관리자 로그인이 필요합니다.','Admin login required.','Cần đăng nhập quản trị.'),
 choose:tr('그룹을 선택하고 테스트 메시지를 보내세요.','Select a group and send a test message.','Chọn nhóm rồi gửi tin nhắn thử.'),
 empty:tr('수신한 그룹 기록이 없습니다. 그룹에서 봇에게 /start를 보내고 다시 검색하세요.','No groups found. Send /start to the bot in your group, then search again.','Chưa tìm thấy nhóm. Gửi /start cho bot trong nhóm rồi tìm lại.'),
 sent:tr('테스트 메시지를 보냈습니다. 예약 알림 그룹을 저장했습니다.','Test message sent. The reservation notification group is saved.','Đã gửi tin nhắn thử và lưu nhóm thông báo đặt chỗ.')+' '+(message.title||''),
 error:tr('연결하지 못했습니다. 잠시 후 다시 시도하세요.','Could not connect. Please try again.','Không thể kết nối. Vui lòng thử lại.')
 }[message.kind]:'';
 return <section className="panel"><h2>{tr("텔레그램 연결 (관리자)","Telegram connection (admin)","Kết nối Telegram (quản trị)")}</h2><p className="muted">{tr("봇 토큰은 서버에만 저장됩니다. 그룹을 찾고 테스트 메시지를 보내면 그룹이 자동으로 저장됩니다.","The bot token stays on the server. Find a group and send a test message to save it.","Token bot chỉ lưu trên máy chủ. Tìm nhóm và gửi thử để lưu tự động.")}</p><div className="telegramSetup"><button className="outline" disabled={busy} onClick={()=>void call("GET")}>{tr("① 텔레그램 그룹 찾기","① Find Telegram groups","① Tìm nhóm Telegram")}</button><select aria-label={tr("텔레그램 그룹","Telegram group","Nhóm Telegram")} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">{tr("그룹 선택","Select group","Chọn nhóm")}</option>{groups.map(g=><option value={g.id} key={g.id}>{g.title} ({g.id})</option>)}</select><button className="primary" disabled={busy||!selected} onClick={()=>void call("POST")}>{tr("② 테스트 메시지 전송","② Send test message","② Gửi tin nhắn thử")}</button></div>{message&&<p className="memberNotice" role="status">{messageText}</p>}</section>
}
