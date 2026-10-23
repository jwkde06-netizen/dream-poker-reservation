'use client';
import {useEffect,useState} from 'react';
import styles from './demo.module.css';
type Access={room:string;deskKey:string;cashierKey:string;expires_at?:string};
const randomKey=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
export default function DemoLauncher(){
 const [access,setAccess]=useState<Access|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[origin,setOrigin]=useState('');
 useEffect(()=>{setOrigin(location.origin);try{const saved=JSON.parse(localStorage.getItem('dream-demo-host-v1')||'null');if(saved?.expires_at&&Date.parse(saved.expires_at)>Date.now())setAccess(saved)}catch{}},[]);
 async function create(){setBusy(true);setError('');let next:Access;
  try{const saved=JSON.parse(sessionStorage.getItem('dream-demo-creating-v1')||'null');next=saved||{room:crypto.randomUUID(),deskKey:randomKey(),cashierKey:randomKey()};sessionStorage.setItem('dream-demo-creating-v1',JSON.stringify(next));
   const res=await fetch('/api/reservation-demo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'create',...next}),signal:AbortSignal.timeout(15000)});const json=await res.json();if(!res.ok)throw Error(json.error==='limit'?'시연방 생성 한도에 도달했습니다. 잠시 후 다시 시도해주세요.':'연결을 확인한 뒤 다시 시도해주세요.');
   next.expires_at=json.expires_at;setAccess(next);localStorage.setItem('dream-demo-host-v1',JSON.stringify(next));sessionStorage.removeItem('dream-demo-creating-v1');
  }catch(e){setError(e instanceof Error?e.message:'연결 실패')}finally{setBusy(false)}
 }
 const link=(role:'desk'|'cashier')=>`${origin}/${role}?demo=1#room=${access!.room}&key=${role==='desk'?access!.deskKey:access!.cashierKey}`;
 const [copied,setCopied]=useState('');
 async function copy(role:'desk'|'cashier'){try{await navigator.clipboard.writeText(link(role));setCopied(role)}catch{setError('아래 링크를 길게 눌러 복사해주세요.')}}
 return <main className={styles.root}><header className={styles.header}><div className={styles.brand}><img src="/dream-poker-logo.svg" alt="" onError={e=>{e.currentTarget.style.display='none'}}/><strong>Dream Poker</strong></div><span className={styles.demoBadge}>DEMO · 시연 전용</span></header>
 <section className={styles.launch}><p className={styles.eyebrow}>한국인 데스크 ↔ 캐셔</p><h1>같은 예약, 두 화면.</h1><p>카톡으로 받은 내용을 데스크가 입력하고,<br/>캐셔의 처리 결과를 같은 예약에서 확인합니다.</p>
 <div className={styles.notice}>가짜 이름만 사용합니다. 운영 예약·고객 메시지·Telegram 전송은 발생하지 않습니다.<small>Chỉ dùng tên mẫu. Không tạo đặt chỗ thật, không gửi Telegram.</small></div>
 {!access?<button className={styles.primary} disabled={busy} onClick={()=>void create()}>{busy?'준비 중…':'시연방 만들기 · Tạo demo'}</button>:<><div className={styles.launchLinks}>{(['desk','cashier'] as const).map(role=><div key={role}><h2>{role==='desk'?'한국인 데스크':'캐셔 · Thu ngân'}</h2><p>{role==='desk'?'예약 등록 · 변경 · 결과 확인':'새 요청 확인 · 승인 · 거절 · 조정'}</p><a className={styles.primary} href={link(role)} target="_blank" rel="noopener noreferrer">{role==='desk'?'데스크 화면 열기':'Mở màn hình thu ngân'} ↗</a><button onClick={()=>void copy(role)}>{copied===role?'복사됨 ✓':'두 번째 기기로 보낼 링크 복사'}</button></div>)}</div><p className={styles.hint}>두 링크는 같은 시연방에 연결됩니다. 다른 휴대폰·태블릿에서도 사용할 수 있습니다. 유효기간 72시간.</p><button disabled={busy} onClick={()=>void create()}>{busy?'준비 중…':'새 빈 시연방 만들기'}</button></>}
 {error&&<p role="alert" className={styles.error}>{error}</p>}
 <ol className={styles.steps}><li>데스크에서 가짜 이름·게임·시간·인원을 입력합니다.</li><li>캐셔 화면에서 새 요청을 확인하고 승인하거나 사유와 함께 거절합니다.</li><li>데스크에서 결과·답변·처리 이력을 확인합니다.</li></ol>
 <div className={styles.capabilities}><span>● 화면 안 알림: 1초 자동 동기화</span><span>○ 카톡: 데스크 직접 입력</span><span>○ Telegram: 미리보기만</span><span>○ 앱 종료 후 푸시: 미구현</span></div>
 <p className={styles.hint}>시연 역할은 실제 직원 권한이 아닙니다. 메모의 자유 입력은 자동 번역하지 않습니다.</p><nav className={styles.links}><a href="/desk">운영 데스크 로그인</a><a href="/cashier">운영 캐셔 로그인</a></nav>
 </section></main>
}
