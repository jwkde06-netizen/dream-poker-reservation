"use client";
import {useEffect,useState} from "react";
import {db} from "../lib/db";
type Account={user_id:string;username:string;display_name:string;role:string;active:boolean};
export default function AccountAdmin({lang="ko"}:{lang?:"ko"|"en"|"vi"}){
 const t=lang==='ko'?{title:'직원 계정 만들기',help:'총관리자 전용 · 캐셔 및 한국인 데스크 계정을 생성합니다.',username:'아이디',name:'담당자명',role:'권한',cashier:'캐셔',desk:'한국인 데스크',admin:'관리자',staff:'기존 직원',password:'초기 비밀번호',passwordHint:'12자 이상',creating:'생성 중…',create:'계정 생성',created:'계정 생성 완료',error:'계정 요청을 완료하지 못했습니다. 연결과 입력 내용을 확인하세요.',passwordHelp:'비밀번호는 채팅에 공유하지 말고 직원에게 안전하게 전달하세요.',list:'직원 계정 목록',refresh:'새로고침',active:'활성 · 사용 중',inactive:'비활성 · 잠금'}:lang==='vi'?{title:'Tạo tài khoản nhân viên',help:'Chỉ quản trị viên được tạo tài khoản thu ngân và bàn Hàn Quốc.',username:'Tên đăng nhập',name:'Tên nhân viên',role:'Quyền',cashier:'Thu ngân',desk:'Bàn Hàn Quốc',admin:'Quản trị viên',staff:'Nhân viên',password:'Mật khẩu ban đầu',passwordHint:'Ít nhất 12 ký tự',creating:'Đang tạo…',create:'Tạo tài khoản',created:'Đã tạo tài khoản',error:'Không thể hoàn tất yêu cầu. Kiểm tra kết nối và thông tin nhập.',passwordHelp:'Gửi mật khẩu cho nhân viên qua kênh an toàn, không đăng trong trò chuyện.',list:'Tài khoản nhân viên',refresh:'Làm mới',active:'Đang hoạt động',inactive:'Đã khóa'}:{title:'Create staff account',help:'Administrators can create cashier and Korean desk accounts.',username:'Username',name:'Staff name',role:'Role',cashier:'Cashier',desk:'Korean desk',admin:'Administrator',staff:'Staff',password:'Initial password',passwordHint:'At least 12 characters',creating:'Creating…',create:'Create account',created:'Account created',error:'Could not complete the account request. Check your connection and entries.',passwordHelp:'Share the password securely with the staff member, not in chat.',list:'Staff accounts',refresh:'Refresh',active:'Active',inactive:'Inactive · Locked'};
 const roleName=(v:string)=>({cashier:t.cashier,desk:t.desk,admin:t.admin,staff:t.staff}[v]||v);
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
 const [busy,setBusy]=useState(false),[message,setMessage]=useState<{username:string;role:string}|"error"|null>(null);
 async function create(){
  if(!db)return;
  setBusy(true);setMessage(null);
  try{
   const {data:{session}}=await db.auth.getSession();
   if(!session)throw Error("Admin login required");
   const response=await fetch("/api/admin/accounts",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},body:JSON.stringify({username,password,display_name:displayName,role})});
   const result=await response.json();
   if(!response.ok)throw Error(result.error||"Account creation failed");
   setMessage({username:result.username,role:result.role});
   setPassword("");await loadAccounts();
  }catch(e){setMessage("error")}finally{setBusy(false)}
 }
 return <section className="accountAdmin"><h2>{t.title}</h2><p>{t.help}</p><div className="accountAdminGrid"><label>{t.username}<input autoComplete="off" value={username} onChange={e=>setUsername(e.target.value.toLowerCase())} placeholder="cashier"/></label><label>{t.name}<input value={displayName} onChange={e=>setDisplayName(e.target.value)}/></label><label>{t.role}<select value={role} onChange={e=>setRole(e.target.value)}><option value="cashier">{t.cashier}</option><option value="desk">{t.desk}</option><option value="admin">{t.admin}</option></select></label><label>{t.password}<input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder={t.passwordHint}/></label></div><button className="primary" disabled={busy||username.length<4||password.length<12} onClick={()=>void create()}>{busy?t.creating:t.create}</button>{message&&<p role="status">{message==="error"?t.error:`${t.created}: ${message.username} (${roleName(message.role)})`}</p>}<small>{t.passwordHelp}</small><div className="accountManagementList"><div className="accountManagementHead"><h3>{t.list}</h3><button type="button" onClick={()=>void loadAccounts()}>↻ {t.refresh}</button></div>{listError&&<p role="alert">{t.error}</p>}{accounts.map(a=><div className="accountManagementRow" key={a.user_id}><div><strong>{a.username}</strong><small>{a.display_name}</small></div><select aria-label={a.username+" "+t.role} disabled={saving===a.user_id} value={a.role} onChange={e=>void updateAccount(a,{role:e.target.value})}><option value="admin">{t.admin}</option><option value="cashier">{t.cashier}</option><option value="desk">{t.desk}</option><option value="staff">{t.staff}</option></select><button type="button" disabled={saving===a.user_id} onClick={()=>void updateAccount(a,{active:!a.active})}>{a.active?t.active:t.inactive}</button></div>)}</div></section>;
}
