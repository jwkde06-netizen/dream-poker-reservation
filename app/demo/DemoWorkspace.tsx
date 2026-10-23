'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {demoErrors,demoLabels,demoReasons,demoTelegram,occupiedSeats,type DemoBooking,type DemoCommand,type DemoDetails,type DemoRole,type DemoSnapshot} from '../../lib/reservation-demo';
import DemoDetailsForm,{newDemoDetails} from './DemoDetailsForm';
import styles from './demo.module.css';
type Access={room:string;key:string};
const label=(key:string)=>demoLabels[key]?.join(' · ')||key;
const actionLabel=(action:string,status:string)=>action==='approve'&&status==='cancelled'?'취소 승인 · Duyệt hủy':action==='cancel'?'예약 취소 · Hủy đặt chỗ':label(action);
const format=(value:string)=>new Date(value).toLocaleString('en-GB',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
const errorText=(code:string)=>demoErrors[code]?.join(' / ')||'연결을 확인해주세요. / Vui lòng kiểm tra kết nối.';
const pendingKey=(a:Access,role:DemoRole)=>`dream-demo-pending-v1:${a.room}:${role}`;

export default function DemoWorkspace({role}:{role:DemoRole}){
 const [access,setAccess]=useState<Access|null>(null),[snapshot,setSnapshot]=useState<DemoSnapshot|null>(null);
 const snapshotRef=useRef<DemoSnapshot|null>(null),alive=useRef(true),sending=useRef(false),seen=useRef<number|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[connected,setConnected]=useState(false),[lastSync,setLastSync]=useState('');
 const [pending,setPending]=useState<DemoCommand|null>(null),[toast,setToast]=useState(''),[selected,setSelected]=useState(''),[filter,setFilter]=useState('all');
 const [draft,setDraft]=useState<DemoDetails>(newDemoDetails),[showForm,setShowForm]=useState(false),[dropResponse,setDropResponse]=useState(false);
 const [faultUsed,setFaultUsed]=useState(false);
 useEffect(()=>{alive.current=true;const params=new URLSearchParams(location.hash.slice(1));const a={room:params.get('room')||'',key:params.get('key')||''};if(!/^[0-9a-f-]{36}$/i.test(a.room)||! /^[0-9a-f]{64}$/i.test(a.key)){setError(errorText('session'));return;}setAccess(a);try{const c=JSON.parse(localStorage.getItem(pendingKey(a,role))||'null');if(c?.id){setPending(c);setError('이전 전송의 결과를 확인하지 못했습니다. 같은 요청으로 재시도해주세요. / Chưa xác nhận kết quả. Hãy thử lại cùng yêu cầu.')}}catch{}return()=>{alive.current=false}},[role]);
 const accept=useCallback((next:DemoSnapshot)=>{
  if(!alive.current)return;if(next.role!==role)throw Error('role');
  if(snapshotRef.current&&next.revision<snapshotRef.current.revision)return;
  if(seen.current!==null&&next.revision>seen.current){const event=next.state.events.at(-1);if(event&&event.actor!==role){const b=event.details;setToast(event.action==='approve'&&b.status==='confirmed'?`예약이 확정되었습니다 · Đã xác nhận: ${b.name}`:`${actionLabel(event.action,b.status)} · ${b.name}`);}}
  seen.current=next.revision;snapshotRef.current=next;setSnapshot(next);setConnected(true);setLastSync(new Date().toISOString());
 },[role]);
 const refresh=useCallback(async()=>{
  if(!access||document.visibilityState==='hidden')return;
  try{const res=await fetch(`/api/reservation-demo?room=${access.room}`,{headers:{Authorization:`Bearer ${access.key}`},cache:'no-store',signal:AbortSignal.timeout(10000)});const data=await res.json();if(!res.ok){if(res.status===403)setError(errorText('session'));throw Error('connection')}accept(data);
  }catch{if(alive.current)setConnected(false)}
 },[access,accept]);
 useEffect(()=>{if(!access)return;let stopped=false;let timer:ReturnType<typeof setTimeout>;const poll=async()=>{await refresh();if(!stopped)timer=setTimeout(poll,1000)};void poll();const focus=()=>void refresh();window.addEventListener('focus',focus);window.addEventListener('online',focus);document.addEventListener('visibilitychange',focus);const offline=()=>setConnected(false);window.addEventListener('offline',offline);return()=>{stopped=true;clearTimeout(timer);window.removeEventListener('focus',focus);window.removeEventListener('online',focus);window.removeEventListener('offline',offline);document.removeEventListener('visibilitychange',focus)}},[access,refresh]);
 async function send(command:DemoCommand,retry=false):Promise<boolean>{
  if(!access||sending.current||pending&&!retry)return false;
  sending.current=true;setBusy(true);setError('');setToast('');
  try{
   localStorage.setItem(pendingKey(access,role),JSON.stringify(command));setPending(command);
   const res=await fetch(`/api/reservation-demo?room=${access.room}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${access.key}`},body:JSON.stringify({command}),signal:AbortSignal.timeout(15000)});
   const result=await res.json();
   if(!res.ok){if(res.status>=400&&res.status<500){localStorage.removeItem(pendingKey(access,role));setPending(null);setError(errorText(result.error));await refresh();return false;}throw Error('connection');}
   if(dropResponse&&!retry){setDropResponse(false);setFaultUsed(true);throw Error('simulated-response-loss');}
   accept(result);localStorage.removeItem(pendingKey(access,role));setPending(null);setFaultUsed(false);setToast(`저장 완료 · Đã lưu: ${actionLabel(command.action,result.state.bookings.find((b:DemoBooking)=>b.id===(command.reservation_id||command.id))?.status||'')}`);if(command.action==='request'){setSelected(command.id);setShowForm(false);setDraft(newDemoDetails());}return true;
  }catch{setError('전송 결과를 확인하지 못했습니다. 성공으로 처리하지 않았습니다. 같은 요청으로 재시도해주세요. / Chưa xác nhận kết quả. Hãy thử lại cùng yêu cầu.');return false}
  finally{sending.current=false;setBusy(false)}
 }
 const state=snapshot?.state;
 const waiting=state?.bookings.filter(b=>b.request_kind&&!b.awaiting_desk).length||0;
 const rows=state?.bookings.filter(b=>filter==='all'||filter==='waiting'&&b.request_kind&&!b.awaiting_desk||filter==='confirmed'&&b.status==='confirmed'||filter==='closed'&&['rejected','cancelled'].includes(b.status))||[];
 const current=state?.bookings.find(b=>b.id===selected)||rows[0];
 const choose=(id:string)=>{setSelected(id);setError('');setShowForm(false)};
 const title=role==='desk'?'한국인 데스크':'Thu ngân · 캐셔';
 return <main className={styles.root}><header className={styles.header}><a href="/demo" className={styles.brand}><img src="/dream-poker-logo.svg" alt="Dream Poker logo"/><strong>Dream Poker</strong></a><span className={styles.demoBadge}>DEMO · 시연 전용</span></header>
 <div className={styles.workspaceHead}><div><p className={styles.eyebrow}>{role==='desk'?'KOREAN DESK':'CASHIER'}</p><h1>{title}</h1></div><div className={styles.connection} role="status"><span className={connected?styles.online:styles.offline}/>{connected?'연결됨 · Đã kết nối':'연결 확인 중 · Đang kết nối'}<small>1초 자동 동기화{lastSync?` · ${new Date(lastSync).toLocaleTimeString('en-GB',{timeZone:'Asia/Ho_Chi_Minh'})}`:''}</small></div></div>
 <div className={styles.notice}>카톡 수신 내용은 데스크가 직접 입력합니다. · Quầy Hàn Quốc nhập yêu cầu nhận qua KakaoTalk.<small>가짜 예약만 저장 · Telegram 미발송 · 앱 종료 후 푸시 미구현 / Chỉ lưu demo · Không gửi Telegram · Chưa có push khi đóng ứng dụng</small></div>
 {toast&&<div className={styles.toast} role="status">{toast}<button aria-label="알림 닫기" onClick={()=>setToast('')}>×</button></div>}
 {error&&<div className={styles.error} role="alert">{error}{pending&&<button className={styles.primary} disabled={busy} onClick={()=>void send(pending,true)}>{busy?'전송 중…':'같은 요청 재시도 · Thử lại'}</button>}{faultUsed&&<small>시연 도구로 응답 누락을 재현한 상태입니다. / Đang mô phỏng mất phản hồi.</small>}</div>}
 {!state?<section className={styles.empty}><p>{access?'시연 데이터를 불러오는 중입니다. / Đang tải dữ liệu demo.':'시연 시작 화면에서 역할별 링크를 열어주세요.'}</p><a href="/demo">시연 시작 화면 →</a></section>:<>
 <section className={styles.metrics}><div><span>미처리 · Chờ xử lý</span><strong>{waiting}</strong></div><div><span>확정 인원 · Khách đã xác nhận</span><strong>{occupiedSeats(state,'dream-5m')}<small> / 9</small></strong></div><div><span>시연방 · Phòng demo</span><strong className={styles.roomCode}>{access?.room.slice(0,8)}</strong></div></section>
 <div className={styles.workspace}><section className={styles.queue}><div className={styles.sectionTitle}><h2>예약 요청 · Yêu cầu</h2>{role==='desk'&&<button className={styles.primary} disabled={busy||!!pending} onClick={()=>{setShowForm(!showForm);setError('')}}>＋ 새 요청</button>}</div>
 {role==='desk'&&showForm&&<form className={styles.createForm} onSubmit={e=>{e.preventDefault();void send({id:crypto.randomUUID(),action:'request',details:draft})}}><DemoDetailsForm value={draft} onChange={setDraft} state={state} disabled={busy||!!pending}/><button className={styles.primary} disabled={busy||!!pending}>{busy?'전송 중…':'캐셔에게 요청 · Gửi thu ngân'}</button><small className={styles.hint}>캐셔 승인 전에는 확정되지 않습니다. · Chưa xác nhận trước khi thu ngân duyệt.</small></form>}
 <nav className={styles.filters} aria-label="예약 상태 필터">{[['all','전체 · Tất cả'],['waiting','미처리 · Chờ'],['confirmed','확정 · Xác nhận'],['closed','종료 · Kết thúc']].map(([key,title])=><button key={key} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{title}</button>)}</nav>
 <div className={styles.cards}>{!rows.length?<div className={styles.empty}>{role==='desk'?'새 요청을 등록해주세요.':'새 요청이 도착하면 여기에 표시됩니다.'}<small>{role==='desk'?'Tạo yêu cầu mới.':'Yêu cầu mới sẽ xuất hiện tại đây.'}</small></div>:rows.map(b=><button type="button" className={`${styles.card} ${current?.id===b.id&&!showForm?styles.selected:''}`} key={b.id} onClick={()=>choose(b.id)}><div><span className={`${styles.badge} ${styles[b.request_kind?'pending':b.status]}`}>{b.awaiting_desk?'데스크 답변 필요 · Chờ quầy trả lời':b.request_kind?label(b.request_kind):label(b.status)}</span><strong>{(b.proposed||b).name}</strong></div><div className={styles.cardFacts}><span>Dream Poker 5M</span><b>{(b.proposed||b).party_size}명 · khách</b><span>{format((b.proposed||b).arrival_at)} (VN)</span></div>{b.status==='confirmed'&&b.request_kind&&<small>기존 확정 유지 · Giữ chỗ đã xác nhận</small>}{b.reply&&<small>{b.reply}</small>}{b.reply_vi&&<small>{b.reply_vi}</small>}</button>)}</div></section>
 <section className={styles.detail}>{current&&!showForm?<BookingDetail key={`${current.id}:${current.version}`} booking={current} snapshot={snapshot!} role={role} disabled={busy||!!pending} send={send}/>:<div className={styles.empty}><span className={styles.emptyIcon}>↗</span><h2>{showForm?'새 요청을 작성 중입니다':'예약을 선택하세요'}</h2><p>이름·인원·시간과 처리 이력을 한곳에서 확인합니다.</p><small>Chọn yêu cầu để xem thông tin và lịch sử.</small></div>}</section></div>
 <details className={styles.testTools}><summary>시연 확인 도구 · Công cụ kiểm tra demo</summary><label><input type="checkbox" checked={dropResponse} disabled={busy||!!pending} onChange={e=>setDropResponse(e.target.checked)}/> 다음 전송의 응답 누락 재현 · Mô phỏng mất phản hồi tiếp theo</label><p>저장은 되었지만 응답을 받지 못한 상황을 재현합니다. ‘같은 요청 재시도’를 눌러도 예약과 이력은 중복 생성되지 않아야 합니다.</p><small>모의 동작: 통신 응답 누락, 가짜 직원 역할, Telegram 미리보기. 서버 저장·동기화·승인·정원 검사는 실제 동작합니다.</small></details>
 </>}
 <footer className={styles.footer}><a href="/demo">시연방 링크 · Liên kết demo</a><span>운영 데이터와 분리 · Tách biệt dữ liệu thật</span></footer></main>
}

