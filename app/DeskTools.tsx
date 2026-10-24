"use client";
import {useCallback,useEffect,useState} from "react";
import {bookingName} from "../lib/reservation-names";
import {intakeTitle,startPending} from "../lib/reservation-games";
import {reservationCopy,reservationError} from "../lib/reservation-ui";
import {db} from "../lib/db";
type Game={is_default_queue?:boolean;id:string;title:string;starts_at:string;is_open:boolean};
type Booking={id:string;game_id:string;player_name:string;arrival_at:string;status:string};
type Message={id:number;reservation_id:string;author_name:string;body:string;translation:string;created_at:string};
const phrases=[
 {en:"The guest will arrive in 10 minutes.",ko:"손님이 10분 후 도착합니다.",vi:"Khách sẽ đến sau 10 phút."},
 {en:"The guest will arrive in 30 minutes.",ko:"손님이 30분 후 도착합니다.",vi:"Khách sẽ đến sau 30 phút."},
 {en:"Please confirm this guest’s reservation.",ko:"이 손님 예약 확인 부탁드립니다.",vi:"Vui lòng xác nhận đặt chỗ cho khách này."},
 {en:"Are seats available now?",ko:"현재 자리가 있나요?",vi:"Hiện tại còn chỗ trống không?"},
 {en:"The reservation is confirmed.",ko:"예약 확정했습니다.",vi:"Đã xác nhận đặt chỗ."},
 {en:"The table is full. Please add the guest to the waitlist.",ko:"지금 만석입니다. 대기 등록해주세요.",vi:"Hiện đã hết chỗ. Vui lòng thêm vào danh sách chờ."},
 {en:"The guest has arrived.",ko:"손님이 도착했습니다.",vi:"Khách đã đến."},
 {en:"Please change the arrival time.",ko:"예약 시간을 변경해주세요.",vi:"Vui lòng thay đổi giờ đặt chỗ."}
];
const vntime=(d:Date)=>new Date(d.getTime()+7*3600000).toISOString().slice(0,16);
export default function DeskTools({games,bookings,language,refresh}:{games:Game[];bookings:Booking[];language:"ko"|"en"|"vi";refresh:()=>void}){
 const copy=reservationCopy[language];
 const extra=language==='ko'?{conversation:'예약 대화',empty:'메시지가 없습니다',quick:'빠른 문구',message:'메시지',translation:'번역 (직접 입력 또는 빠른 문구 선택)',apply:'선택 문구 적용'}:language==='vi'?{conversation:'Trao đổi đặt chỗ',empty:'Chưa có tin nhắn',quick:'Câu có sẵn',message:'Tin nhắn',translation:'Bản dịch (nhập hoặc chọn câu mẫu)',apply:'Dùng câu mẫu'}:{conversation:'Reservation conversation',empty:'No messages',quick:'Quick phrases',message:'Message',translation:'Translation (enter or select a quick phrase)',apply:'Use selected phrase'};
 const displayedMessage=(m:Message)=>{const known=phrases.find(p=>[p.ko,p.en,p.vi].includes(m.body));return known?known[language]:language==='vi'&&/[가-힣]/.test(m.body)&&m.translation?m.translation:language==='ko'&&!/[가-힣]/.test(m.body)&&/[가-힣]/.test(m.translation)?m.translation:m.body};
 const [game,setGame]=useState(""),[name,setName]=useState(""),[arrival,setArrival]=useState(vntime(new Date(Date.now()+1800000)));
 const [working,setWorking]=useState(false),[message,setMessage]=useState("");
 const [active,setActive]=useState(""),[items,setItems]=useState<Message[]>([]),[draft,setDraft]=useState("");
 const [phrase,setPhrase]=useState(0);
 const [customTranslation,setCustomTranslation]=useState("");
 const [showMessages,setShowMessages]=useState(true);
 const labels=language==="vi"?{title:"Đặt chỗ tại quầy",submit:"Gửi đặt chỗ",select:"Chọn trò chơi",who:"Tên khách",when:"Giờ đến",chat:"Trao đổi với thu ngân",send:"Gửi",hint:"Chỉ nhân viên đã đăng nhập mới xem được. Các câu có bản dịch được chuẩn bị sẵn."}:language==="en"?{title:"Front desk bookings",submit:"Submit booking",select:"Select game",who:"Player name",when:"Arrival time",chat:"Desk / cashier messages",send:"Send",hint:"Staff-only messages. Quick phrases are available in your selected language."}:{title:"한국 데스크 현장 예약",submit:"예약 접수",select:"게임 선택",who:"예약자 이름",when:"도착 예정",chat:"한국 데스크 ↔ 캐셔 대화",send:"전송",hint:"직원 전용 대화입니다. 선택한 언어의 빠른 문구를 사용할 수 있습니다."};
 const load=useCallback(async()=>{if(!db||!active)return;const {data}=await db.from("reservation_messages").select("id,reservation_id,author_name,body,translation,created_at").eq("reservation_id",active).order("created_at",{ascending:true}).limit(150);if(data)setItems(data)},[active]);
 useEffect(()=>{void load();const timer=setInterval(()=>void load(),4000);return()=>clearInterval(timer)},[load]);
 async function book(){if(!db||!game||name.trim().length<2)return;setWorking(true);const {error}=await db.rpc("desk_request_poker_reservation",{p_game:game,p_name:name.trim(),p_arrival:new Date(arrival+"+07:00").toISOString()});setWorking(false);setMessage(error?.message||"booked");if(!error){setName("");refresh()}}
 async function send(){if(!db||!active||!draft.trim())return;setWorking(true);const {error}=await db.from("reservation_messages").insert({reservation_id:active,body:draft.trim().slice(0,500),translation:customTranslation.trim().slice(0,500),author_name:language==="vi"?"Cashier":"Desk"});setWorking(false);if(error){setMessage(error.message);return}setDraft("");setCustomTranslation("");await load();}
 function choosePhrase(index:number){setPhrase(index);setDraft(phrases[index][language]);setCustomTranslation(language==="vi"?phrases[index].ko:phrases[index].vi)}
 return <section className="panel deskTools">
 <h2>{labels.title}</h2><div className="deskForm">
 <label>{labels.select}<select value={game} onChange={e=>setGame(e.target.value)}><option value="">—</option>{games.filter(g=>g.is_open).map(g=><option key={g.id} value={g.id}>{g.is_default_queue?`${intakeTitle(language)} · ${startPending(language)}`:`${g.title} · ${new Date(g.starts_at).toLocaleString(language==="ko"?"ko-KR":language==="vi"?"vi-VN":"en-GB",{timeZone:"Asia/Ho_Chi_Minh"})}`}</option>)}</select></label>
 <label>{labels.who}<input value={name} maxLength={80} onChange={e=>setName(e.target.value)} placeholder="KIM JIWON"/></label>
 <label>{labels.when}<input type="datetime-local" value={arrival} onChange={e=>setArrival(e.target.value)}/></label>
 <button className="primary" disabled={working||!game||name.trim().length<2} onClick={()=>void book()}>{labels.submit} →</button></div>
 {message&&<p className="muted" role="status">{message==="booked"?copy.submitted:reservationError(message,language)}</p>}
 <div className="deskChatHead"><h2>{labels.chat}</h2><button className="outline" onClick={()=>setShowMessages(!showMessages)}>{showMessages?"−":"+"}</button></div>
 {showMessages&&<><p className="muted">{labels.hint}</p><select aria-label={extra.conversation} value={active} onChange={e=>setActive(e.target.value)}><option value="">{copy.selectBooking}</option>{bookings.slice(0,100).map(b=><option value={b.id} key={b.id}>{bookingName(b)} · {games.find(g=>g.id===b.game_id)?.title||copy.game} · {(copy.statuses as Record<string,string>)[b.status]||b.status}</option>)}</select>
 {active&&<><div className="chatMessages">{!items.length?<p className="muted">{extra.empty}</p>:items.map(m=><div className="chatBubble" key={m.id}><strong>{m.author_name||copy.staff}</strong><p>{displayedMessage(m)}</p><time>{new Date(m.created_at).toLocaleTimeString(language==="vi"?"vi-VN":language==="en"?"en-GB":"ko-KR",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit"})}</time></div>)}</div>
 <select aria-label={extra.quick} value={phrase} onChange={e=>choosePhrase(Number(e.target.value))}><option value="" disabled>{extra.quick}</option>{phrases.map((p,i)=><option value={i} key={i}>{p[language]}</option>)}</select>
 <div className="chatCompose"><textarea rows={2} maxLength={500} value={draft} onChange={e=>{setDraft(e.target.value);setCustomTranslation("")}} placeholder={extra.message}/><textarea rows={2} maxLength={500} value={customTranslation} onChange={e=>setCustomTranslation(e.target.value)} placeholder={extra.translation}/></div>
 <div className="chatActions"><button type="button" className="outline" onClick={()=>choosePhrase(phrase)}>{extra.apply}</button><button className="primary" disabled={working||!draft.trim()} onClick={()=>void send()}>{labels.send}</button></div>
 </>}</>}
 </section>
}
