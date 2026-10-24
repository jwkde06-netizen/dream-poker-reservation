"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {db} from '../lib/db';
import {reservationCommand,forgetReservationCommand} from '../lib/reservation-command';
import {reservationCopy,reservationError,type ReservationLanguage,type ReceiptEvidenceCode} from '../lib/reservation-ui';
import styles from './OperationalReservations.module.css';

type Game={id:string;title:string;starts_at:string;is_open:boolean;is_default_queue?:boolean;is_test?:boolean;table_no:string;game_no?:string;capacity:number};
type Details={game_id:string;player_name_en:string;player_name_ko?:string;arrival_at:string;party_size:number;guest_note:string};
type Booking=Details&{id:string;player_name:string;status:string;version:number;request_kind:string;proposed:Partial<Details>&{reason?:string};staff_reply:string;alternative_at?:string;updated_actor:string;updated_at:string;created_at:string;source:string;is_test:boolean;contact_required:boolean};
type Audit={id:number;reservation_id:string;action?:string;new_status:string;actor_name?:string;created_at:string};
type Notice={kind:'saved'|'submitted'|'update';booking?:Booking};
type Failure={kind:'connection'|'save'|'submit'|'test';message?:string};
const localTime=(s:string)=>new Date(new Date(s).getTime()+7*3600000).toISOString().slice(0,16);
const fresh=():Details=>({game_id:'',player_name_en:'',arrival_at:localTime(new Date(Date.now()+30*60000).toISOString()),party_size:1,guest_note:''});
const needsReview=(b:Booking)=>b.status==='pending'||['change','cancel'].includes(b.request_kind);
const active=(b:Booking)=>['pending','waitlisted','confirmed'].includes(b.status);

