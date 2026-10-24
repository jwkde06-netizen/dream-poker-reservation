"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {db} from '../lib/db';
import {reservationCommand,forgetReservationCommand} from '../lib/reservation-command';
import styles from './OperationalReservations.module.css';

type Game={id:string;title:string;starts_at:string;is_open:boolean;is_default_queue?:boolean;is_test?:boolean;table_no:string;game_no?:string;capacity:number};
type Details={game_id:string;player_name_en:string;player_name_ko?:string;arrival_at:string;party_size:number;guest_note:string};
type Booking=Details&{id:string;player_name:string;status:string;version:number;request_kind:string;proposed:Partial<Details>&{reason?:string};staff_reply:string;alternative_at?:string;updated_actor:string;updated_at:string;created_at:string;source:string;is_test:boolean;contact_required:boolean};
type Audit={id:number;reservation_id:string;action?:string;new_status:string;actor_name?:string;created_at:string};
const labels:Record<string,string>={pending:'요청 중 · Chờ duyệt',confirmed:'확정 · Đã xác nhận',waitlisted:'조정 대기 · Chờ điều chỉnh',rejected:'거절 · Từ chối',cancelled:'취소 · Đã hủy',checked_in:'도착 확인 · Đã đến',no_show:'미방문 확인 · Không đến'};
const actions:Record<string,string>={request:'예약 요청 · Yêu cầu',request_change:'변경 요청 · Yêu cầu sửa',request_cancel:'취소 요청 · Yêu cầu hủy',approve:'승인 · Xác nhận',reject:'거절 · Từ chối',suggest:'대안 전달 · Đề xuất',cancel:'취소 · Hủy',check_in:'도착 확인 · Đã đến',no_show:'미방문 확인 · Không đến',contact:'데스크 연락 · Liên hệ quầy'};
const localTime=(s:string)=>new Date(new Date(s).getTime()+7*3600000).toISOString().slice(0,16);
const clock=(s?:string)=>s?new Date(s).toLocaleString('en-GB',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'—';
const fresh=():Details=>({game_id:'',player_name_en:'',arrival_at:localTime(new Date(Date.now()+30*60000).toISOString()),party_size:1,guest_note:''});
const needsReview=(b:Booking)=>b.status==='pending'||['change','cancel'].includes(b.request_kind);
const active=(b:Booking)=>['pending','waitlisted','confirmed'].includes(b.status);

export default function OperationalReservations({workspace,profileName,admin,onLogout,management}:{workspace:'desk'|'cashier';profileName:string;admin:boolean;onLogout:()=>void;management:React.ReactNode}){
 const desk=workspace==='desk';
 const [test,setTest]=useState(false),[testReady,setTestReady]=useState(false),[tools,setTools]=useState(false);
 const [games,setGames]=useState<Game[]>([]),[bookings,setBookings]=useState<Booking[]>([]),[audit,setAudit]=useState<Audit[]>([]);
 const [selected,setSelected]=useState(''),[filter,setFilter]=useState('active'),[search,setSearch]=useState('');
 const [draft,setDraft]=useState<Details>(fresh),[editing,setEditing]=useState(false),[showForm,setShowForm]=useState(desk);
 const [reply,setReply]=useState(''),[alternative,setAlternative]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[loaded,setLoaded]=useState(false),[online,setOnline]=useState(false);
 const [updated,setUpdated]=useState(''),[sheet,setSheet]=useState<{enabled:boolean;pending:boolean;last_synced_at?:string;error?:string}|null>(null);
 const [receipt,setReceipt]=useState('');
 const lock=useRef(false),loading=useRef(false),seen=useRef<Map<string,number>|null>(null),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;setTest(new URLSearchParams(location.search).get('test')==='1');setTestReady(true);return()=>{mounted.current=false}},[]);
 const refresh=useCallback(async()=>{
  if(!db||!testReady||loading.current)return;
  loading.current=true;
  try{
   const [r,g,a,s]=await Promise.all([
    db.from('reservations').select('id,game_id,player_name,player_name_en,player_name_ko,arrival_at,party_size,guest_note,status,version,request_kind,proposed,staff_reply,alternative_at,updated_actor,updated_at,created_at,source,is_test,contact_required').eq('is_test',test).order('created_at',{ascending:false}).limit(1000),
    db.from('reservation_games').select('*').eq('is_test',test).order('starts_at',{ascending:false}),
    db.from('reservation_audit').select('id,reservation_id,action,new_status,actor_name,created_at').order('id',{ascending:false}).limit(300),
    db.rpc('reservation_sheet_status')]);
   if(r.error||g.error||a.error)throw Error('연결 실패 · Mất kết nối. 다시 시도하세요 / Thử lại.');
   if(!mounted.current)return;
   const rows=(r.data||[]) as Booking[];
   if(seen.current){const changes=rows.filter(b=>seen.current!.get(b.id)!==b.version);if(changes.length){const b=changes[0];setNotice(b.status==='confirmed'&&!needsReview(b)?`예약이 확정되었습니다 · Đã xác nhận: ${b.player_name}`:`예약 업데이트 · Cập nhật: ${b.player_name} · ${b.request_kind==='change'?'변경 승인 대기 · Chờ sửa':b.request_kind==='cancel'?'취소 승인 대기 · Chờ hủy':labels[b.status]}`)}}
   seen.current=new Map(rows.map(b=>[b.id,b.version]));
   setBookings(rows);setGames(g.data||[]);setAudit(a.data||[]);if(!s.error)setSheet(s.data);
   setLoaded(true);setOnline(true);setUpdated(new Date().toISOString());
  }catch(e){if(mounted.current){setOnline(false);setError(e instanceof Error?e.message:'Connection failed')}}finally{loading.current=false}
 },[test,testReady]);
 useEffect(()=>{if(!testReady)return;seen.current=null;void refresh();const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh()},2000);const focus=()=>void refresh();window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);return()=>{clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus)}},[refresh,testReady]);
 useEffect(()=>{if(!db||!testReady)return;const client=db;const channel=client.channel('operational-'+workspace+'-'+crypto.randomUUID()).on('postgres_changes',{event:'*',schema:'public',table:'reservations'},()=>void refresh()).subscribe();return()=>{void client.removeChannel(channel)}},[refresh,workspace,testReady]);
 const available=games.filter(g=>g.is_open&&(g.is_default_queue||Date.parse(g.starts_at)>Date.now()-12*3600000));
 useEffect(()=>{if(!draft.game_id&&available.length===1)setDraft(d=>({...d,game_id:available[0].id}))},[available,draft.game_id]);
 const rows=bookings.filter(b=>(filter==='all'||filter==='review'&&needsReview(b)||filter==='active'&&active(b))&&(!search||b.player_name.toLowerCase().includes(search.toLowerCase())));
 const current=bookings.find(b=>b.id===selected)||rows[0];
 useEffect(()=>{setReply('');setAlternative('');setReceipt('');setEditing(false)},[current?.id]);
 const gameLabel=(id:string)=>{const g=games.find(x=>x.id===id);return g?`${g.title}${g.is_default_queue?'':` · Table ${g.table_no} / No.${g.game_no} · ${clock(g.starts_at)}`}`:'—'};
 async function run(action:string,data:Record<string,unknown>={}){
  if(!db||!current||lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');setSelected(current.id);
  const scope='staff:'+current.id;const body={p_id:current.id,p_version:current.version,p_action:action,p_data:data};
  try{const {error}=await db.rpc('staff_reservation_command',{...body,p_command:reservationCommand(scope,body)});if(error)throw error;forgetReservationCommand(scope);setNotice('저장되었습니다 · Đã lưu');if(editing)setDraft({...fresh(),game_id:current.game_id});setEditing(false);setReply('');setAlternative('');await refresh()}
  catch(e){setError('저장 결과를 확인하세요. 같은 작업 재시도는 중복되지 않습니다. · Kiểm tra rồi thử lại. '+(e as Error).message);await refresh()}
  finally{lock.current=false;setBusy(false)}
 }
 async function submit(e:React.FormEvent){
  e.preventDefault();if(!db||lock.current)return;
  const details={...draft,arrival_at:new Date(draft.arrival_at+'+07:00').toISOString()};
  if(editing){await run('request_change',details);return}
  lock.current=true;setBusy(true);setError('');setNotice('');
  const data={...details,source:'desk'},scope='desk-create';
  try{const {data:result,error}=await db.rpc('submit_reservation_request',{p_command:reservationCommand(scope,data),p_data:data});if(error)throw error;forgetReservationCommand(scope);setSelected(result.reservation_id);setDraft({...fresh(),game_id:draft.game_id});setNotice('캐셔에게 요청했습니다 · Đã gửi thu ngân. 아직 확정 전입니다.');await refresh()}
  catch(e){setError('요청을 확인하지 못했습니다 · Chưa xác nhận yêu cầu: '+(e as Error).message)}finally{lock.current=false;setBusy(false)}
 }
 async function prepareTest(){if(!db)return;setBusy(true);const {error}=await db.rpc('reservation_test_game');setBusy(false);if(error)setError(error.message);else await refresh()}
 async function checkReceipt(){if(!db||!current)return;setReceipt('조회 중 · Đang kiểm tra…');try{const {data:{session}}=await db.auth.getSession();const r=await fetch('/api/reservation-sheet/receipt?id='+encodeURIComponent(current.id),{headers:{Authorization:'Bearer '+session?.access_token}});const body=await r.json();if(!r.ok)throw Error(body.error||'조회 실패');setReceipt(body.message)}catch(e){setReceipt('조회 실패 · Không thể kiểm tra: '+(e as Error).message)}}
 const form=<form className={styles.form} onSubmit={submit}><h2>{editing?'변경 요청 · Yêu cầu sửa':'예약 요청 · Yêu cầu đặt chỗ'}</h2><label>이름 (영문) · Tên tiếng Anh<input required minLength={2} maxLength={80} value={draft.player_name_en} onChange={e=>setDraft({...draft,player_name_en:e.target.value})} placeholder="KIM JI WON"/></label><label>게임 · Trò chơi<select required value={draft.game_id} onChange={e=>setDraft({...draft,game_id:e.target.value})}><option value="">선택 · Chọn</option>{available.map(g=><option key={g.id} value={g.id}>{gameLabel(g.id)}</option>)}</select></label><div className={styles.pair}><label>도착 예정 (VN) · Giờ đến<input required type="datetime-local" value={draft.arrival_at} onChange={e=>setDraft({...draft,arrival_at:e.target.value})}/></label><label>인원 · Số người<input required type="number" min={1} max={30} value={draft.party_size} onChange={e=>setDraft({...draft,party_size:Number(e.target.value)})}/></label></div><label>메모 · Ghi chú<textarea rows={2} maxLength={500} value={draft.guest_note} onChange={e=>setDraft({...draft,guest_note:e.target.value})}/></label><button className={styles.primary} disabled={busy||!online}>{busy?'저장 중 · Đang lưu…':editing?'변경 승인 요청 · Gửi sửa đổi':'예약 요청 보내기 · Gửi yêu cầu'}</button>{editing&&<button type="button" onClick={()=>{setEditing(false);setDraft(fresh())}}>변경 닫기 · Đóng</button>}<small>카톡 내용 직접 입력 · Nhập thủ công từ KakaoTalk. 자동 수신은 연결되지 않았습니다.</small></form>;
 return <section className={styles.workspace}>
 <header className={styles.top}><div><h1>{desk?'한국인 데스크 · Bàn Hàn Quốc':'캐셔 · Thu ngân'}</h1><small>{profileName} · {test?'검증 전용 · TEST':'실제 운영 · LIVE'}</small></div><nav><a href={(desk?'/cashier':'/desk')+(test?'?test=1':'')}>{desk?'캐셔 화면':'데스크 화면'}</a><a href="/">손님 화면</a><button onClick={onLogout}>로그아웃</button></nav></header>
 {test&&<div className={styles.warning}>운영 검증 데이터 · Dữ liệu kiểm tra. Telegram·정산시트로 전송되지 않습니다. {admin&&!games.length&&<button onClick={()=>void prepareTest()} disabled={busy}>검증 게임 준비</button>}</div>}
 <div className={styles.connection}><span className={online?styles.connected:styles.disconnected}>{online?'● 연결됨 · Đã kết nối':'● 연결 확인 필요 · Mất kết nối'}</span><span>2초 간격 자동 확인 · {clock(updated)} (VN)</span><button onClick={()=>{setError('');void refresh()}}>다시 확인 · Làm mới</button></div>
 {error&&<div role="alert" className={styles.warning}>{error}</div>}{notice&&<div role="status" className={styles.notice}>{notice}</div>}
 <div className={styles.metrics}><span>미처리 · Chờ duyệt <b>{bookings.filter(needsReview).length}</b></span><span>확정 인원 · Đã xác nhận <b>{bookings.filter(b=>['confirmed','checked_in'].includes(b.status)).reduce((n,b)=>n+b.party_size,0)}</b></span><span>도착 · Đã đến <b>{bookings.filter(b=>b.status==='checked_in').reduce((n,b)=>n+b.party_size,0)}</b></span></div>
 <div className={styles.columns}><aside><button className={styles.newRequest} onClick={()=>{setShowForm(v=>!v);setEditing(false);setDraft(fresh())}}>＋ 예약 등록 · Thêm yêu cầu</button>{showForm&&!editing&&form}<div className={styles.filters}><input aria-label="이름 검색" placeholder="이름 검색 · Tìm tên" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="예약 상태 필터" value={filter} onChange={e=>setFilter(e.target.value)}><option value="active">진행 중 · Đang xử lý</option><option value="review">미처리 · Chờ duyệt</option><option value="all">전체 · Tất cả</option></select></div><div className={styles.list}>{!loaded?<p>불러오는 중 · Đang tải…</p>:!rows.length?<p>예약이 없습니다 · Chưa có đặt chỗ</p>:rows.map(b=><button key={b.id} className={`${styles.card} ${current?.id===b.id?styles.selected:''}`} onClick={()=>setSelected(b.id)}><span className={styles.cardTop}><strong>{b.player_name}</strong><b>{b.party_size}명</b></span><small>{gameLabel(b.game_id)}</small><span>{clock(b.arrival_at)} (VN)</span><span className={needsReview(b)?styles.waiting:styles.status}>{b.request_kind==='change'?'변경 승인 대기 · Chờ sửa':b.request_kind==='cancel'?'취소 승인 대기 · Chờ hủy':labels[b.status]}</span></button>)}</div></aside>
 <article className={styles.detail}>{!current?<h2>예약을 선택하세요 · Chọn đặt chỗ</h2>:<><div className={styles.detailHead}><h2>{current.player_name}</h2><strong>{labels[current.status]}</strong></div><dl><dt>게임 · Trò chơi</dt><dd>{gameLabel(current.game_id)}</dd><dt>도착 예정 · Giờ đến</dt><dd>{clock(current.arrival_at)} (VN)</dd><dt>인원 · Số người</dt><dd>{current.party_size}</dd><dt>메모 · Ghi chú</dt><dd>{current.guest_note||'—'}</dd></dl>{current.status==='confirmed'&&current.request_kind==='none'&&<p className={styles.confirmed}>예약이 확정되었습니다 · Đặt chỗ đã được xác nhận.</p>}
 {['change','cancel'].includes(current.request_kind)&&<section className={styles.proposal}><h3>{actions['request_'+current.request_kind]}</h3>{current.request_kind==='change'?<><p>{current.proposed.player_name_en} · {current.proposed.party_size}명</p><p>{gameLabel(current.proposed.game_id||'')}</p><p>{clock(current.proposed.arrival_at)} (VN)</p><p>{current.proposed.guest_note}</p></>:<p>{current.proposed.reason||'취소를 요청했습니다 · Yêu cầu hủy'}</p>}<small>승인 전에는 기존 예약이 유지됩니다 · Giữ nguyên đặt chỗ đến khi duyệt.</small></section>}
 {current.staff_reply&&<section className={styles.reply}><h3>캐셔 답변 · Phản hồi thu ngân</h3><p>{current.staff_reply}</p>{current.alternative_at&&<p>대안 시간 · Giờ đề xuất: {clock(current.alternative_at)} (VN)</p>}</section>}
 {active(current)&&<><div className={styles.actions}><button disabled={busy||!online} onClick={()=>{setDraft({...current,player_name_en:current.player_name_en||current.player_name,arrival_at:localTime(current.arrival_at)});setEditing(true)}}>변경 요청 · Yêu cầu sửa</button><button disabled={busy||!online||current.request_kind==='cancel'} onClick={()=>void run('request_cancel',{reason:reply})}>취소 요청 · Yêu cầu hủy</button></div>{editing&&form}
 {!desk&&<section className={styles.cashier}><label>답변 / 사유 · Phản hồi / Lý do<textarea rows={3} maxLength={500} value={reply} onChange={e=>setReply(e.target.value)} placeholder="간단한 영어도 가능합니다 · Có thể dùng tiếng Anh đơn giản"/></label><label>대안 시간 (선택) · Giờ khác (tùy chọn)<input type="datetime-local" value={alternative} onChange={e=>setAlternative(e.target.value)}/></label><div className={styles.actions}>{(needsReview(current)||current.status==='waitlisted')&&<><button className={styles.primary} disabled={busy||!online} onClick={()=>void run('approve',{reply})}>{current.request_kind==='cancel'?'취소 승인 · Duyệt hủy':'승인 · CONFIRM'}</button><button disabled={busy||!online||!reply.trim()} onClick={()=>void run('reject',{reply})}>거절 · Từ chối</button><button disabled={busy||!online||!reply.trim()} onClick={()=>void run('suggest',{reply,alternative_at:alternative?new Date(alternative+'+07:00').toISOString():null})}>조정 제안 · Đề xuất</button></>}{current.status==='confirmed'&&current.request_kind==='none'&&<><button className={styles.primary} disabled={busy||!online} onClick={()=>void run('check_in')}>도착 확인 · Đã đến</button><button disabled={busy||!online} onClick={()=>void run('no_show')}>미방문 확인 · Không đến</button><button disabled={busy||!online} onClick={()=>void run('cancel',{reply})}>예약 취소 · CANCEL</button></>}</div></section>}</>}
 <section className={styles.receipt}><strong>정산 · Đối soát</strong><p>바이인·금액은 영수증 스캔으로만 기록합니다. 예약·도착 확인으로 금액을 만들지 않습니다.</p><p>Chỉ ghi nhận buy-in từ ảnh biên lai. Đặt chỗ không tạo giao dịch.</p>{!test&&<button disabled={busy} onClick={()=>void checkReceipt()}>영수증 정산 기록 확인 · Kiểm tra biên lai</button>}{receipt&&<p role="status">{receipt}</p>}</section>
 <details className={styles.history}><summary>처리 이력 · Lịch sử</summary>{audit.filter(a=>a.reservation_id===current.id).map(a=><p key={a.id}><strong>{actions[a.action||'']||labels[a.new_status]}</strong><br/>{a.actor_name||'Staff'} · {clock(a.created_at)} (VN)</p>)}</details><small>최근 처리 · Cập nhật: {current.updated_actor||'—'} · {clock(current.updated_at)}</small></>}</article></div>
 <footer className={styles.footer}><p>화면 내 자동 알림 · Thông báo trên màn hình. 앱 종료 후 푸시 알림은 제공되지 않습니다.</p><p>예약현황 시트: {sheet?.enabled?sheet.error?'연결 오류 · Lỗi kết nối':sheet.pending?'반영 대기 · Đang đồng bộ':`동기화됨 · Đã đồng bộ ${clock(sheet.last_synced_at)}`:'연결 준비 중 · Chưa kết nối'}. 영수증 정산과 별도 관리.</p><a href="https://docs.google.com/spreadsheets/d/1QJUPswetSgSFAlKkDXdY_WMmM6LCp6nXs9EvmuQF22I/edit" target="_blank" rel="noreferrer">일일정산시트 열기 ↗</a><button onClick={()=>setTools(v=>!v)}>게임·계정·Telegram 관리 {tools?'닫기':'열기'}</button>{admin&&<a href={'/'+workspace+(test?'':'?test=1')}>{test?'실제 운영으로':'운영 검증 모드'}</a>}</footer>{tools&&management}
 </section>;
}
