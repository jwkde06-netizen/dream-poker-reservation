// A missing roster entry is evidence for a question, never for a ledger write.
const normalized=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').normalize('NFC').toLowerCase().replace(/đ/g,'d').trim().replace(/[.!?]+$/,'').trim();
export function bustAnswer(text:string){
 const t=normalized(text);
 if(/^(?:버스트\s*아웃(?:한\s*거야|했어|했어요|입니다|이야)?|버스트(?:났어|났어요)?|탈락(?:했어|했어요)|bust(?:ed)?(?: out)?|(?:da )?(?:bi loai|het chip|bust)(?: roi)?)$/.test(t))return 'busted';
 if(/^(?:아니[ ,]*)?(?:버스트\s*아웃(?:이)?\s*아니야|아직\s*(?:게임\s*중|치고\s*있어)|아웃\s*아니야|chua (?:bust|bi loai|het chip)|van dang choi|not busted|not out)$/.test(t))return 'playing';
 return null;
}
export function finalBuyins(text:string){
 const t=normalized(text),m=t.match(/^(?:(?:총|누적|tong|total)\s*)?(\d{1,2})\s*(?:바인|바이인|buy[ -]?ins?|lan)?(?:이에요|입니다|이야)?$/);
 const n=m?Number(m[1]):0;return n>=1&&n<=50?n:null;
}
export function bustFollowupState(job:any){
 const q=job?.plan?.pendingQuestion||'';
 const saved=job?.plan?.bustFollowup;
 if(saved&&(!q||q.includes(saved.target.player)))return saved;
 const targets=(job?.plan?.unverifiedOperations||[]).filter((o:any)=>o.possibleBustOut&&q.includes(o.player));
 return targets.length===1?{phase:'awaiting_answer',target:targets[0],root:job.message_id,busted:null}:null;
}
export function transitionBustFollowup(text:string,job:any){
 const state=bustFollowupState(job);if(!state)return null;
 if(state.phase==='resolved'||job.plan?.resolvedBy||job.plan?.manual_handoff||job.plan?.reconciliation)return {kind:'ignore',state};
 const count=finalBuyins(text);
 if(count!==null)return {kind:'count',state:{...state,phase:'confirmed',count},count};
 const answer=bustAnswer(text);
 if(!answer)return {kind:'ignore',state}; // A different person or unrelated reply cannot resolve this target.
 const busted=answer==='busted';
 if(state.phase==='awaiting_count'&&state.busted===busted)return {kind:'ignore',state};
 return {kind:'ask',state:{...state,phase:'awaiting_count',busted},question:`${state.target.player}님 ${busted?'버스트아웃 확인했어요.':'아직 진행 중인 것으로 정정했어요.'} 최종 누적 바이인 수만 숫자로 알려주세요. 기록은 그대로 유지합니다.`};
}
