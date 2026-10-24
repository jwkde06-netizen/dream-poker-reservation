'use client';
import {useEffect,useState} from 'react';
import {db} from '../../../lib/db';
import styles from './settlement.module.css';
const num=(v:any)=>typeof v==='number'?v.toLocaleString('ko-KR'):'미확인';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export default function SettlementDesk(){
 const [day,setDay]=useState(today),[salary,setSalary]=useState(''),[report,setReport]=useState<any>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[account,setAccount]=useState(''),[password,setPassword]=useState(''),[login,setLogin]=useState(false),[reviewed,setReviewed]=useState(false),[summary,setSummary]=useState('');
 const [savedText,setSavedText]=useState('');
 async function viewSaved(id:string){setBusy(true);try{const session=(await db?.auth.getSession())?.data.session;if(!session)throw Error('다시 로그인해주세요.');const r=await fetch('/api/accounting/settlement?id='+encodeURIComponent(id),{headers:{Authorization:'Bearer '+session.access_token},cache:'no-store'});const b=await r.json();if(!r.ok)throw Error(b.error);setSavedText((b.status==='confirmed'?'확정 당시 기록':'저장 당시 초안')+'\n'+b.report_text);}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 async function request(body?:any,selectedDay=day,selectedSalary=salary){
  const session=(await db?.auth.getSession())?.data.session;if(!session){setLogin(true);throw Error('기존 관리자 계정으로 로그인해주세요.');}
  const r=await fetch('/api/accounting/settlement'+(body?'':'?'+new URLSearchParams({day:selectedDay,salary:selectedSalary})),{method:body?'POST':'GET',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const result=await r.json();if(!r.ok){if(r.status===403)setLogin(true);throw Error(result.error||'처리하지 못했어요.');}return result;
 }
 async function load(d=day,s=salary){setBusy(true);setMessage('');setReviewed(false);setSummary('');setSavedText('');setReport(null);try{const r=await request(undefined,d,s);setReport(r);setLogin(false);}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 useEffect(()=>{void load();},[]);
 async function signIn(){
  if(!db)return;setBusy(true);setMessage('');
  try{let email=account.trim().toLowerCase();if(!email.includes('@')){const r=await db.rpc('resolve_login_email',{p_username:email});if(r.error||!r.data)throw Error('아이디를 확인해주세요.');email=r.data;}
   const r=await db.auth.signInWithPassword({email,password});if(r.error)throw Error('아이디와 비밀번호를 확인해주세요.');setPassword('');await load();
  }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 async function action(kind:string){if(!report)return;setBusy(true);setMessage('');try{
  const r=await request({action:kind,day:report.start,salary:report.salary,sourceHash:report.sourceHash,reviewed});
  if(kind==='summary')setSummary(r.summary);else{await load(report.start,salary);setMessage(r.message);}
 }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 const dirty=!!report&&(day<report.start||day>report.end||(salary!==''&&Number(salary)!==report.salary)||(salary===''&&report.salarySource==='manager'));
 const sheetLink=(tab:string,row?:number)=>report?.sheetUrl+'#gid='+report?.sheetIds[tab]+(row?'&range=A'+row+':O'+row:'');
 const text=report?[`${report.room} 주간정산 초안`,`${report.start} ~ ${report.end}`,`총 레이크백 ${num(report.totals.back)}동`,`F&B ${num(report.totals.fnb)}동`,`코드별 정산금 ${num(report.totals.mongol+report.totals.japan+report.totals.china+report.totals.house+report.totals.korea2)}동`,`직원 급여 선지출 ${num(report.salary)}${report.salary===null?'':'동'}`,`정산 잔액 ${num(report.net)}동${report.salary===null?' (급여 제외)':''}`,`확인 필요 ${report.issues.length}건`,report.closed?'기간 종료':'진행 중인 주간','기타 지출·지급 완료 여부 별도 확인',summary?'AI 설명 초안\n'+summary:''].filter(Boolean).join('\n'):'';
 return <main className={styles.page}><div className={styles.wrap}>
  <header><div><span className={styles.brand}>DREAM · SETTLEMENT DESK</span><h1>주간정산</h1><p>쓰던 시트 그대로, 검토와 보고는 한곳에서.</p></div><nav><a href='/desk/ledger'>일일 정산 업무</a><a href='/desk/rules'>업무 규칙</a><a href='/desk'>예약 데스크</a></nav></header>
  {message&&<p role='status' className={styles.notice}>{message}</p>}
  {login?<section className={styles.panel}><h2>관리자 로그인</h2><p>Danny와 후임 관리자도 기존 관리자 계정으로 사용할 수 있어요.</p><form onSubmit={e=>{e.preventDefault();void signIn();}} className={styles.form}><label>아이디 또는 이메일<input autoComplete='username' value={account} onChange={e=>setAccount(e.target.value)}/></label><label>비밀번호<input autoComplete='current-password' type='password' value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy} className={styles.primary}>로그인</button></form></section>:<>
  <section className={styles.panel}><div className={styles.controls}><label>정산할 주의 날짜<input type='date' value={day} disabled={busy} onChange={e=>{setDay(e.target.value);setSalary('');setReport(null);setSummary('');}}/></label><label>직원 급여 선지출 (동)<input type='number' min='0' step='1' value={salary} disabled={busy} placeholder='없으면 0 · 원본 값이 있으면 자동 적용' onChange={e=>{setSalary(e.target.value);setReviewed(false);setSummary('');}}/></label><button disabled={busy||!day} className={styles.primary} onClick={()=>load()}>{busy?'확인 중…':'시트에서 새로 불러오기'}</button></div><small>월~일 기준 · 급여 입력은 이 보고서에만 저장됩니다. 구글 시트의 원본 셀은 바꾸지 않습니다.</small></section>
  {report&&<>
  <div className={styles.heading}><div><h2>{report.start} — {report.end}</h2><p>{report.closed?'기간 종료':'진행 중'} · {new Date(report.generatedAt).toLocaleString('ko-KR',{timeZone:'Asia/Ho_Chi_Minh'})} 기준</p></div><a href={sheetLink('weekly')} target='_blank' rel='noreferrer'>기존 주간정산표 ↗</a></div>
  {dirty&&<p className={styles.notice}>입력 조건이 바뀌었어요. 새로 불러온 뒤 저장해주세요.</p>}
  <section className={styles.metrics}>{[['총 레이크백',report.totals.back],['F&B',report.totals.fnb],['총 비용'+(report.salary===null?' · 급여 제외':''),report.expense],['정산 잔액'+(report.salary===null?' · 잠정':''),report.net]].map(([label,value])=><div key={label}><span>{label}</span><strong>{num(value)}<small> 동</small></strong></div>)}</section>
  <p className={styles.caption}>정산 잔액 = 총 레이크백 − F&B − 코드별 정산금 − 급여 선지출. 다른 지출과 실제 지급 여부는 별도 확인합니다.</p>
  <section className={styles.panel}><h2>확인할 항목 <span>{report.issues.length}</span></h2>{report.issues.length===0?<p>자동 점검에서 확인할 항목이 발견되지 않았어요. 원본과 지급 내역을 검토한 후 확정해주세요.</p>:<ul className={styles.issues}>{report.issues.map((i:any,n:number)=><li key={n}><span>{i.message}</span>{i.row&&<a target='_blank' rel='noreferrer' href={sheetLink(i.sheet==='F&B 입력'?'fnb':'daily',i.row)}>원본 {i.row}행 ↗</a>}</li>)}</ul>}
   {!!report.pending.length&&<details><summary>텔레그램에서 확인하기</summary>{report.pending.map((p:any)=><p key={p.messageId}><a href={'https://web.telegram.org/a/#-5322020390'} target='_blank' rel='noreferrer'>직원방</a> · 메시지 {p.messageId} · {p.text||'사진'}</p>)}</details>}
  </section>
  <section className={styles.panel}><h2>일별 합계</h2><div className={styles.scroll}><table><thead><tr>{['날짜','바이인','레이크','레이크백','F&B'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{report.days.map((d:any)=><tr key={d.date}><td>{d.date}</td><td>{num(d.buyins)}</td><td>{num(d.rake)}</td><td>{num(d.back)}</td><td>{num(d.fnb)}</td></tr>)}</tbody></table></div></section>
  <section className={styles.panel}><h2>코드별 정산금</h2><div className={styles.metrics}>{[['MONGOL',report.totals.mongol],['JAPAN',report.totals.japan],['CHINA (AK)',report.totals.china],['HOUSE',report.totals.house],['KOREA2',report.totals.korea2]].map(([k,v])=><div key={k}><span>{k}</span><strong>{num(v)}</strong></div>)}</div></section>
  <section className={styles.panel}><h2>원본 대조</h2>{report.sameWeek?<><p>{report.checks.every((c:any)=>c.match)?'기존 주간정산표의 레이크백·F&B·코드별 정산금과 일치합니다.':'원본과 다른 합계가 있어요.'}</p>{report.checks.filter((c:any)=>!c.match).map((c:any)=><p key={c.label}>{c.label}: 원본 {num(c.actual)} / 집계 {num(c.expected)}</p>)}<p>기존 배분액: {report.shares.map((s:any)=>s.label+' '+num(s.amount)).join(' · ')}</p></>:<p>기존 주간정산표는 {report.sheetWeek||'다른 날짜'} 기준입니다. 선택한 주는 일일 입력·F&B 기록에서 집계했어요. 원본 날짜를 자동 변경하지 않습니다.</p>}</section>
  <section className={styles.panel}><h2>보고서</h2><pre className={styles.report}>{text}</pre><div className={styles.actions}><button disabled={busy||dirty} onClick={()=>action('summary')}>AI 설명 만들기</button><button disabled={busy||dirty} onClick={async()=>{try{await navigator.clipboard.writeText(text);setMessage('보고서 초안을 복사했어요.');}catch{setMessage('복사하지 못했어요. 보고서 텍스트를 선택해 복사해주세요.');}}}>보고서 복사</button><button onClick={()=>window.print()}>인쇄 / PDF</button><button disabled={busy||dirty} onClick={()=>action('draft')}>초안 저장</button></div><label className={styles.check}><input type='checkbox' checked={reviewed} disabled={!report.canConfirm||dirty||busy} onChange={e=>setReviewed(e.target.checked)}/> 원본과 급여·배분 내역을 검토했습니다.</label><button className={styles.primary} disabled={busy||dirty||!reviewed||!report.canConfirm} onClick={()=>action('confirm')}>주간정산 확정</button><p className={styles.caption}>기간 종료 후 확인할 항목이 없을 때 확정할 수 있어요. 확정은 지급 완료를 뜻하지 않습니다.</p></section>
  <section className={styles.panel}><h2>저장 이력</h2>{report.history.length?report.history.map((h:any)=><div className={styles.history} key={h.id}><strong>{h.status==='confirmed'?'확정':'초안'} · {h.changed?'현재 원본과 다름 · 재검토 필요':'현재 집계와 일치'}</strong><p>{new Date(h.createdAt).toLocaleString('ko-KR',{timeZone:'Asia/Ho_Chi_Minh'})} · 관리자 {h.createdBy.slice(0,8)} · 급여 {num(h.salary)}</p><button disabled={busy} onClick={()=>viewSaved(h.id)}>저장 당시 보고서</button></div>):<p>아직 저장한 보고서가 없어요.</p>}{savedText&&<pre className={styles.report}>{savedText}</pre>}</section>
  </>}
  </>}
 </div></main>;
}