export default function OperationalReservations({workspace,lang,profileName,admin,onLogout,management}:{lang:ReservationLanguage;workspace:'desk'|'cashier';profileName:string;admin:boolean;onLogout:()=>void;management:React.ReactNode}){
 const desk=workspace==='desk',t=reservationCopy[lang];
 const labels:Record<string,string>=t.statuses,actions:Record<string,string>=t.actions;
 const clock=(value?:string)=>value?new Date(value).toLocaleString(lang==='ko'?'ko-KR':lang==='vi'?'vi-VN':'en-GB',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'—';
 const people=(count:number)=>`${count}${lang==='ko'?'':' '}${count===1?t.person:t.people}`;
 const [test,setTest]=useState(false),[testReady,setTestReady]=useState(false),[tools,setTools]=useState(false);
 const [games,setGames]=useState<Game[]>([]),[bookings,setBookings]=useState<Booking[]>([]),[audit,setAudit]=useState<Audit[]>([]);
 const [selected,setSelected]=useState(''),[filter,setFilter]=useState(desk?'active':'review'),[search,setSearch]=useState('');
 const [draft,setDraft]=useState<Details>(fresh),[editing,setEditing]=useState(false),[showForm,setShowForm]=useState(desk);
 const [decision,setDecision]=useState<'reject'|'suggest'|null>(null),[detailOpen,setDetailOpen]=useState(false);
 const [reply,setReply]=useState(''),[alternative,setAlternative]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState<Failure|null>(null),[notice,setNotice]=useState<Notice|null>(null),[loaded,setLoaded]=useState(false),[online,setOnline]=useState(false);
 const [updated,setUpdated]=useState(''),[sheet,setSheet]=useState<{enabled:boolean;pending:boolean;last_synced_at?:string;error?:string}|null>(null);
 const [receipt,setReceipt]=useState<ReceiptEvidenceCode|'loading'|'error'|''>('');
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
   if(r.error||g.error||a.error)throw Error('Connection failed');
   if(!mounted.current)return;
   const rows=(r.data||[]) as Booking[];
   if(seen.current){const changes=rows.filter(b=>seen.current!.get(b.id)!==b.version);if(changes.length){const b=changes[0];setNotice({kind:'update',booking:b})}}
   seen.current=new Map(rows.map(b=>[b.id,b.version]));
   setBookings(rows);setGames(g.data||[]);setAudit(a.data||[]);if(!s.error)setSheet(s.data);
   setLoaded(true);setOnline(true);setUpdated(new Date().toISOString());
  }catch(e){if(mounted.current){setOnline(false);setError({kind:'connection'})}}finally{loading.current=false}
 },[test,testReady]);
 useEffect(()=>{if(!testReady)return;seen.current=null;void refresh();const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh()},2000);const focus=()=>void refresh();window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);return()=>{clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus)}},[refresh,testReady]);
 useEffect(()=>{if(!db||!testReady)return;const client=db;const channel=client.channel('operational-'+workspace+'-'+crypto.randomUUID()).on('postgres_changes',{event:'*',schema:'public',table:'reservations'},()=>void refresh()).subscribe();return()=>{void client.removeChannel(channel)}},[refresh,workspace,testReady]);
 const available=games.filter(g=>g.is_open&&(g.is_default_queue||Date.parse(g.starts_at)>Date.now()-12*3600000));
 useEffect(()=>{if(!draft.game_id&&available.length===1)setDraft(d=>({...d,game_id:available[0].id}))},[available,draft.game_id]);
 const rows=bookings.filter(b=>(filter==='all'||filter==='review'&&needsReview(b)||filter==='active'&&active(b)||filter==='confirmed'&&b.status==='confirmed'||filter==='arrived'&&b.status==='checked_in')&&(!search||b.player_name.toLowerCase().includes(search.toLowerCase())));
 const current=bookings.find(b=>b.id===selected)||rows[0];
 useEffect(()=>{setReply('');setAlternative('');setReceipt('');setEditing(false);setDecision(null)},[current?.id]);
 const gameLabel=(id:string)=>{const g=games.find(x=>x.id===id);return g?g.is_default_queue?(g.is_test?t.testGame:t.nextGame):`${g.title} · ${t.table} ${g.table_no} / ${t.gameNo} ${g.game_no} · ${clock(g.starts_at)}`:'—'};
 async function run(action:string,data:Record<string,unknown>={}){
  if(!db||!current||lock.current)return;lock.current=true;setBusy(true);setError(null);setNotice(null);setSelected(current.id);
  const scope='staff:'+current.id;const body={p_id:current.id,p_version:current.version,p_action:action,p_data:data};
  try{const {error}=await db.rpc('staff_reservation_command',{...body,p_command:reservationCommand(scope,body)});if(error)throw error;forgetReservationCommand(scope);setNotice({kind:'saved'});if(editing)setDraft({...fresh(),game_id:current.game_id});setEditing(false);setReply('');setAlternative('');setDecision(null);await refresh()}
  catch(e){setError({kind:'save',message:(e as Error).message});await refresh()}
  finally{lock.current=false;setBusy(false)}
 }
 async function submit(e:React.FormEvent){
  e.preventDefault();if(!db||lock.current)return;
  const details={...draft,arrival_at:new Date(draft.arrival_at+'+07:00').toISOString()};
  if(editing){await run('request_change',details);return}
  lock.current=true;setBusy(true);setError(null);setNotice(null);
  const data={...details,source:'desk'},scope='desk-create';
  try{const {data:result,error}=await db.rpc('submit_reservation_request',{p_command:reservationCommand(scope,data),p_data:data});if(error)throw error;forgetReservationCommand(scope);setSelected(result.reservation_id);setDraft({...fresh(),game_id:draft.game_id});setNotice({kind:'submitted'});await refresh()}
  catch(e){setError({kind:'submit',message:(e as Error).message})}finally{lock.current=false;setBusy(false)}
 }
 async function prepareTest(){if(!db)return;setBusy(true);const {error}=await db.rpc('reservation_test_game');setBusy(false);if(error)setError({kind:'test',message:error.message});else await refresh()}
 async function checkReceipt(){if(!db||!current)return;setReceipt('loading');try{const {data:{session}}=await db.auth.getSession();const r=await fetch('/api/reservation-sheet/receipt?id='+encodeURIComponent(current.id),{headers:{Authorization:'Bearer '+session?.access_token}});const body=await r.json();if(!r.ok)throw Error(body.error||'Receipt lookup failed');setReceipt(Object.hasOwn(t.receipt,body.code)?body.code:'error')}catch(e){setReceipt('error')}}
 const bookingStatus=(b:Booking)=>b.request_kind==='change'?t.changeWaiting:b.request_kind==='cancel'?t.cancelWaiting:labels[b.status]||'—';
 const noticeText=notice?.kind==='saved'?t.saved:notice?.kind==='submitted'?t.submitted:notice?.booking?`${notice.booking.status==='confirmed'&&!needsReview(notice.booking)?t.confirmed:t.updateNotice+':'} ${notice.booking.player_name}${notice.booking.status==='confirmed'&&!needsReview(notice.booking)?'':` · ${bookingStatus(notice.booking)}`}`:'';
 const errorText=error?.kind==='connection'?t.connectionError:error?`${error.kind==='save'?t.saveError:error.kind==='submit'?t.submitError:''} ${reservationError(error.message||'',lang)}`:'';
 const receiptText=receipt==='loading'?t.checking:receipt==='error'?t.receiptError:receipt?t.receipt[receipt]:'';
 const form=<form className={styles.form} onSubmit={submit}><h2>{editing?t.changeRequest:t.request}</h2><label>{t.name}<input required minLength={2} maxLength={80} value={draft.player_name_en} onChange={e=>setDraft({...draft,player_name_en:e.target.value})} placeholder="KIM JI WON"/></label><label>{t.game}<select required value={draft.game_id} onChange={e=>setDraft({...draft,game_id:e.target.value})}><option value="">{t.choose}</option>{available.map(g=><option key={g.id} value={g.id}>{gameLabel(g.id)}</option>)}</select></label><div className={styles.pair}><label>{t.arrivalVN}<input required type="datetime-local" value={draft.arrival_at} onChange={e=>setDraft({...draft,arrival_at:e.target.value})}/></label><label>{t.guests}<input required type="number" min={1} max={30} value={draft.party_size} onChange={e=>setDraft({...draft,party_size:Number(e.target.value)})}/></label></div><label>{t.note}<textarea rows={2} maxLength={500} value={draft.guest_note} onChange={e=>setDraft({...draft,guest_note:e.target.value})}/></label><button className={styles.primary} disabled={busy||!online}>{busy?t.saving:editing?t.submitChange:t.submit}</button>{editing&&<button type="button" onClick={()=>{setEditing(false);setDraft(fresh())}}>{t.closeChange}</button>}<small>{t.manual}</small></form>;
 if(!desk&&tools)return <div className={styles.managementView} lang={lang}><button className={styles.managementBack} onClick={()=>setTools(false)}>← {t.backToReservations}</button>{management}</div>;
 if(!desk){
  const groups=[{id:'review',label:t.pendingCount,count:bookings.filter(needsReview).length},{id:'confirmed',label:t.statuses.confirmed,count:bookings.filter(b=>b.status==='confirmed').length},{id:'arrived',label:t.arrivedCount,count:bookings.filter(b=>b.status==='checked_in').length},{id:'all',label:t.all,count:bookings.length}];
  return <section className={`${styles.workspace} ${styles.cashierWorkspace}`} data-workspace="cashier" lang={lang}>
   <header className={styles.cashierTop}>
    <div className={styles.cashierTitle}><h1>{t.cashier}</h1><span className={online?styles.connected:styles.disconnected}>● {online?t.connected:t.disconnected}</span>{test&&<span className={styles.testBadge}>{t.test}</span>}</div>
    <nav><button onClick={()=>setTools(true)}>{t.manage}</button><details className={styles.workspaceMenu}><summary aria-label={t.workspaceMenu}>•••</summary><div><small>{profileName}</small><a href={'/desk'+(test?'?test=1':'')}>{t.desk}</a><a href="/">{t.guestPage}</a><button onClick={onLogout}>{t.logout}</button></div></details></nav>
   </header>
   {test&&<div className={styles.warning}>{t.testWarning}{admin&&!games.length&&<button onClick={()=>void prepareTest()} disabled={busy}>{t.prepareTest}</button>}</div>}
   {error&&<div role="alert" className={styles.warning}>{errorText}<button disabled={busy} onClick={()=>{setError(null);void refresh()}}>{t.refresh}</button></div>}
   {notice&&<div role="status" className={styles.compactNotice}><span>{noticeText}</span><button aria-label={t.dismiss} onClick={()=>setNotice(null)}>×</button></div>}
   <div className={styles.filterTabs} role="group" aria-label={t.statusFilter}>{groups.map(g=><button key={g.id} aria-pressed={filter===g.id} onClick={()=>{setFilter(g.id);setSelected('');setDetailOpen(false)}}>{g.label}<b>{g.count}</b></button>)}</div>
   <div className={styles.cashierColumns} data-detail-open={detailOpen}>
    <aside className={styles.queue}>
     <div className={styles.queueHeading}><h2>{t.queueTitle}</h2><button aria-expanded={showForm} onClick={()=>{setShowForm(v=>!v);setEditing(false);setDraft(fresh())}}>＋ {t.add}</button></div>
     {showForm&&!editing&&form}
     <input className={styles.queueSearch} aria-label={t.search} placeholder={t.search} value={search} onChange={e=>{setSearch(e.target.value);setSelected('')}}/>
     <div className={styles.cashierList}>{!loaded?<p className={styles.emptyQueue}>{t.loading}</p>:!rows.length?<div className={styles.emptyQueue}><span>✓</span><h2>{search?t.searchEmpty:filter==='review'?t.reviewEmpty:t.empty}</h2>{!search&&filter==='review'&&<p>{t.reviewEmptyHelp}</p>}</div>:rows.map(b=><button key={b.id} className={`${styles.cashierCard} ${current?.id===b.id?styles.selected:''}`} aria-pressed={current?.id===b.id} onClick={()=>{setSelected(b.id);setDetailOpen(true);setShowForm(false)}}>
      <span className={styles.cardTop}><strong>{b.player_name}</strong><span>{people(b.party_size)}</span></span>
      <small>{gameLabel(b.game_id)}</small><span className={styles.cardBottom}><time>{clock(b.arrival_at)} (VN)</time><span className={styles.pill} data-status={needsReview(b)?'pending':b.status}>{bookingStatus(b)}</span></span>
     </button>)}</div>
    </aside>
    <article className={styles.cashierDetail}>
     <button className={styles.mobileBack} onClick={()=>setDetailOpen(false)}>← {t.backToList}</button>
     {!current?<div className={styles.emptyDetail}><span>♠</span><h2>{t.selectBooking}</h2></div>:<>
      <header className={styles.reservationHeading}><div><small>{t.request}</small><h2>{current.player_name}</h2></div><span className={styles.pill} data-status={needsReview(current)?'pending':current.status}>{bookingStatus(current)}</span></header>
      <dl className={styles.cashierFacts}><div className={styles.gameFact}><dt>{t.game}</dt><dd>{gameLabel(current.game_id)}</dd></div><div><dt>{t.arrivalVN}</dt><dd>{clock(current.arrival_at)}</dd></div><div><dt>{t.guests}</dt><dd>{people(current.party_size)}</dd></div></dl>
      {current.guest_note&&<div className={styles.guestNote}><strong>{t.note}</strong><p>{current.guest_note}</p></div>}
      {['change','cancel'].includes(current.request_kind)&&<section className={styles.proposal}><h3>{actions['request_'+current.request_kind]}</h3>{current.request_kind==='change'?<><p>{current.proposed.player_name_en} · {people(current.proposed.party_size||1)}</p><p>{gameLabel(current.proposed.game_id||'')}</p><p>{clock(current.proposed.arrival_at)} (VN)</p><p>{current.proposed.guest_note}</p></>:<p>{current.proposed.reason||t.cancelRequested}</p>}<small>{t.keepOriginal}</small></section>}
      {active(current)&&<section className={styles.decisionArea}>
       {(needsReview(current)||current.status==='waitlisted')&&<>
        <div className={styles.primaryActions}><button className={styles.confirmAction} disabled={busy||!online} onClick={()=>void run('approve',{reply})}>{busy?t.saving:current.request_kind==='cancel'?t.approveCancel:t.approve}</button><button className={styles.rejectAction} aria-expanded={decision==='reject'} disabled={busy||!online} onClick={()=>setDecision(decision==='reject'?null:'reject')}>{t.reject}</button></div>
        <button className={styles.suggestAction} aria-expanded={decision==='suggest'} disabled={busy||!online} onClick={()=>setDecision(decision==='suggest'?null:'suggest')}>{t.suggest} →</button>
        {decision&&<form className={styles.replyForm} onSubmit={e=>{e.preventDefault();if(reply.trim())void run(decision,{reply,alternative_at:decision==='suggest'&&alternative?new Date(alternative+'+07:00').toISOString():null})}}><label>{t.reply}<textarea autoFocus required rows={2} maxLength={500} value={reply} onChange={e=>setReply(e.target.value)} placeholder={t.replyRequired}/></label>{decision==='suggest'&&<label>{t.alternativeOptional}<input type="datetime-local" value={alternative} onChange={e=>setAlternative(e.target.value)}/></label>}<div className={styles.replyButtons}><button type="button" onClick={()=>setDecision(null)}>{t.dismiss}</button><button className={decision==='reject'?styles.rejectAction:styles.primary} disabled={busy||!online||!reply.trim()}>{busy?t.saving:decision==='reject'?t.reject:t.sendReply}</button></div></form>}
       </>}
       {current.status==='confirmed'&&current.request_kind==='none'&&<><p className={styles.confirmed}>✓ {t.confirmed}</p><div className={styles.primaryActions}><button className={styles.confirmAction} disabled={busy||!online} onClick={()=>void run('check_in')}>{t.checkIn}</button></div></>}
      </section>}
      {current.staff_reply&&<section className={styles.reply}><h3>{t.cashierReply}</h3><p>{current.staff_reply}</p>{current.alternative_at&&<p>{t.alternative}: {clock(current.alternative_at)} (VN)</p>}</section>}
      {active(current)&&<details className={styles.fold} key={'actions-'+current.id}><summary>{t.moreActions}</summary><div className={styles.secondaryActions}><button disabled={busy||!online} onClick={()=>{setDraft({...current,player_name_en:current.player_name_en||current.player_name,arrival_at:localTime(current.arrival_at)});setEditing(true)}}>{t.changeRequest}</button><button disabled={busy||!online||current.request_kind==='cancel'} onClick={()=>void run('request_cancel',{reason:reply})}>{t.cancelRequest}</button>{current.status==='confirmed'&&current.request_kind==='none'&&<><button disabled={busy||!online} onClick={()=>void run('no_show')}>{t.noShow}</button><button disabled={busy||!online} onClick={()=>void run('cancel',{reply})}>{t.cancel}</button></>}</div>{editing&&form}</details>}
      <details className={styles.fold} key={'receipt-'+current.id}><summary>{t.settlement}</summary><p>{t.receiptHelp}</p>{!test&&<button disabled={busy||receipt==='loading'} onClick={()=>void checkReceipt()}>{t.receiptCheck}</button>}{receipt&&<p role="status">{receiptText}</p>}</details>
      <details className={styles.fold} key={'history-'+current.id}><summary>{t.history}</summary>{audit.filter(a=>a.reservation_id===current.id).map(a=><p key={a.id}><strong>{actions[a.action||'']||labels[a.new_status]}</strong><br/>{a.actor_name||t.staff} · {clock(a.created_at)} (VN)</p>)}</details>
      <small className={styles.lastAction}>{t.updated}: {current.updated_actor||'—'} · {clock(current.updated_at)}</small>
     </>}
    </article>
   </div>
   <div className={styles.quietFooter}><details><summary>{t.connectionDetails}</summary><p>{t.notifications}</p><p>{t.polling} · {clock(updated)} (VN)</p><p>{t.sheet}: {sheet?.enabled?sheet.error?t.sheetError:sheet.pending?t.sheetPending:t.sheetSynced:t.sheetOff}. {t.sheetSeparate}</p>{admin&&<a href={'/cashier'+(test?'':'?test=1')}>{test?t.liveMode:t.testMode}</a>}</details><a href="https://docs.google.com/spreadsheets/d/1QJUPswetSgSFAlKkDXdY_WMmM6LCp6nXs9EvmuQF22I/edit" target="_blank" rel="noreferrer">{t.openSheet} ↗</a><button onClick={()=>{setError(null);void refresh()}}>{t.refresh}</button></div>
  </section>;
 }
 return <section className={styles.workspace} lang={lang}>
 <header className={styles.top}><div><h1>{desk?t.desk:t.cashier}</h1><small>{profileName} · {test?t.test:t.live}</small></div><nav><a href={(desk?'/cashier':'/desk')+(test?'?test=1':'')}>{desk?t.cashier:t.desk}</a><a href="/">{t.guestPage}</a><button onClick={onLogout}>{t.logout}</button></nav></header>
 {test&&<div className={styles.warning}>{t.testWarning}{admin&&!games.length&&<button onClick={()=>void prepareTest()} disabled={busy}>{t.prepareTest}</button>}</div>}
 <div className={styles.connection}><span className={online?styles.connected:styles.disconnected}>{online?'● '+t.connected:'● '+t.disconnected}</span><span>{t.polling} · {clock(updated)} (VN)</span><button onClick={()=>{setError(null);void refresh()}}>{t.refresh}</button></div>
 {error&&<div role="alert" className={styles.warning}>{errorText}</div>}{notice&&<div role="status" className={styles.notice}>{noticeText}</div>}
 <div className={styles.metrics}><span>{t.pendingCount} <b>{bookings.filter(needsReview).length}</b></span><span>{t.confirmedCount} <b>{bookings.filter(b=>['confirmed','checked_in'].includes(b.status)).reduce((n,b)=>n+b.party_size,0)}</b></span><span>{t.arrivedCount} <b>{bookings.filter(b=>b.status==='checked_in').reduce((n,b)=>n+b.party_size,0)}</b></span></div>
 <div className={styles.columns}><aside><button className={styles.newRequest} onClick={()=>{setShowForm(v=>!v);setEditing(false);setDraft(fresh())}}>{t.add}</button>{showForm&&!editing&&form}<div className={styles.filters}><input aria-label={t.search} placeholder={t.search} value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label={t.statusFilter} value={filter} onChange={e=>setFilter(e.target.value)}><option value="active">{t.active}</option><option value="review">{t.pendingCount}</option><option value="all">{t.all}</option></select></div><div className={styles.list}>{!loaded?<p>{t.loading}</p>:!rows.length?<p>{t.empty}</p>:rows.map(b=><button key={b.id} className={`${styles.card} ${current?.id===b.id?styles.selected:''}`} onClick={()=>setSelected(b.id)}><span className={styles.cardTop}><strong>{b.player_name}</strong><b>{people(b.party_size)}</b></span><small>{gameLabel(b.game_id)}</small><span>{clock(b.arrival_at)} (VN)</span><span className={needsReview(b)?styles.waiting:styles.status}>{bookingStatus(b)}</span></button>)}</div></aside>
 <article className={styles.detail}>{!current?<h2>{t.selectBooking}</h2>:<><div className={styles.detailHead}><h2>{current.player_name}</h2><strong>{labels[current.status]}</strong></div><dl><dt>{t.game}</dt><dd>{gameLabel(current.game_id)}</dd><dt>{t.arrival}</dt><dd>{clock(current.arrival_at)} (VN)</dd><dt>{t.guests}</dt><dd>{current.party_size}</dd><dt>{t.note}</dt><dd>{current.guest_note||'—'}</dd></dl>{current.status==='confirmed'&&current.request_kind==='none'&&<p className={styles.confirmed}>{t.confirmed}</p>}
 {['change','cancel'].includes(current.request_kind)&&<section className={styles.proposal}><h3>{actions['request_'+current.request_kind]}</h3>{current.request_kind==='change'?<><p>{current.proposed.player_name_en} · {people(current.proposed.party_size||1)}</p><p>{gameLabel(current.proposed.game_id||'')}</p><p>{clock(current.proposed.arrival_at)} (VN)</p><p>{current.proposed.guest_note}</p></>:<p>{current.proposed.reason||t.cancelRequested}</p>}<small>{t.keepOriginal}</small></section>}
 {current.staff_reply&&<section className={styles.reply}><h3>{t.cashierReply}</h3><p>{current.staff_reply}</p>{current.alternative_at&&<p>{t.alternative}: {clock(current.alternative_at)} (VN)</p>}</section>}
 {active(current)&&<><div className={styles.actions}><button disabled={busy||!online} onClick={()=>{setDraft({...current,player_name_en:current.player_name_en||current.player_name,arrival_at:localTime(current.arrival_at)});setEditing(true)}}>{t.changeRequest}</button><button disabled={busy||!online||current.request_kind==='cancel'} onClick={()=>void run('request_cancel',{reason:reply})}>{t.cancelRequest}</button></div>{editing&&form}
 {!desk&&<section className={styles.cashier}><label>{t.reply}<textarea rows={3} maxLength={500} value={reply} onChange={e=>setReply(e.target.value)} placeholder={t.replyHint}/></label><label>{t.alternativeOptional}<input type="datetime-local" value={alternative} onChange={e=>setAlternative(e.target.value)}/></label><div className={styles.actions}>{(needsReview(current)||current.status==='waitlisted')&&<><button className={styles.primary} disabled={busy||!online} onClick={()=>void run('approve',{reply})}>{current.request_kind==='cancel'?t.approveCancel:t.approve}</button><button disabled={busy||!online||!reply.trim()} onClick={()=>void run('reject',{reply})}>{t.reject}</button><button disabled={busy||!online||!reply.trim()} onClick={()=>void run('suggest',{reply,alternative_at:alternative?new Date(alternative+'+07:00').toISOString():null})}>{t.suggest}</button></>}{current.status==='confirmed'&&current.request_kind==='none'&&<><button className={styles.primary} disabled={busy||!online} onClick={()=>void run('check_in')}>{t.checkIn}</button><button disabled={busy||!online} onClick={()=>void run('no_show')}>{t.noShow}</button><button disabled={busy||!online} onClick={()=>void run('cancel',{reply})}>{t.cancel}</button></>}</div></section>}</>}
 <section className={styles.receipt}><strong>{t.settlement}</strong><p>{t.receiptHelp}</p>{!test&&<button disabled={busy} onClick={()=>void checkReceipt()}>{t.receiptCheck}</button>}{receipt&&<p role="status">{receiptText}</p>}</section>
 <details className={styles.history}><summary>{t.history}</summary>{audit.filter(a=>a.reservation_id===current.id).map(a=><p key={a.id}><strong>{actions[a.action||'']||labels[a.new_status]}</strong><br/>{a.actor_name||t.staff} · {clock(a.created_at)} (VN)</p>)}</details><small>{t.updated}: {current.updated_actor||'—'} · {clock(current.updated_at)}</small></>}</article></div>
 <footer className={styles.footer}><p>{t.notifications}</p><p>{t.sheet}: {sheet?.enabled?sheet.error?t.sheetError:sheet.pending?t.sheetPending:`${t.sheetSynced} ${clock(sheet.last_synced_at)}`:t.sheetOff}. {t.sheetSeparate}</p><a href="https://docs.google.com/spreadsheets/d/1QJUPswetSgSFAlKkDXdY_WMmM6LCp6nXs9EvmuQF22I/edit" target="_blank" rel="noreferrer">{t.openSheet}</a><button onClick={()=>setTools(v=>!v)}>{tools?t.closeManagement:t.openManagement}</button>{admin&&<a href={'/'+workspace+(test?'':'?test=1')}>{test?t.liveMode:t.testMode}</a>}</footer>{tools&&management}
 </section>;
}
