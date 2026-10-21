import {createClient} from '@supabase/supabase-js';
import {validRulesTicket} from '../../../lib/accounting-rules-link';
export const dynamic='force-dynamic';
export const metadata={title:'업무 규칙 · Dream Buy-in Desk',robots:{index:false,follow:false},referrer:'no-referrer'};
const section=(s:string)=>/F&B|음료|메뉴|영수증|층/.test(s)?'F&B':/답장|대화|응답|완료|직원/.test(s)?'직원방 사용':/이름|선수|명단|코드|카드/.test(s)?'선수 등록':'바이인 기록';
export default async function RulesPage({searchParams}:{searchParams:{access?:string}}){
 const valid=validRulesTicket(searchParams.access||'',process.env.ACCOUNTING_OPS_SECRET||'');
 let rules:{id:number;content:string}[]=[];let failed=false;
 if(valid){
  const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
  const r=await client.from('dream_accounting_rules').select('id,content').eq('active',true).order('id');
  failed=!!r.error;rules=r.data||[];
 }
 return <main style={{minHeight:'100dvh',background:'#f5f5f4',color:'#202622',padding:'32px 18px 60px',fontFamily:'system-ui,sans-serif'}}><div style={{maxWidth:680,margin:'0 auto'}}>
  <p style={{fontSize:12,letterSpacing:2,color:'#597266'}}>DREAM BUY-IN DESK</p>
  <h1 style={{fontSize:30,margin:'12px 0'}}>업무 규칙</h1>
  {!valid?<p>링크가 만료되었거나 올바르지 않아요. 직원방에서 /rules를 다시 눌러주세요.</p>:failed?<p>규칙을 불러오지 못했어요. 잠시 후 새로고침해주세요.</p>:<>
   <p style={{color:'#66716b',lineHeight:1.7}}>현재 적용 중인 규칙 {rules.length}개<br/>항목을 누르면 자세한 내용을 볼 수 있어요.</p>
   {['바이인 기록','선수 등록','F&B','직원방 사용'].map(category=>{
    const items=rules.filter(r=>section(r.content)===category);if(!items.length)return null;
    return <section key={category} style={{marginTop:28}}><h2 style={{fontSize:17}}>{category}</h2>{items.map(r=><details key={r.id} style={{background:'white',borderRadius:14,marginBottom:10,padding:'17px 18px',border:'1px solid #e5e9e5'}}>
     <summary style={{cursor:'pointer',fontWeight:600,lineHeight:1.6}}><span style={{color:'#748078',fontSize:12,marginRight:10}}>#{r.id}</span>{r.content.split(/[.。\n]/)[0].slice(0,65)}{r.content.split(/[.。\n]/)[0].length>65?'…':''}</summary>
     <p style={{whiteSpace:'pre-wrap',lineHeight:1.9,fontSize:15,marginBottom:0}}>{r.content}</p>
    </details>)}</section>;
   })}
   <p style={{fontSize:13,color:'#6c7770',lineHeight:1.8,marginTop:30}}>규칙 변경은 직원방에서 관리자에게 요청해주세요.<br/>이 페이지는 조회 전용이며, 링크는 발급 후 24시간 동안 유효해요.</p>
  </>}
 </div></main>;
}
