"use client";
import {useState} from "react";
import {db} from "../lib/db";
type Game={id:string;title:string;table_no:string;game_no?:string;is_open:boolean};
const local=(d:Date)=>new Date(d.getTime()+7*3600000).toISOString().slice(0,16);
export default function StaffQuickBooking({games,onBooked,lang}:{games:Game[];onBooked:()=>void;lang:"ko"|"en"|"vi"}){
 const [name,setName]=useState(""),[game,setGame]=useState(""),[arrival,setArrival]=useState(local(new Date(Date.now()+30*60000)));
 const [busy,setBusy]=useState(false),[feedback,setFeedback]=useState("");
 const tr=(ko:string,en:string,vi:string)=>lang==="en"?en:lang==="vi"?vi:ko;
 async function submit(){if(!db||busy||!game||name.trim().length<2)return;setBusy(true);setFeedback("");try{
 const result=await db.rpc("desk_request_poker_reservation",{p_game:game,p_name:name.trim(),p_arrival:new Date(arrival+"+07:00").toISOString()});
 if(result.error)throw Error(result.error.message);
 setFeedback(tr("캐셔 예약 대기열에 등록했습니다.","Added to cashier reservation queue.","Đã thêm vào danh sách chờ của thu ngân."));
 setName("");onBooked();
 }catch(e){setFeedback(e instanceof Error?e.message:"Reservation failed")}finally{setBusy(false)}}
 const open=games.filter(g=>g.is_open);
 return <div className="staffInlineBooking"><div className="staffInlineBookingTitle"><strong>＋ {tr("직접 예약 추가","Add reservation","Thêm đặt chỗ")}</strong><small>{tr("우리 에이전트 플레이어","Our agent players","Người chơi của đại lý")}</small></div><div className="staffInlineBookingFields">
 <input aria-label={tr("플레이어 이름","Player name","Tên người chơi")} placeholder={tr("영문 이름 입력","Enter English name","Nhập tên tiếng Anh")} value={name} maxLength={80} onChange={e=>setName(e.target.value)}/>
 <select aria-label={tr("예약 게임","Reservation game","Bàn đặt chỗ")} value={game} onChange={e=>setGame(e.target.value)}><option value="">{tr("테이블 / 게임 선택","Select table / game","Chọn bàn / game")}</option>{open.map(g=><option key={g.id} value={g.id}>Table {g.table_no} · No.{g.game_no||"—"} · {g.title}</option>)}</select>
 <input type="time" aria-label={tr("도착 시간","Arrival time","Giờ đến")} value={arrival.slice(11,16)} onChange={e=>{const next=arrival.slice(0,11)+e.target.value;const epoch=new Date(next+":00+07:00").getTime();setArrival(epoch<Date.now()-6*3600000?local(new Date(epoch+86400000)):next)}}/>
 <button type="button" disabled={busy||!game||name.trim().length<2} onClick={()=>void submit()}>{busy?"…":tr("예약 신청","Add","Đặt chỗ")}</button></div>{feedback&&<p role="status" className="staffInlineBookingFeedback">{feedback}</p>}</div>;
}
