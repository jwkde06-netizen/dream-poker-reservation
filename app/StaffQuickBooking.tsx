"use client";
import {useEffect,useMemo,useState} from "react";
import {db} from "../lib/db";
type Game={id:string;title:string;table_no:string;game_no?:string;is_open:boolean};
export default function StaffQuickBooking({games,onBooked,lang}:{games:Game[];onBooked:()=>void;lang:"ko"|"en"|"vi"}){
 const [name,setName]=useState(""),[game,setGame]=useState(""),[onSite,setOnSite]=useState(false);
 const [busy,setBusy]=useState(false),[feedback,setFeedback]=useState("");
 const [players,setPlayers]=useState<Array<{id:string;name:string;korean_name:string|null}>>([]);
 const [focused,setFocused]=useState(false),[activeIndex,setActiveIndex]=useState(-1),[chosen,setChosen]=useState(false);
 useEffect(()=>{let active=true;async function load(){if(!db)return;const {data,error}=await db.from("players").select("id,name,korean_name").order("name").limit(1000);if(active&&!error)setPlayers(data||[])}void load();return()=>{active=false}},[]);
 const suggestions=useMemo(()=>{const q=name.trim().toLocaleLowerCase();if(!q||chosen)return[];return players.filter(p=>p.name.toLocaleLowerCase().includes(q)||(p.korean_name||"").toLocaleLowerCase().includes(q)).slice(0,8)},[name,players]);
 const choosePlayer=(player:{name:string})=>{setName(player.name);setChosen(true);setFocused(false);setActiveIndex(-1)};
 const tr=(ko:string,en:string,vi:string)=>lang==="en"?en:lang==="vi"?vi:ko;
 async function submit(){if(!db||busy||!game||name.trim().length<2)return;setBusy(true);setFeedback("");try{const arrivalISO=new Date().toISOString();
 const result=await db.rpc("desk_request_poker_reservation",{p_game:game,p_name:name.trim(),p_arrival:arrivalISO,p_note:onSite?"[ONSITE]":"[NOT_ARRIVED]"});
 if(result.error)throw Error(result.error.message);
 const {data:{session}}=await db.auth.getSession();
 const alert=await fetch("/api/notify/desk",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+(session?.access_token||"")},body:JSON.stringify({game_id:game,name:name.trim(),arrival_at:arrivalISO})}).then(async r=>({ok:r.ok,body:await r.json().catch(()=>({}))})).catch(()=>({ok:false,body:{}}));
 setFeedback(alert.ok?tr("예약 요청을 캐셔 텔레그램으로 전송했습니다. 승인 대기 중입니다.","Sent to cashier Telegram. Awaiting approval.","Đã gửi Telegram cho thu ngân. Đang chờ duyệt."):tr("예약은 접수됐지만 텔레그램 알림은 확인이 필요합니다.","Booking saved; Telegram notification needs attention.","Đã lưu đặt chỗ; vui lòng kiểm tra thông báo Telegram."));
 setName("");setChosen(false);setActiveIndex(-1);onBooked();
 }catch(e){setFeedback(e instanceof Error?e.message:"Reservation failed")}finally{setBusy(false)}}
 const open=games.filter(g=>g.is_open);
 return <div className="staffInlineBooking"><div className="staffInlineBookingTitle"><strong>＋ {tr("직접 예약 추가","Add reservation","Thêm đặt chỗ")}</strong></div><div className="staffInlineBookingFields">
 <div className="staffPlayerSearch"><input aria-label={tr("플레이어 이름","Player name","Tên người chơi")} aria-autocomplete="list" aria-expanded={focused&&suggestions.length>0} aria-activedescendant={activeIndex>=0&&focused&&suggestions[activeIndex]?"staff-player-"+suggestions[activeIndex].id:undefined} role="combobox" placeholder={tr("이름 검색 / 직접 입력","Search or enter name","Tìm hoặc nhập tên")} value={name} maxLength={80} autoComplete="off" onFocus={()=>setFocused(true)} onBlur={()=>setTimeout(()=>setFocused(false),120)} onChange={e=>{setName(e.target.value);setChosen(false);setActiveIndex(-1)}} onKeyDown={e=>{if(e.key==="ArrowDown"&&suggestions.length){e.preventDefault();setActiveIndex(i=>(i+1)%suggestions.length)}else if(e.key==="ArrowUp"&&suggestions.length){e.preventDefault();setActiveIndex(i=>i<=0?suggestions.length-1:i-1)}else if(e.key==="Enter"){if(focused&&suggestions.length){e.preventDefault();choosePlayer(suggestions[activeIndex>=0?activeIndex:0])}else if(game&&name.trim().length>=2){e.preventDefault();void submit()}}else if(e.key==="Escape"){setFocused(false);setActiveIndex(-1)}}}/>{focused&&suggestions.length>0&&<div className="staffPlayerSuggestions" role="listbox">{suggestions.map((p,i)=><button type="button" role="option" aria-selected={i===activeIndex} id={"staff-player-"+p.id} className={i===activeIndex?"keyboardActive":""} key={p.id} onMouseDown={e=>e.preventDefault()} onClick={()=>choosePlayer(p)}><strong>{p.name}</strong>{p.korean_name&&<small>{p.korean_name}</small>}</button>)}</div>}</div>
 <select aria-label={tr("예약 게임","Reservation game","Bàn đặt chỗ")} value={game} onChange={e=>setGame(e.target.value)}><option value="">{tr("테이블 / 게임 선택","Select table / game","Chọn bàn / game")}</option>{open.map(g=><option key={g.id} value={g.id}>Table {g.table_no} · No.{g.game_no||"—"} · {g.title}</option>)}</select>
 <div className="staffPresence" role="group" aria-label={tr("매장 도착 여부","At the venue","Đã có mặt")}>
  <button type="button" className={!onSite?"active":""} aria-pressed={!onSite} onClick={()=>setOnSite(false)}>{tr("도착 전","Not here yet","Chưa đến")}</button>
  <button type="button" className={onSite?"active":""} aria-pressed={onSite} onClick={()=>setOnSite(true)}>{tr("매장에 있음","Here now","Đã đến")}</button>
 </div>
 <button type="button" disabled={busy||!game||name.trim().length<2} onClick={()=>void submit()}>{busy?"…":tr("예약 신청","Add","Đặt chỗ")}</button></div>{feedback&&<p role="status" className="staffInlineBookingFeedback">{feedback}</p>}</div>;
}
