"use client";
import {useRef,useState} from 'react';
import {db,configured} from '../lib/db';
import {resolveStaffEmail,staffAuthCopy,staffAuthIssue,type StaffAuthIssue} from '../lib/staff-auth';

export default function StaffLogin({lang,workspace,initialReset=false}:{initialReset?:boolean;lang:'ko'|'en'|'vi';workspace:'cashier'|'desk'}){
 const t=staffAuthCopy[lang];
 const [identifier,setIdentifier]=useState(''),[password,setPassword]=useState(''),[show,setShow]=useState(false);
 const [reset,setReset]=useState(initialReset),[busy,setBusy]=useState(false),[sent,setSent]=useState(false);
 const [issue,setIssue]=useState<StaffAuthIssue|null>(null);
 const lock=useRef(false);
 async function submit(e:React.FormEvent){
  e.preventDefault();if(!db||lock.current)return;
  lock.current=true;setBusy(true);setIssue(null);setSent(false);
  try{
   const email=await resolveStaffEmail(db,identifier);
   if(reset){
    if(!email){setSent(true);return}
    if(/\.(example|local|invalid)$/i.test(email)){setIssue('managed');return}
    // Reuse the existing, allowlisted staff recovery page.
    const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/reset-password'});
    if(error){setIssue(staffAuthIssue(error,'reset'));return}
    setSent(true);
   }else{
    if(!email){setIssue('credentials');return}
    const {error}=await db.auth.signInWithPassword({email,password});
    if(error)setIssue(staffAuthIssue(error));else setPassword('');
   }
  }catch(e){setIssue(staffAuthIssue(e))}finally{lock.current=false;setBusy(false)}
 }
 function toggleReset(){setReset(v=>!v);setIssue(null);setSent(false);setPassword('');setShow(false)}
 return <form className="panel login staffWorkspaceLogin" lang={lang} onSubmit={submit} aria-busy={busy}>
  <h1>{reset?t.resetTitle:t[workspace]}</h1><p>{reset?t.resetHelp:t.title}</p>
  {!reset&&<nav className="staffWorkspaceLinks"><a href="/cashier" aria-current={workspace==='cashier'?'page':undefined}>{t.cashier}</a><a href="/desk" aria-current={workspace==='desk'?'page':undefined}>{t.desk}</a></nav>}
  <label htmlFor="staff-identifier">{t.id}</label><input id="staff-identifier" name="username" required autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={identifier} onChange={e=>{setIdentifier(e.target.value);setIssue(null);setSent(false)}}/>
  {!reset&&<><label htmlFor="staff-password">{t.password}</label><div className="staffPasswordField"><input id="staff-password" name="password" required type={show?'text':'password'} autoComplete="current-password" value={password} onChange={e=>{setPassword(e.target.value);setIssue(null)}}/><button type="button" aria-controls="staff-password" aria-pressed={show} onClick={()=>setShow(v=>!v)}>{show?t.hide:t.show}</button></div></>}
  {issue&&<p className="staffLoginError" role="alert">{t[issue]}</p>}
  {sent&&<p className="staffLoginSuccess" role="status">{t.sent}</p>}
  <button type="submit" className="primary" disabled={busy||!configured||sent}>{busy?t.working:reset?t.send:t.signIn}</button>
  <button type="button" className="staffLoginLink" disabled={busy} onClick={toggleReset}>{reset?t.back:t.forgot}</button>
 </form>;
}
