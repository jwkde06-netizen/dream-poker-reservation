"use client";
import {useCallback,useEffect,useState} from 'react';
import {db} from '../../lib/db';
import styles from './page.module.css';

type Agent={role:string;name:string;mode:string;enabled:boolean;chatId:string;missing:string[];connected:boolean;bot?:{id:string;username:string;name:string};chat?:{id:string;title:string};memberStatus?:string;visibility?:boolean;pendingUpdates?:number;hasDeliveryError?:boolean;error?:string};
const roles:Record<string,{title:string;description:string;example:string}>={
  reservations:{title:'예약',description:'예약 접수와 데스크 임시 확보, 실명 교체, 캐셔 확인을 연결합니다.',example:'임시 확보와 실제 손님을 구분하고 남은 자리를 함께 확인합니다.'},
  accounting:{title:'회계',description:'일일 게임·F&B 기록을 모으고 캐셔 자료와 대조해 주간 정산 초안을 만듭니다.',example:'미확인 내역과 차이는 보고서에 남기며 외부 발송은 별도로 진행합니다.'},
  exchange:{title:'환전',description:'VND 현금·계좌, KRW 계좌, USD 현금을 관리하고 수수료와 실현손익을 집계합니다.',example:'기초 시제를 확정한 시점부터 기록하며 통화가 빠진 금액은 먼저 확인합니다.'},
};
export default function AgentsPage(){
  const [agents,setAgents]=useState<Agent[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[message,setMessage]=useState('');
  const request=useCallback(async(method='GET',body?:unknown)=>{
    if(!db)throw Error('예약 시스템의 데이터베이스 연결 설정이 필요합니다.');
    const {data:{session}}=await db.auth.getSession();
    if(!session)throw Error('직원 페이지에서 관리자 계정으로 로그인해주세요.');
    const response=await fetch('/api/agents/ops',{method,headers:{Authorization:'Bearer '+session.access_token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    const result=await response.json();if(!response.ok)throw Error(result.error||'연결 상태를 확인하지 못했습니다.');return result;
  },[]);
  const load=useCallback(async()=>{setLoading(true);try{setAgents((await request()).agents);setMessage('')}catch(error){setMessage(error instanceof Error?error.message:'상태 확인 실패')}finally{setLoading(false)}},[request]);
  useEffect(()=>{void load()},[load]);
  async function connect(agent:Agent){if(!agent.bot)return;setBusy(agent.role);setMessage('');try{await request('POST',{action:'connect',role:agent.role,botId:agent.bot.id});await load();setMessage(`${agent.name} 연결을 확인했습니다.`)}catch(error){setMessage(error instanceof Error?error.message:'연결 실패')}finally{setBusy('')}}
  return <main className={styles.page}>
    <nav className={styles.nav}><a href="/staff">← 직원 예약 화면</a><span>DREAM POKER</span></nav>
    <header className={styles.header}><p className={styles.eyebrow}>OPERATIONS</p><h1>세 가지 업무, 각자의 에이전트</h1><p>예약방·정산방·환전방의 연결 상태를 한곳에서 확인합니다.</p><button type="button" onClick={()=>void load()} disabled={loading||Boolean(busy)}>{loading?'확인 중…':'연결 상태 새로고침'}</button></header>
    {message&&<div role="status" className={styles.message}>{message}</div>}
    <section className={styles.grid} aria-label="에이전트 연결 상태">
      {agents.map(agent=>{const info=roles[agent.role];const member=['member','administrator'].includes(agent.memberStatus||'');const ready=agent.connected&&agent.enabled&&agent.visibility&&member&&agent.missing.length===0&&!agent.hasDeliveryError;return <article className={styles.card} key={agent.role}>
        <div className={styles.cardTop}><span>{info.title}</span><span className={ready?styles.ready:styles.waiting}>{ready?'연결 확인됨':'설정 확인 필요'}</span></div>
        <h2>{agent.bot?.name||agent.name}</h2><p>{info.description}</p>
        <dl><div><dt>텔레그램 계정</dt><dd>{agent.bot?'@'+agent.bot.username:'등록 대기'}</dd></div><div><dt>업무방</dt><dd>{agent.chat?.title||'연결 대기'}</dd></div><div><dt>일반 채팅 수신</dt><dd>{agent.visibility===undefined?'확인 전':agent.visibility?'가능':'설정 필요'}</dd></div><div><dt>처리 대기 메시지</dt><dd>{agent.pendingUpdates??'—'}</dd></div></dl>
        {agent.mode==='legacy'&&<p className={styles.notice}>현재 예약 계정으로 회계 업무를 처리하고 있습니다. 전용 계정 연결 후 분리됩니다.</p>}
        {agent.missing.length>0&&<p className={styles.notice}>설정할 항목: {agent.missing.join(' · ')}</p>}
        {agent.error&&<p className={styles.notice}>{agent.error}</p>}
        {agent.hasDeliveryError&&<p className={styles.notice}>텔레그램에서 최근 전달 오류를 보고했습니다. 운영 로그를 확인해주세요.</p>}
        <small>{info.example}</small>
        <button type="button" disabled={Boolean(busy)||!agent.bot||agent.missing.length>0||!agent.visibility||!member} onClick={()=>void connect(agent)}>{busy===agent.role?'연결 중…':agent.connected?'이 봇 다시 연결':'이 봇을 업무방에 연결'}</button>
      </article>})}
    </section>
    {!loading&&agents.length===0&&<p className={styles.empty}>관리자 로그인 후 연결 현황을 확인할 수 있습니다. <a href="/staff">로그인하러 가기 →</a></p>}
  </main>;
}