function BookingDetail({booking:b,snapshot,role,disabled,send}:{booking:DemoBooking;snapshot:DemoSnapshot;role:DemoRole;disabled:boolean;send:(c:DemoCommand)=>Promise<boolean>}){
 const [editing,setEditing]=useState(false),[change,setChange]=useState<DemoDetails>(b.proposed||b),[reply,setReply]=useState(''),[replyVi,setReplyVi]=useState(''),[alternative,setAlternative]=useState('');
 const editable=['pending','confirmed'].includes(b.status),details=b.proposed||b;
 const command=(action:DemoCommand['action'],extra:Partial<DemoCommand>={})=>send({id:crypto.randomUUID(),action,reservation_id:b.id,expected_version:b.version,...extra});
 const replyFields=()=>({reply,reply_vi:replyVi,alternative_at:alternative?new Date(alternative+'+07:00').toISOString():null});
 const telegram=demoTelegram(b,snapshot.state);
 return <><div className={styles.sectionTitle}><h2>예약 상세 · Chi tiết</h2><span className={`${styles.badge} ${styles[b.status]}`}>{label(b.status)}</span></div>
 <h3 className={styles.playerName}>{details.name}</h3>
 {b.request_kind&&<p className={styles.pendingNote}>{b.awaiting_desk?'캐셔가 조정을 제안했습니다. 내용을 확인한 뒤 변경 요청을 보내주세요. / Thu ngân đề xuất thay đổi. Hãy kiểm tra và gửi yêu cầu sửa.':label(b.request_kind)}{b.status==='confirmed'&&<small>{b.request_kind==='cancel'?'취소 승인 전입니다. 기존 예약 ':'아래 변경안은 아직 확정되지 않았습니다. 기존 예약 '}{b.party_size}명 · {format(b.arrival_at)}{b.request_kind==='cancel'?' 유지. / Chưa duyệt hủy; giữ đặt chỗ cũ.':' 유지. / Thay đổi chưa được duyệt; giữ đặt chỗ cũ.'}</small>}</p>}
 {!b.request_kind&&b.status==='confirmed'&&<p className={styles.success}>예약이 확정되었습니다 · Đặt chỗ đã được xác nhận</p>}
 <dl className={styles.facts}><div><dt>게임 · Trò chơi</dt><dd>Dream Poker 5M</dd></div><div><dt>희망 시간 · Giờ mong muốn</dt><dd>{format(details.arrival_at)} (VN)</dd></div><div><dt>인원 · Số khách</dt><dd>{details.party_size}명 · khách</dd></div></dl>
 {(details.note||details.note_vi)&&<div className={styles.note}><strong>메모 · Ghi chú</strong><p>{details.note||'—'}</p>{details.note_vi&&<p>{details.note_vi}</p>}<small>원문 / 수동 번역 · Bản gốc / dịch thủ công</small></div>}
 {(b.reply||b.reply_vi||b.alternative_at)&&<div className={styles.reply}><strong>캐셔 답변 · Phản hồi thu ngân</strong>{b.reply&&<p>{b.reply}</p>}{b.reply_vi&&<p>{b.reply_vi}</p>}{b.alternative_at&&<p><b>대안 시간 · Giờ đề xuất: {format(b.alternative_at)} (VN)</b></p>}</div>}
 {role==='desk'&&editable&&<><div className={styles.actions}><button disabled={disabled} onClick={()=>{setChange({...details,arrival_at:b.alternative_at||details.arrival_at});setEditing(!editing)}}>변경 요청 · Yêu cầu đổi</button><button className={styles.danger} disabled={disabled||b.request_kind==='cancel'} onClick={()=>void command('cancel_request')}>취소 요청 · Yêu cầu hủy</button></div>{editing&&<form className={styles.editForm} onSubmit={e=>{e.preventDefault();void command('change',{details:change}).then(saved=>{if(saved)setEditing(false)})}}><DemoDetailsForm value={change} onChange={setChange} state={snapshot.state} disabled={disabled}/><button className={styles.primary} disabled={disabled}>변경 내용 보내기 · Gửi thay đổi</button></form>}</>}
 {role==='cashier'&&editable&&<div className={styles.cashierActions}>{b.request_kind&&!b.awaiting_desk?<><label>답변 사유 · Lý do<select aria-label="답변 사유 · Lý do" defaultValue="" disabled={disabled} onChange={e=>{const r=demoReasons[Number(e.target.value)];if(r){setReply(r.ko);setReplyVi(r.vi)}}}><option value="" disabled>사유 선택 · Chọn lý do</option>{demoReasons.map((r,i)=><option value={i} key={i}>{r.vi} / {r.ko}</option>)}</select></label><label>한국어 답변 (선택)<textarea maxLength={500} rows={2} value={reply} disabled={disabled} onChange={e=>setReply(e.target.value)}/></label><label>Phản hồi tiếng Việt<textarea maxLength={500} rows={2} value={replyVi} disabled={disabled} onChange={e=>setReplyVi(e.target.value)}/></label><label>대안 시간 (VN) · Giờ thay thế<input type="datetime-local" value={alternative} disabled={disabled} onChange={e=>setAlternative(e.target.value)}/></label><small className={styles.hint}>거절·조정에는 사유 또는 대안 시간이 필요합니다. / Cần lý do hoặc giờ thay thế.</small><div className={styles.actions}><button className={styles.primary} disabled={disabled} onClick={()=>void command('approve',{reply,reply_vi:replyVi})}>{b.request_kind==='cancel'?'취소 승인 · Duyệt hủy':'승인 · Xác nhận'}</button><button className={styles.danger} disabled={disabled||(!reply.trim()&&!replyVi.trim()&&!alternative)} onClick={()=>void command('reject',replyFields())}>거절 · Từ chối</button><button disabled={disabled||(!reply.trim()&&!replyVi.trim()&&!alternative)} onClick={()=>void command('suggest',replyFields())}>조정 제안 · Đề xuất</button></div></>:b.awaiting_desk?<p>데스크의 변경 요청을 기다리고 있습니다. / Đang chờ quầy Hàn Quốc phản hồi.</p>:b.status==='confirmed'?<button className={styles.danger} disabled={disabled} onClick={()=>void command('cancel')}>예약 취소 · Hủy đặt chỗ</button>:null}</div>}
 <details className={styles.history} open><summary>처리 이력 · Lịch sử</summary>{snapshot.state.events.filter(e=>e.reservation_id===b.id).slice().reverse().map(e=><div key={e.id}><strong>{actionLabel(e.action,e.details.status)}</strong><small>{e.actor==='desk'?'시연 한국인 데스크 · Quầy Hàn Quốc (demo)':'시연 캐셔 · Thu ngân (demo)'} · {format(e.at)} (VN)</small><span>{label(e.details.status)} · {e.details.party_size}명 · {format(e.details.arrival_at)}</span>{e.details.proposed&&<span>변경안 · Đề xuất: {e.details.proposed.party_size}명 · {format(e.details.proposed.arrival_at)}</span>}{e.details.reply&&<p>{e.details.reply}</p>}{e.details.reply_vi&&<p>{e.details.reply_vi}</p>}{e.details.alternative_at&&<span>대안 · Giờ thay thế: {format(e.details.alternative_at)}</span>}</div>)}</details>
 <details className={styles.telegram}><summary>Telegram 미리보기 · Xem trước (미발송)</summary><pre>{telegram.text}</pre><div className={styles.previewButtons}>{telegram.keyboard.inline_keyboard.flat().map(button=><span key={button.callback_data}>{button.text}</span>)}</div><small>기존 알림 형식 재사용 · 실제 메시지나 승인 버튼은 전송하지 않습니다.</small></details>
 </>
}
