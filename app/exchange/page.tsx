'use client';
import { FormEvent, useEffect, useState } from 'react';
import AdminExchange from './AdminExchange';
import styles from './page.module.css';

export default function ExchangePage() {
  const [key, setKey] = useState<string | null>(null), [ready, setReady] = useState(false);
  const [token, setToken] = useState(''), [command, setCommand] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    const setup = new URLSearchParams(window.location.hash.slice(1)).get('setup');
    if (setup) { setKey(setup); window.history.replaceState(null, '', window.location.pathname); }
    setReady(true);
  }, []);
  async function connect(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/exchange/connect', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-exchange-setup-key': key! }, body: JSON.stringify({ token: token.trim() }), cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || '연결에 실패했습니다.');
      setToken(''); setCommand(data.command);
    } catch (e) { setError(e instanceof Error ? e.message : '연결에 실패했습니다.'); }
    finally { setBusy(false); }
  }
  if (!ready) return <main className={styles.main}>연결 화면 확인 중…</main>;
  if (!key) return <AdminExchange />;
  return <main className={styles.main}><header className={styles.header}><div><div className={styles.eyebrow}>DREAM POKER</div><h1>Exchange 연결</h1><p>최초 봇 연결만 가능한 임시 링크입니다. 관리자 계정은 변경하지 않습니다.</p></div></header>
    {error && <div className={styles.error} role="alert">{error}</div>}
    <section className={styles.panel}>{!command ? <><h2>환전봇 토큰만 입력해주세요</h2><p>BotFather의 <strong>@dream_poker_exchange_bot</strong> API 토큰을 아래에 넣으세요. 토큰을 단체방이나 ChatGPT 채팅에 보내지 마세요.</p><form onSubmit={connect}><label>환전봇 API 토큰<input type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="off" spellCheck={false} autoCapitalize="off" required /></label><button disabled={busy}>{busy ? '연결 확인 중…' : '구글 환전장부에 연결'}</button></form><p className={styles.small}>이 링크는 만료되거나 환전방 연결이 끝나면 사용할 수 없습니다. 공유하지 마세요.</p></> : <><h2>이 명령을 Exchange 방에 보내주세요</h2><p>환전봇을 해당 방의 관리자로 추가한 뒤 방 관리자가 전송하면 됩니다. 삭제·차단 권한은 필요하지 않습니다.</p><div className={styles.pair}><code>{command}</code><button onClick={async () => { try { await navigator.clipboard.writeText(command); } catch { setError('명령을 길게 눌러 복사해주세요.'); } }}>명령 복사</button></div><p>15분 안에 전송해주세요. 봇이 시작 시제를 확인한 후 환전 내역을 구글 시트에 자동 기록합니다.</p></>}</section>
  </main>;
}
