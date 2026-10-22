"use client";
import {useEffect,useState} from "react";
import {playerDb,type PlayerIdentity} from "../lib/player-db";
const text={
 ko:{google:"Google로 계속하기",kakao:"카카오로 계속하기",setup:"간편 로그인 연결 준비 중 · 바로 예약도 가능해요",logout:"로그아웃",failed:"로그인을 완료하지 못했습니다. 다시 시도해주세요.",account:"내 계정",loading:"로그인 확인 중…"},
 en:{google:"Continue with Google",kakao:"Continue with Kakao",setup:"Social login coming soon · You can still book below",logout:"Sign out",failed:"Sign-in could not be completed. Please try again.",account:"My account",loading:"Checking sign-in…"},
 vi:{google:"Tiếp tục với Google",kakao:"Tiếp tục với Kakao",setup:"Đang kết nối đăng nhập · Bạn vẫn có thể đặt chỗ bên dưới",logout:"Đăng xuất",failed:"Không thể đăng nhập. Vui lòng thử lại.",account:"Tài khoản",loading:"Đang kiểm tra đăng nhập…"}
};
export default function PlayerAccount({lang,onChange,beforeLogin,disabled=false}:{lang:keyof typeof text;onChange:(user:PlayerIdentity|null)=>void;beforeLogin:()=>void;disabled?:boolean}){
 const [user,setUser]=useState<PlayerIdentity|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false);
 const [providers,setProviders]=useState({google:false,kakao:false}),[failed,setFailed]=useState(false);
 const t=text[lang];
 useEffect(()=>{
  const client=playerDb;let live=true,revision=0;
  const check=async()=>{const version=++revision;try{const result=await client?.auth.getUser();if(!live||version!==revision)return;const u=result?.data.user;const next=u?{id:u.id,name:String(u.user_metadata?.full_name||u.user_metadata?.name||u.user_metadata?.nickname||"Player").slice(0,80)}:null;setUser(next);onChange(next);}catch{if(live&&version===revision){setUser(null);onChange(null);}}finally{if(live&&version===revision)setReady(true)}};
  void check();
  const subscription=client?.auth.onAuthStateChange(()=>{setTimeout(()=>{if(live)void check()},0)}).data.subscription;
  void fetch("/api/player-login/providers").then(r=>r.ok?r.json():null).then(p=>{if(live&&p)setProviders({google:p.google===true,kakao:p.kakao===true})}).catch(()=>{});
  const params=new URLSearchParams(window.location.search);
  if(params.has("player_login")){setFailed(params.get("player_login")!=="success");params.delete("player_login");const rest=params.toString();window.history.replaceState(null,"",window.location.pathname+(rest?"?"+rest:"")+window.location.hash);}
  return()=>{live=false;revision++;subscription?.unsubscribe()};
 },[onChange]);
 async function login(provider:"google"|"kakao"){
  if(!playerDb||busy||disabled||!providers[provider])return;
  setBusy(true);setFailed(false);
  try{beforeLogin();const {error}=await playerDb.auth.signInWithOAuth({provider,options:{redirectTo:window.location.origin+"/auth/player/callback"}});if(error)throw error;}catch{setFailed(true);setBusy(false);}
 }
 async function logout(){if(!playerDb||busy||disabled)return;setBusy(true);setFailed(false);try{const {error}=await playerDb.auth.signOut({scope:"local"});if(error)throw error;setUser(null);onChange(null);}catch{setFailed(true);}finally{setBusy(false);}}
 return <section className="playerAccount" aria-label={t.account}>
  {!ready?<small role="status">{t.loading}</small>:user?<div className="playerAccountSignedIn"><span>✓ {user.name}</span><button type="button" disabled={busy||disabled} onClick={()=>void logout()}>{t.logout}</button></div>:<><div className="playerLoginButtons"><button className="playerGoogle" type="button" disabled={busy||disabled||!providers.google} onClick={()=>void login("google")}><svg aria-hidden="true" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.03 46.98 31.89 46.98 24.55Z"/><path fill="#FBBC05" d="M10.53 28.59A14.41 14.41 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6C30.03 37.65 27.26 38.5 24 38.5c-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>{t.google}</button><button className="playerKakao" type="button" disabled={busy||disabled||!providers.kakao} onClick={()=>void login("kakao")}><svg aria-hidden="true" viewBox="0 0 24 24"><path fill="currentColor" d="M12 3C6.48 3 2 6.44 2 10.68c0 2.7 1.82 5.08 4.58 6.44l-1.16 4.23c-.1.37.31.67.62.46l5.1-3.4.86.03c5.52 0 10-3.44 10-7.76S17.52 3 12 3Z"/></svg>{t.kakao}</button></div>{!providers.google&&!providers.kakao&&<small>{t.setup}</small>}</>}
  {failed&&<p role="alert">{t.failed}</p>}
 </section>;
}
