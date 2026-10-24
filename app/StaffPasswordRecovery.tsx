"use client";
import {useRef,useState} from 'react';
import {db} from '../lib/db';
import {staffAuthCopy,staffAuthIssue,type StaffAuthIssue} from '../lib/staff-auth';

export default function StaffPasswordRecovery({lang}:{lang:'ko'|'en'|'vi'}){
 const t=staffAuthCopy[lang],lock=useRef(false);
 const [password,setPassword]=useState(''),[repeat,setRepeat]=useState(''),[show,setShow]=useState(false);
 const [busy,setBusy]=useState(false),[saved,setSaved]=useState(false),[issue,setIssue]=useState<StaffAuthIssue|null>(null);
 async function submit(e:React.FormEvent){
  e.preventDefault();if(!db||lock.current)return;
  if(password.length<12){setIssue('short');return}if(password!==repeat){setIssue('mismatch');return}
  lock.current=true;setBusy(true);setIssue(null);
  try{
   const {data,error:sessionError}=await db.auth.getUser();
   if(sessionError||!data.user){setIssue('expired');return}
   const {error}=await db.auth.updateUser({password});
   if(error){setIssue(staffAuthIssue(error));return}
   setPassword('');setRepeat('');setSaved(true);
   await db.auth.signOut();
  }catch(e){setIssue(staffAuthIssue(e))}finally{lock.current=false;setBusy(false)}
 }
 return <form className="panel login staffWorkspaceLogin" onSubmit={submit} lang={lang}>
  <h1>{t.resetTitle}</h1>
  {saved?<p className="staffLoginSuccess" role="status">{t.saved}</p>:<>
   <p>{t.short}</p><label htmlFor="new-password">{t.newPassword}</label><div className="staffPasswordField"><input id="new-password" type={show?'text':'password'} required minLength={12} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/><button type="button" aria-pressed={show} onClick={()=>setShow(v=>!v)}>{show?t.hide:t.show}</button></div>
   <label htmlFor="repeat-password">{t.repeat}</label><input id="repeat-password" type={show?'text':'password'} required minLength={12} autoComplete="new-password" value={repeat} onChange={e=>setRepeat(e.target.value)}/>
   {issue&&<p className="staffLoginError" role="alert">{t[issue]}</p>}<button className="primary" disabled={busy}>{busy?t.working:t.save}</button>
  </>}
  <a className="staffLoginLink" href="/cashier">{t.back}</a>
 </form>;
}
