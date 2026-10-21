"use client";

import {FormEvent, useEffect, useState} from "react";
import {db} from "../../lib/db";

export default function ResetPasswordPage() {
  const [checking, setChecking] = useState(true);
  const [account, setAccount] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!db) {
      setMessage("로그인 연결 설정을 확인할 수 없습니다. 관리자에게 문의해주세요.");
      setChecking(false);
      return;
    }
    const client = db;
    let active = true;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    const linkError = fragment.has("error") || query.has("error");
    async function check() {
      try {
        // Wait for Supabase to consume the recovery link before checking the user.
        const session = await client.auth.getSession();
        if (session.error) throw session.error;
        if (linkError) {
          if (active) setMessage("재설정 링크가 만료되었거나 이미 사용되었습니다. 아래에서 새 메일을 요청해주세요.");
          return;
        }
        if (session.data.session) {
          const {data, error} = await client.auth.getUser();
          if (error) throw error;
          if (active) setAccount(data.user?.email || "");
        }
      } catch {
        if (active) setMessage("재설정 링크를 확인하지 못했습니다. 아래에서 새 메일을 요청해주세요.");
      } finally {
        if (active) {
          // Remove recovery tokens and errors from the address bar.
          window.history.replaceState(null, "", window.location.pathname);
          setChecking(false);
        }
      }
    }
    void check();
    return () => { active = false; };
  }, []);

  async function sendRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const {error} = await db.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin + "/reset-password",
      });
      if (error) throw error;
      setMessage("등록된 이메일이라면 재설정 메일이 전송됩니다. 가장 최근 메일의 링크를 열어주세요.");
    } catch {
      setMessage("메일을 보내지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally { setBusy(false); }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || busy) return;
    if (password.length < 12) {
      setMessage("새 비밀번호는 12자 이상으로 입력해주세요.");
      return;
    }
    if (password !== confirmation) {
      setMessage("두 비밀번호가 일치하지 않습니다.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const {error} = await db.auth.updateUser({password});
      if (error) throw error;
      setPassword("");
      setConfirmation("");
      setDone(true);
      // A reset should end existing sessions; password change remains successful
      // even if session cleanup encounters a network error.
      const result = await db.auth.signOut();
      if (result.error) setMessage("비밀번호가 변경되었습니다. 사용 중인 다른 기기에서도 로그아웃해주세요.");
    } catch {
      setMessage("비밀번호를 변경하지 못했습니다. 이전과 다른 비밀번호를 사용하거나 새 재설정 메일을 요청해주세요.");
    } finally { setBusy(false); }
  }

  const fieldStyle = {display: "grid", gap: 8} as const;
  return <main style={{minHeight: "100vh", padding: "64px 20px", background: "#101510", color: "#f4f1e7"}}>
    <section style={{maxWidth: 460, margin: "0 auto", padding: 28, border: "1px solid #465340", borderRadius: 20}}>
      <p style={{color: "#c6ac69", letterSpacing: 2}}>DREAM POKER</p>
      <h1 style={{fontSize: 26}}>비밀번호 재설정</h1>
      {checking ? <p role="status">재설정 링크를 확인하고 있습니다…</p> : done ? <>
        <p role="status">비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.</p>
        <a href="/staff">직원 로그인으로 이동 →</a>
      </> : account ? <>
        <p>{account}</p>
        <form onSubmit={changePassword} style={{display: "grid", gap: 20}}>
          <label style={fieldStyle}>새 비밀번호
            <input type="password" autoComplete="new-password" minLength={12} required value={password}
              onChange={e => setPassword(e.target.value)} disabled={busy}/>
          </label>
          <label style={fieldStyle}>새 비밀번호 확인
            <input type="password" autoComplete="new-password" minLength={12} required value={confirmation}
              onChange={e => setConfirmation(e.target.value)} disabled={busy}/>
          </label>
          <p>12자 이상으로 입력해주세요.</p>
          <button className="primary" disabled={busy}>{busy ? "변경 중…" : "비밀번호 변경"}</button>
        </form>
      </> : <>
        <p>가입한 이메일로 재설정 링크를 받아주세요.</p>
        <form onSubmit={sendRecovery} style={{display: "grid", gap: 20}}>
          <label style={fieldStyle}>이메일
            <input type="email" autoComplete="email" required value={email}
              onChange={e => setEmail(e.target.value)} disabled={busy || !db}/>
          </label>
          <button className="primary" disabled={busy || !db}>{busy ? "전송 중…" : "재설정 메일 받기"}</button>
        </form>
      </>}
      {message && <p role="status" style={{marginTop: 20, lineHeight: 1.6}}>{message}</p>}
    </section>
  </main>;
}
