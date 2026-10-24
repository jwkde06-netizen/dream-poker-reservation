"use client";
import {useEffect,useState} from 'react';
import {db} from '../../lib/db';
import {staffAuthCopy} from '../../lib/staff-auth';
import StaffLogin from '../StaffLogin';
import StaffPasswordRecovery from '../StaffPasswordRecovery';

export default function ResetPasswordPage(){
 const [checking,setChecking]=useState(true),[authenticated,setAuthenticated]=useState(false),[expired,setExpired]=useState(false);
 const [lang,setLang]=useState<'ko'|'en'|'vi'>('en');
 const t=staffAuthCopy[lang];
 useEffect(()=>{try{const saved=localStorage.getItem('reservation-language-cashier');if(saved==='ko'||saved==='en'||saved==='vi')setLang(saved)}catch{}},[]);
 useEffect(()=>{document.documentElement.lang=lang},[lang]);
 useEffect(()=>{
  if(!db){setChecking(false);return}
  const client=db;let active=true;
  const fragment=new URLSearchParams(location.hash.slice(1)),query=new URLSearchParams(location.search);
  const linkError=fragment.has('error')||query.has('error');
  async function check(){
   try{
    const session=await client.auth.getSession();if(session.error)throw session.error;
    if(linkError){if(active)setExpired(true);return}
    if(session.data.session){const {data,error}=await client.auth.getUser();if(error)throw error;if(active)setAuthenticated(!!data.user)}
   }catch{if(active)setExpired(true)}finally{
    if(active){window.history.replaceState(null,'',location.pathname);setChecking(false)}
   }
  }
  void check();return()=>{active=false};
 },[]);
 return <main className="shell bookingTheme themeDark staffShell staffMobileShell">
  <header className="header"><div className="brand"><img className="brandLogo" src="/dream-poker-logo.svg" alt="Dream Poker"/><strong>Dream Poker</strong></div><div className="bookingHeaderActions"><select aria-label="Language" value={lang} onChange={e=>{const value=e.target.value as typeof lang;setLang(value);try{localStorage.setItem('reservation-language-cashier',value)}catch{}}}><option value="ko">한국어</option><option value="en">English</option><option value="vi">Tiếng Việt</option></select></div></header>
  {checking?<p role="status">{t.working}</p>:authenticated?<StaffPasswordRecovery lang={lang}/>:<>{expired&&<p className="staffLoginError" role="alert">{t.expired}</p>}<StaffLogin lang={lang} workspace="cashier" initialReset/></>}
 </main>;
}
