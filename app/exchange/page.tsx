'use client';
import { useCallback, useEffect, useState, FormEvent } from 'react';
import { db } from '../../lib/db';
import { ACCOUNT_CODES, EXCHANGE_ACCOUNTS, formatMoney, reportDates, ExchangeState, ExchangePlan } from '../../lib/exchange-domain';
import styles from './page.module.css';

type Setup = { configured: boolean; connected: boolean; username: string; room: string | null; encryptionReady: boolean };
type Entry = { reference: string; business_date: string; kind: string; plan: ExchangePlan; created_at: string };
type Pending = { update_id: number; status: string; reply_text: string | null; created_at: string };
type Ledger = { state: ExchangeState; events: Entry[]; pending: Pending[]; enabled: boolean; room: string | null };
const vnDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const time = (value: string) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Ho_Chi_Minh', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
const amount = (value: number | null | undefined) => value == null ? '미확인' : new Intl.NumberFormat('ko-KR').format(value) + ' VND';

export default function ExchangePage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [botToken, setBotToken] = useState(''), [pair, setPair] = useState('');
  const [setup, setSetup] = useState<Setup | null>(null), [ledger, setLedger] = useState<Ledger | null>(null);
  const [report, setReport] = useState<any>(null), [from, setFrom] = useState(vnDate), [to, setTo] = useState(vnDate);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [updated, setUpdated] = useState('');
  const api = useCallback(async (path: string, body?: unknown) => {
    const session = await db?.auth.getSession();
    const token = session?.data.session?.access_token;
    if (!token) throw Error('기존 드림포커 관리자 계정으로 로그인해주세요.');
    const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', cache: 'no-store', headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || '처리하지 못했습니다. 다시 확인해주세요.');
    return data;
  }, []);
  const refresh = useCallback(async () => {
    try {
      const next: Setup = await api('/api/exchange/connect'); setSetup(next);
      if (next.connected) {
        setPair('');
        const [l, r] = await Promise.all([api('/api/exchange'), api(`/api/exchange/report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)]);
        setLedger(l); setReport(r);
      }
      setUpdated(new Date().toISOString()); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : '조회하지 못했습니다.'); }
  }, [api, from, to]);
  useEffect(() => {
    if (!db) { setSignedIn(false); setError('로그인 서버 설정을 확인해주세요.'); return; }
    let active = true;
    db.auth.getSession().then(({ data }) => { if (active) setSignedIn(!!data.session); });
    const { data } = db.auth.onAuthStateChange((_event, session) => { if (active) setSignedIn(!!session); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!signedIn) return;
    void refresh(); const interval = setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
    return () => clearInterval(interval);
  }, [signedIn, refresh]);
  async function login(event: FormEvent) {
    event.preventDefault(); if (!db) return; setBusy(true); setError('');
    try { const result = await db.auth.signInWithPassword({ email: email.trim(), password }); if (result.error) throw Error('이메일과 비밀번호를 확인해주세요.'); setPassword(''); }
    catch (e) { setError(e instanceof Error ? e.message : '로그인하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  async function connect(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try { const result = await api('/api/exchange/connect', { token: botToken.trim() }); setBotToken(''); setPair(result.command); setNotice(result.message); }
    catch (e) { setError(e instanceof Error ? e.message : '연결하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  async function copyCommand() {
    try { await navigator.clipboard.writeText(pair); setNotice('복사했습니다. 15분 안에 Exchange 방에 붙여넣어 전송해주세요.'); }
    catch { setNotice('아래 연결 명령을 길게 눌러 복사해주세요.'); }
  }
  function period(value: 'today' | 'week' | 'last_week') {
    const dates = reportDates({ kind: 'report', period: value, from: null, to: null }, vnDate()); setFrom(dates.from); setTo(dates.to);
  }
  return <main className={styles.main}>
    <header className={styles.header}><div><div className={styles.eyebrow}>DREAM POKER</div><h1>Exchange</h1><p>환전 채팅이 장부로, 장부가 정산으로.</p></div><a href="/" className={styles.link}>예약 데스크</a></header>
    {error && <div role="alert" className={styles.error}>{error}</div>}
    {notice && <div role="status" className={styles.notice}>{notice}</div>}
    {signedIn === null ? <section className={styles.panel}>로그인 상태 확인 중…</section> : !signedIn ?
      <section className={`${styles.panel} ${styles.login}`}><h2>관리자 로그인</h2><p>기존 드림포커 관리자 계정을 사용합니다. 장부와 연결 정보는 관리자에게만 표시됩니다.</p><form onSubmit={login}><label>이메일<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></label><label>비밀번호<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label><button disabled={busy || !db}>{busy ? '확인 중…' : '로그인'}</button></form></section> : <>
      <div className={styles.status}><span className={setup?.connected ? styles.live : styles.waiting}>{setup?.connected ? `● ${setup.room || 'Exchange'} 연결됨` : '○ 환전봇 연결 전'}</span><button className={styles.secondary} onClick={() => void refresh()}>새로고침</button></div>
      {!setup ? <section className={styles.panel}>설정 확인 중…</section> : !setup.connected ? <section className={styles.panel}>
        <div className={styles.eyebrow}>최초 1회 설정</div><h2>Dream Poker Exchange 연결</h2><p>텔레그램 BotFather의 <strong>@dream_poker_exchange_bot</strong> API 토큰을 이 보안 입력란에 넣어주세요. 예약·회계봇 토큰은 사용할 수 없습니다.</p>
        {!setup.encryptionReady && <p className={styles.warning}>서버 암호화 설정이 아직 준비되지 않았습니다. 토큰을 입력하지 마세요.</p>}
        {!pair ? <form onSubmit={connect} className={styles.connectForm}><label>환전봇 API 토큰<input type="password" autoComplete="off" spellCheck={false} autoCapitalize="off" value={botToken} onChange={e => setBotToken(e.target.value)} placeholder="BotFather에서 복사한 토큰" required disabled={!setup.encryptionReady} /></label><button disabled={busy || !setup.encryptionReady}>{busy ? '연결 확인 중…' : '환전봇 연결'}</button></form> : <div className={styles.pair}><h3>이 명령을 Exchange 방에 보내주세요</h3><p>환전봇을 해당 방의 관리자로 추가한 뒤, 방 관리자가 전송해야 합니다. 메시지 삭제·멤버 차단 권한은 필요하지 않습니다.</p><code>{pair}</code><button onClick={() => void copyCommand()}>연결 명령 복사</button><p>15분 동안 유효하며 한 번만 사용할 수 있습니다. 토큰 자체를 채팅방에 보내면 안 됩니다.</p></div>}
        <p className={styles.small}>토큰은 서버에서 암호화되어 저장되며 브라우저 저장소·주소·장부에 남기지 않습니다. 기존 예약·회계봇 연결은 바꾸지 않습니다.</p>
      </section> : ledger && <>
        {!ledger.state.initialized && <section className={`${styles.panel} ${styles.opening}`}><h2>현재 시제를 한 번만 확정해주세요</h2><p>Exchange 방에 실제 현재 잔액을 아래 순서로 적어주세요. 없는 통화도 반드시 0으로 적습니다.</p><div className={styles.example}>기초 시제 동 현금 …동, 베트남 계좌 …동,<br />원화 계좌 …원, 달러 현금 …USD</div><p>봇이 보여주는 미리보기 확인 후 <strong>시제 확정 OPEN-번호</strong>를 보내면 자동 기록을 시작합니다. 외화의 동 기준 총 취득원가를 알면 함께 적고, 모르면 미확정으로 둡니다.</p></section>}
        <section className={styles.balances}>{ACCOUNT_CODES.map(code => <div className={styles.balance} key={code}><span>{EXCHANGE_ACCOUNTS[code].label}</span><strong>{ledger.state.initialized ? formatMoney(ledger.state.accounts[code].balance_minor, code) : '시제 미설정'}</strong>{ledger.state.initialized && ledger.state.accounts[code].book_vnd === null && <small>취득원가 미확인</small>}</div>)}</section>
        <section className={styles.panel}><div className={styles.sectionHeading}><h2>환전 정산</h2><span>베트남 시간 기준</span></div><div className={styles.filters}><div><button className={styles.secondary} onClick={() => period('today')}>오늘</button><button className={styles.secondary} onClick={() => period('week')}>이번 주</button><button className={styles.secondary} onClick={() => period('last_week')}>지난주</button></div><div><label>시작일<input aria-label="시작일" type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>종료일<input aria-label="종료일" type="date" value={to} onChange={e => setTo(e.target.value)} /></label></div></div>
          {report?.initialized ? <><div className={styles.metrics}><div><span>수수료 수입</span><strong>{amount(report.fee_vnd)}</strong></div><div><span>확인된 외화 처분 차익</span><strong>{amount(report.realized_fx_vnd)}</strong></div><div><span>비용</span><strong>{amount(report.expense_vnd)}</strong></div><div><span>확인된 순수익</span><strong>{amount(report.net_known_vnd)}</strong></div></div><p className={styles.small}>거래 {report.transaction_count}건 · 취소 {report.reversal_count}건 · 원금과 시제 보충·회수는 수익에서 제외</p>{(!report.period_fully_covered || report.unvalued_fx_count > 0 || report.unresolved_count > 0) && <p className={styles.warning}>기간 일부만 기록됐거나 확인할 내역이 있습니다. 전체 기간의 확정 수익이 아닙니다. 원가 미확인 처분 {report.unvalued_fx_count}건 · 미해결 입력 {report.unresolved_count}건</p>}</> : <p>시제 확정 후 정산 내역이 표시됩니다.</p>}
        </section>
        {ledger.pending.length > 0 && <section className={styles.panel}><h2>확인이 필요한 입력 <span className={styles.count}>{ledger.pending.length}</span></h2><p>텔레그램에서 해당 메시지에 답장해 필요한 내용을 알려주세요. 확인 전에는 잔액에 반영하지 않습니다.</p>{ledger.pending.map(p => <article className={styles.pending} key={p.update_id}><small>{time(p.created_at)} · {p.status === 'failed' ? '처리 확인 필요' : '추가 정보 필요'}</small><p>{p.reply_text || '해당 텔레그램 메시지를 확인해주세요.'}</p></article>)}<p className={styles.small}>최근 미해결 입력 최대 50건</p></section>}
        <section className={styles.panel}><div className={styles.sectionHeading}><h2>환전장부</h2><span>최근 100건</span></div>{ledger.events.length === 0 ? <p>아직 기록된 거래가 없습니다. 예시 거래는 자동으로 생성하지 않습니다.</p> : <div className={styles.entries}>{ledger.events.map(e => <article className={styles.entry} key={e.reference}><div className={styles.entryTop}><strong>{e.kind === 'opening' ? '기초 시제' : e.kind === 'reversal' ? '취소 기록' : e.kind === 'movement' ? '시제 입출금' : '환전'}</strong><time>{time(e.created_at)}</time></div>{e.plan.summary.map((line, i) => <div key={i}>{line}</div>)}{e.plan.note && <p>{e.plan.note}</p>}<div className={styles.entryFooter}><code>{e.reference}</code><span>수수료 {amount(e.plan.fee_vnd)}</span></div></article>)}</div>}</section>
      </>}
      <section className={styles.panel}><h2>이렇게 채팅하면 됩니다</h2><div className={styles.example}>원화 계좌 30만원 입금, 18레이트로 동 현금 지급 완료<br /><br />100USD 현금 받고 동 현금 250만동 지급 완료<br /><br />베트남 계좌로 550만동 받고 현금 550만동 지급. 수수료 5만동은 계좌로 별도 받음</div><p><strong>시제</strong> · <strong>오늘 정산</strong> · <strong>이번 주 정산</strong>으로 조회합니다. 불명확한 통화·입출금 방향은 되묻고, 메시지 수정으로 기존 장부를 덮어쓰지 않습니다.</p></section>
      <footer className={styles.footer}><span>{updated ? `마지막 확인 ${time(updated)} · 15초마다 갱신` : ''}</span><button className={styles.secondary} onClick={async () => { await db?.auth.signOut(); setLedger(null); setReport(null); setSetup(null); setBotToken(''); setPair(''); }}>로그아웃</button></footer>
    </>}
  </main>;
}
