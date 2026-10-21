"use client";
import {useState} from "react";
import {db} from "../lib/db";
type Group={id:string;title:string;type:string};
export default function TelegramSetup({lang="ko"}:{lang?:"ko"|"en"|"vi"}){
 const tr=(ko:string,en:string,vi:string)=>lang==="ko"?ko:lang==="en"?en:vi;
 const [groups,setGroups]=useState<Group[]>([]),[selected,setSelected]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 async function call(method:"GET"|"POST"){
 if(!db)return;
 setBusy(true);setMessage("");
 const {data:{session}}=await db.auth.getSession();
 if(!session){setMessage(tr("관리자 로그인이 필요합니다.","Admin login required.","Cần đăng nhập quản trị."));setBusy(false);return}
 try{
 const response=await fetch("/api/telegram",{method,headers:{Authorization:"Bearer "+session.access_token,...(method==="POST"?{"Content-Type":"application/json"}:{})},body:method==="POST"?JSON.stringify({chat_id:selected}):undefined});
 const body=await response.json();
 if(!response.ok)throw new Error(body.error||"연결 오류");
 if(method==="GET"){setGroups(body.groups||[]);setSelected(body.groups?.[0]?.id||"");setMessage(body.groups?.length?"그룹을 선택하고 테스트 메시지를 보내세요.":"아직 봇이 수신한 그룹 기록이 없습니다. 그룹에서 /start@봇아이디 를 보내고 다시 검색하세요.")}
 else setMessage("테스트 메시지 전송 성공! "+body.title+" 그룹이 자동 저장됐습니다. 이제 예약 알림이 이 그룹으로 전송됩니다.");
 }catch(e){setMessage(e instanceof Error?e.message:"Error")}finally{setBusy(false)}
 }
 async function accountingConnection(method:"GET"|"POST"){
  if(!db)return;
  setBusy(true);setMessage("");
  try{
   const {data:{session}}=await db.auth.getSession();
   if(!session)throw new Error(tr("관리자 로그인이 필요합니다.","Admin login required.","Cần đăng nhập quản trị."));
   const response=await fetch("/api/accounting/connection",{method,headers:{Authorization:"Bearer "+session.access_token}});
   const result=await response.json();
   if(!response.ok)throw new Error(result.error||"Connection failed");
   if(method==="POST")setMessage(tr("직원방 수신 연결 완료. 시트 자동 입력은 아직 활성화되지 않았습니다.","Staff intake connected. Automatic sheet writes are not enabled yet.","Đã kết nối nhận tin. Chưa bật tự động ghi vào bảng tính."));
   else setMessage([
    "누락된 설정: "+(result.missing?.join(", ")||"없음"),
    "수신 저장소: "+(result.queue_ready?"준비됨":"미준비"),
    "직원방 수신 권한: "+(result.group_ready?"확인됨":"확인 필요"),
    "구글 시트 읽기: "+(result.sheets?.accessible?"연결됨":"미연결"),
    "시트 구조/계산식: "+(result.sheets?.headers_match&&result.sheets?.formulas_present?"확인됨":"확인 필요"),
    "텔레그램 웹훅: "+(result.webhook_matches?"등록됨":"미등록"),
    "시트 자동 입력: 미활성"
   ].join(" / "));
  }catch(e){setMessage(e instanceof Error?e.message:"Connection failed")}finally{setBusy(false)}
 }
 return <section className="panel"><h2>{tr("텔레그램 연결 (관리자)","Telegram connection (admin)","Kết nối Telegram (quản trị)")}</h2><p className="muted">{tr("봇 토큰은 서버에만 저장됩니다. 그룹을 찾고 테스트 메시지를 보내면 그룹이 자동으로 저장됩니다.","The bot token stays on the server. Find a group and send a test message to save it.","Token bot chỉ lưu trên máy chủ. Tìm nhóm và gửi thử để lưu tự động.")}</p><div className="telegramSetup"><button className="outline" disabled={busy} onClick={()=>void call("GET")}>{tr("① 텔레그램 그룹 찾기","① Find Telegram groups","① Tìm nhóm Telegram")}</button><select aria-label="텔레그램 그룹" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">{tr("그룹 선택","Select group","Chọn nhóm")}</option>{groups.map(g=><option value={g.id} key={g.id}>{g.title} ({g.id})</option>)}</select><button className="primary" disabled={busy||!selected} onClick={()=>void call("POST")}>{tr("② 테스트 메시지 전송","② Send test message","② Gửi tin nhắn thử")}</button></div><div className="telegramSetup"><button className="outline" disabled={busy} onClick={()=>void accountingConnection("GET")}>{tr("③ 일일정산 연결 점검","③ Check accounting connection","③ Kiểm tra kết nối kế toán")}</button><button className="outline" disabled={busy} onClick={()=>void accountingConnection("POST")}>{tr("④ 직원방 수신 연결","④ Connect staff inbox","④ Kết nối nhận tin nhân viên")}</button></div>{message&&<p className="memberNotice" role="status">{message}</p>}</section>
}
