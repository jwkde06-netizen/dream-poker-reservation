'use client';
import {useEffect,useState} from 'react';
import {db} from '../../../lib/db';
import {Rule,ruleView,gameMapping} from '../../../lib/accounting-rules-display';
import styles from './rules.module.css';
export default function RulesManager({initialRules,readable}:{initialRules:Rule[];readable:boolean}){
 const [rules,setRules]=useState(initialRules),[admin,setAdmin]=useState(false),[login,setLogin]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [category,setCategory]=useState('전체'),[search,setSearch]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [editing,setEditing]=useState<Rule|null>(null),[adding,setAdding]=useState(false),[content,setContent]=useState(''),[mapping,setMapping]=useState<any>(null),[deleting,setDeleting]=useState<Rule|null>(null);
 async function api(body?:any){
  const session=(await db?.auth.getSession())?.data.session;
  if(!session)throw Error('기존 관리자 계정으로 로그인해주세요.');
  const r=await fetch('/api/accounting/rules',{method:body?'POST':'GET',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const result=await r.json();if(!r.ok)throw Error(result.error);return result;
 }
 async function load(){try{const r=await api();setRules(r.rules);setAdmin(true);setLogin(false);return true;}catch{return false;}}
 useEffect(()=>{void load();},[]);
 async function signIn(){
  if(!db)return;setBusy(true);setMessage('');
  try{let account=email.trim().toLowerCase();if(!account.includes('@')){const r=await db.rpc('resolve_login_email',{p_username:account});if(r.error||!r.data)throw Error('계정을 확인해주세요.');account=r.data;}
   const r=await db.auth.signInWithPassword({email:account,password});if(r.error)throw Error('아이디와 비밀번호를 확인해주세요.');setPassword('');if(!await load())throw Error('관리자 계정만 규칙을 변경할 수 있어요.');
  }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 function edit(rule?:Rule){setMessage('');setEditing(rule||null);setAdding(!rule);setContent(rule?.content||'');setMapping(rule?gameMapping(rule.content):null);}
 async function save(remove=false){
  const target=remove?deleting:editing;if(remove&&!target)return;
  setBusy(true);setMessage('');
  try{
   const value=mapping?'게임번호 대응: '+JSON.stringify(mapping):content.trim();
   const result=await api({action:remove?'delete':editing?'edit':'add',id:target?.id,before:target?.content,beforeKind:target?.kind,kind:editing?.kind||'instruction',content:value});
   setRules(old=>remove?old.filter(r=>r.id!==target!.id):editing?old.map(r=>r.id===editing.id?result.rule:r):[...old,result.rule]);
   setEditing(null);setAdding(false);setDeleting(null);setMessage(remove?'삭제했어요. 다음 처리부터 적용하지 않아요.':'저장했어요. 다음 처리부터 적용해요.');
  }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 const categories=['전체','바이인 기록','선수 등록','F&B','직원방 사용','게임번호 보정'];
 const visible=rules.filter(r=>(category==='전체'||ruleView(r).category===category)&&r.content.toLowerCase().includes(search.toLowerCase()));
 return <main className={styles.page}><div className={styles.wrap}>
  <header><span className={styles.brand}>DREAM BUY-IN DESK</span><h1>업무 규칙</h1><p>현장에서 쓰는 기준을 한곳에서 확인하세요.</p></header>
  <div className={styles.toolbar}><span>{rules.length}개 적용 중</span>{admin?<button className={styles.primary} onClick={()=>edit()}>＋ 규칙 추가</button>:<button onClick={()=>setLogin(!login)}>관리자 로그인</button>}</div>
  {login&&<form className={styles.card} onSubmit={e=>{e.preventDefault();void signIn();}}><h2>관리자 로그인</h2><p>기존 드림 관리자 계정을 사용하세요.</p><label>아이디 또는 이메일<input autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>비밀번호<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><button disabled={busy} className={styles.primary}>로그인</button></form>}
  {message&&<p role="status" className={styles.notice}>{message}</p>}
  {!readable&&!admin?<p className={styles.card}>링크가 만료되었어요. 직원방에서 /rules를 다시 누르거나 관리자 계정으로 로그인해주세요.</p>:<>
   <input className={styles.search} aria-label="규칙 검색" placeholder="이름, 메뉴, 업무 내용 검색" value={search} onChange={e=>setSearch(e.target.value)}/>
   <nav className={styles.tabs} aria-label="규칙 분류">{categories.map(c=><button key={c} aria-pressed={category===c} onClick={()=>setCategory(c)}>{c}</button>)}</nav>
   {visible.map(rule=>{const view=ruleView(rule);return <article className={styles.card} key={rule.id}><div className={styles.top}><span className={styles.badge}>{view.category}</span>{admin&&<div><button onClick={()=>edit(rule)}>수정</button><button onClick={()=>{setMessage('');setDeleting(rule);}}>삭제</button></div>}</div><h2>{view.title}</h2><ul>{view.lines.map((line,i)=><li key={i}>{line}</li>)}</ul></article>;})}
   {!visible.length&&<p className={styles.empty}>해당하는 규칙이 없어요.</p>}
   <footer>변경한 규칙은 다음 업무부터 적용돼요. 기존 정산 내역은 바뀌지 않아요.</footer>
  </>}
  {(adding||editing)&&<div className={styles.overlay}><form role="dialog" aria-modal="true" aria-label="규칙 편집" className={styles.dialog} onSubmit={e=>{e.preventDefault();void save();}}><h2>{editing?'규칙 수정':'규칙 추가'}</h2>
   {!editing&&<label>규칙 종류<select value={mapping?'game':'text'} onChange={e=>setMapping(e.target.value==='game'?{date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date()),table:1,printedGame:1,game:1}:null)}><option value="text">일반 업무 규칙</option><option value="game">게임번호 보정</option></select></label>}
   {mapping?<div className={styles.fields}>{[['date','적용 날짜'],['table','테이블 번호'],['printedGame','영수증에 인쇄된 게임번호'],['game','실제 게임번호']].map(([key,label])=><label key={key}>{label}<input required type={key==='date'?'date':'number'} min={1} step={1} value={mapping[key]} onChange={e=>setMapping({...mapping,[key]:key==='date'?e.target.value:Number(e.target.value)})}/></label>)}</div>:<label>규칙 내용<textarea autoFocus required maxLength={800} rows={8} value={content} onChange={e=>setContent(e.target.value)} placeholder="예: 영수증에 층이 없으면 2F로 기록한다."/><small>{content.length}/800자</small></label>}
   {message&&<p role="alert">{message}</p>}<div className={styles.actions}><button type="button" disabled={busy} onClick={()=>{setEditing(null);setAdding(false);}}>취소</button><button disabled={busy} className={styles.primary}>{busy?'저장 중…':'저장'}</button></div>
  </form></div>}
  {deleting&&<div className={styles.overlay}><div role="dialog" aria-modal="true" aria-label="규칙 삭제" className={styles.dialog}><h2>이 규칙을 삭제할까요?</h2><p>{ruleView(deleting).title}</p><p>다음 업무부터 적용하지 않아요. 기존 정산 기록은 그대로 유지돼요.</p>{message&&<p role="alert">{message}</p>}<div className={styles.actions}><button disabled={busy} onClick={()=>setDeleting(null)}>취소</button><button disabled={busy} className={styles.danger} onClick={()=>void save(true)}>삭제</button></div></div></div>}
 </div></main>;
}
