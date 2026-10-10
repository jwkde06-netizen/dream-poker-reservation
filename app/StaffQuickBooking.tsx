"use client";
import {useEffect,useMemo,useState} from "react";
import {db} from "../lib/db";
type Game={id:string;title:string;table_no:string;game_no?:string;is_open:boolean};
const local=(d:Date)=>new Date(d.getTime()+7*3600000).toISOString().slice(0,16);
export default function StaffQuickBooking({games,onBooked,lang}:{games:Game[];onBooked:()=>void;lang:"ko"|"en"|"vi"}){
 const [name,setName]=useState(""),[game,setGame]=useState(""),[arrival,setArrival]=useState(local(new Date(Date.now()+30*60000)));
 const [busy,setBusy]=useState(false),[feedback,setFeedback]=useState("");
 const [players,setPlayers]=useState<Array<{id:string;name:string;korean_name:string|null}>>([]);
 const [focused,setFocused]=useState(false);
 useEffect(()=>{let active=true;async function load(){if(!db)return;const {data,error}=await db.from("players").select("id,name,korean_name").order("name").limit(1000);if(active&&!error)setPlayers(data||[])}void load();return()=>{active=false}},[]);
 const suggestions=useMemo(()=>{const q=name.trim().toLocaleLowerCase();if(!q)return[];return players.filter(p=>p.name.toLocaleLowerCase().includes(q)||(p.korean_name||"").toLocaleLowerCase().includes(q)).slice(0,8)},[name,players]);
 const tr=(ko:string,en:string,vi:string)=>lang==="en"?en:lang==="vi"?vi:ko;
 async function submit(){if(!db||busy||!game||name.trim().length<2)return;setBusy(true);setFeedback("");try{
 const result=await db.rpc("desk_request_poker_reservation",{p_game:game,p_name:name.trim(),p_arrival:new Date(arrival+"+07:00").toISOString()});
 if(result.error)throw Error(result.error.message);
 setFeedback(tr("캐셔 예약 대기열에 등록했습니다.","Added to cashier reservation queue.","Đã thêm vào danh sách chờ của thu ngân."));
 setName("");onBooked();
 }catch(e){setFeedback(e instanceof Error?e.message:"Reservation failed")}finally{setBusy(false)}}
 const open=games.filter(g=>g.is_open);
 return <div className="staffInlineBooking"><div className="staffInlineBookingTitle"><strong>＋ {tr("직접 예약 추가","Add reservation","Thêm đặt chỗ")}</strong></div><div className="staffInlineBookingFields">
 <div className="staffPlayerSearch"><input aria-label={tr("플레이어 이름","Player name","Tên người chơi")} placeholder={tr("이름 검색 / 직접 입력","Search or enter name","Tìm hoặc nhập tên")} value={name} maxLength={80} autoComplete="off" onFocus={()=>setFocused(true)} onBlur={()=>setTimeout(()=>setFocused(false),120)} onChange={e=>setName(e.target.value)}/>{focused&&suggestions.length>0&&<div className="staffPlayerSuggestions">{suggestions.map(p=><button type="button" key={p.id} onMouseDown={e=>e.preventDefault()} onClick={()=>{setName(p.name);setFocused(false)}}><strong>{p.name}</strong>{p.korean_name&&<small>{p.korean_name}</small>}</button>)}</div>}</div>
 <select aria-label={tr("예약 게임","Reservation game","Bàn đặt chỗ")} value={game} onChange={e=>setGame(e.target.value)}><option value="">{tr("테이블 / 게임 선택","Select table / game","Chọn bàn / game")}</option>{open.map(g=><option key={g.id} value={g.id}>Table {g.table_no} · No.{g.game_no||"—"} · {g.title}</option>)}</select>
 <input type="time" aria-label={tr("도착 시간","Arrival time","Giờ đến")} value={arrival.slice(11,16)} onChange={e=>{const next=arrival.slice(0,11)+e.target.value;const epoch=new Date(next+":00+07:00").getTime();setArrival(epoch<Date.now()-6*3600000?local(new Date(epoch+86400000)):next)}}/>
 <button type="button" disabled={busy||!game||name.trim().length<2} onClick={()=>void submit()}>{busy?"…":tr("예약 신청","Add","Đặt chỗ")}</button></div>{feedback&&<p role="status" className="staffInlineBookingFeedback">{feedback}</p>}</div>;
}
