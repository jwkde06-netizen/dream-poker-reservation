"use client";
import {useState} from "react";
import {db} from "../lib/db";
type Group={id:string;title:string;type:string};
export default function TelegramSetup(){
 const [groups,setGroups]=useState<Group[]>([]),[selected,setSelected]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 async function call(method:"GET"|"POST"){
 if(!db)return;
 setBusy(true);setMessage("");
 const {data:{session}}=await db.auth.getSession();
 if(!session){setMessage("관리자 로그인이 필요합니다.");setBusy(false);return}
 try{
 const response=await fetch("/api/telegram",{method,headers:{Authorization:"Bearer "+session.access_token,...(method==="POST"?{"Content-Type":"application/json"}:{})},body:method==="POST"?JSON.stringify({chat_id:selected}):undefined});
 const body=await response.json();
 if(!response.ok)throw new Error(body.error||"연결 오류");
 if(method==="GET"){setGroups(body.groups||[]);setSelected(body.groups?.[0]?.id||"");setMessage(body.groups?.length?"그룹을 선택하고 테스트 메시지를 보내세요.":"아직 봇이 수신한 그룹 기록이 없습니다. 그룹에서 /start@봇아이디 를 보내고 다시 검색하세요.")}
 else setMessage("테스트 메시지 전송 성공! "+body.title+" 그룹이 자동 저장됐습니다. 이제 예약 알림이 이 그룹으로 전송됩니다.");
 }catch(e){setMessage(e instanceof Error?e.message:"Error")}finally{setBusy(false)}
 }
 return <section className="panel"><h2>텔레그램 연결 (관리자)</h2><p className="muted">봇 토큰은 서버에만 저장됩니다. 그룹을 찾고 테스트 메시지를 보내면 그룹이 자동으로 저장됩니다.</p><div className="telegramSetup"><button className="outline" disabled={busy} onClick={()=>void call("GET")}>① 텔레그램 그룹 찾기</button><select aria-label="텔레그램 그룹" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">그룹 선택</option>{groups.map(g=><option value={g.id} key={g.id}>{g.title} ({g.id})</option>)}</select><button className="primary" disabled={busy||!selected} onClick={()=>void call("POST")}>② 테스트 메시지 전송</button></div>{message&&<p className="memberNotice" role="status">{message}</p>}</section>
}
