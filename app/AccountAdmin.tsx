"use client";
import {useEffect,useState} from "react";
import {db} from "../lib/db";
type Account={user_id:string;username:string;display_name:string;role:string;active:boolean};
export default function AccountAdmin(){
 const [accounts,setAccounts]=useState<Account[]>([]);
 const [listError,setListError]=useState("");
 const [saving,setSaving]=useState("");
 async function adminFetch(method:"GET"|"PATCH",body?:unknown){
  if(!db)throw Error("Not connected");
  const {data:{session}}=await db.auth.getSession();
  if(!session)throw Error("Admin login required");
  const res=await fetch("/api/admin/accounts",{method,headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},body:body?JSON.stringify(body):undefined,cache:"no-store"});
  const data=await res.json();
  if(!res.ok)throw Error(data.error||"Account request failed");
  return data;
 }
 async function loadAccounts(){try{const data=await adminFetch("GET");setAccounts(data.accounts||[]);setListError("")}catch(e){setListError(e instanceof Error?e.message:"Failed to load accounts")}}
 useEffect(()=>{void loadAccounts()},[]);
 async function updateAccount(account:Account,patch:Partial<Account>){
  setSaving(account.user_id);try{await adminFetch("PATCH",{user_id:account.user_id,role:patch.role??account.role,active:patch.active??account.active});await loadAccounts()}catch(e){setListError(e instanceof Error?e.message:"Update failed")}finally{setSaving("")}
 }

 const [username,setUsername]=useState("cashier");
 const [password,setPassword]=useState("");
 const [displayName,setDisplayName]=useState("Cashier");
 const [role,setRole]=useState("cashier");
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 async function create(){
  if(!db)return;
  setBusy(true);setMessage("");
  try{
   const {data:{session}}=await db.auth.getSession();
   if(!session)throw Error("Admin login required");
   const response=await fetch("/api/admin/accounts",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},body:JSON.stringify({username,password,display_name:displayName,role})});
   const result=await response.json();
   if(!response.ok)throw Error(result.error||"Account creation failed");
   setMessage("계정 생성 완료: "+result.username+" ("+result.role+")");
   setPassword("");await loadAccounts();
  }catch(e){setMessage(e instanceof Error?e.message:"Error")}finally{setBusy(false)}
 }
 return <section className="accountAdmin"><h2>직원 계정 만들기</h2><p>총관리자 전용 · 캐셔 및 한국인 데스크 계정을 생성합니다.</p><div className="accountAdminGrid"><label>아이디<input autoComplete="off" value={username} onChange={e=>setUsername(e.target.value.toLowerCase())} placeholder="cashier"/></label><label>담당자명<input value={displayName} onChange={e=>setDisplayName(e.target.value)}/></label><label>권한<select value={role} onChange={e=>setRole(e.target.value)}><option value="cashier">캐셔</option><option value="desk">한국인 데스크</option><option value="admin">관리자</option></select></label><label>초기 비밀번호<input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="12자 이상"/></label></div><button className="primary" disabled={busy||username.length<4||password.length<12} onClick={()=>void create()}>{busy?"생성 중…":"계정 생성"}</button>{message&&<p role="status">{message}</p>}<small>비밀번호는 채팅에 공유하지 말고 직원에게 안전하게 전달하세요.</small><div className="accountManagementList"><div className="accountManagementHead"><h3>직원 계정 목록</h3><button type="button" onClick={()=>void loadAccounts()}>↻ 새로고침</button></div>{listError&&<p role="alert">{listError}</p>}{accounts.map(a=><div className="accountManagementRow" key={a.user_id}><div><strong>{a.username}</strong><small>{a.display_name}</small></div><select aria-label={a.username+" 권한"} disabled={saving===a.user_id} value={a.role} onChange={e=>void updateAccount(a,{role:e.target.value})}><option value="admin">관리자</option><option value="cashier">캐셔</option><option value="desk">한국 데스크</option><option value="staff">기존 직원</option></select><button type="button" disabled={saving===a.user_id} onClick={()=>void updateAccount(a,{active:!a.active})}>{a.active?"활성 · 사용 중":"비활성 · 잠금"}</button></div>)}</div></section>;
}
