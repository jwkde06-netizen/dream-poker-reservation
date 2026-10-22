"use client";
import {useEffect} from "react";
import {playerDb} from "../../../../lib/player-db";

export default function PlayerCallback(){
 useEffect(()=>{
  let active=true;
  // getSession waits for the SDK's single PKCE code exchange on initialization.
  void (async()=>{
   try{
    const params=new URLSearchParams(window.location.search);
    if(!playerDb||params.has("error")||new URLSearchParams(window.location.hash.slice(1)).has("error"))throw new Error("Login cancelled");
    const session=await playerDb.auth.getSession();
    if(session.error||!session.data.session)throw new Error("Session missing");
    const verified=await playerDb.auth.getUser();
    if(verified.error||!verified.data.user)throw new Error("Session invalid");
    if(active)window.location.replace("/?player_login=success");
   }catch{if(active)window.location.replace("/?player_login=failed");}
  })();
  return()=>{active=false};
 },[]);
 return <main className="playerCallback" role="status">로그인 확인 중… / Signing you in…</main>;
}
