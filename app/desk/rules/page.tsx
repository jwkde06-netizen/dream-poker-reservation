import {createClient} from '@supabase/supabase-js';
import {validRulesTicket} from '../../../lib/accounting-rules-link';
import {projectUrl} from '../../../lib/telegram';
import RulesManager from './RulesManager';
export const dynamic='force-dynamic';
export const metadata={title:'업무 규칙 · Dream Buy-in Desk',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function RulesPage({searchParams}:{searchParams:{access?:string}}){
 const valid=validRulesTicket(searchParams.access||'',process.env.ACCOUNTING_OPS_SECRET||'');
 if(!valid)return <RulesManager initialRules={[]} readable={false}/>;
 const client=createClient(projectUrl,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
 const result=await client.from('dream_accounting_rules').select('id,kind,content').eq('active',true).order('id');
 if(result.error)return <main style={{padding:30}}>규칙을 불러오지 못했어요. 잠시 후 새로고침해주세요.</main>;
 return <RulesManager initialRules={result.data||[]} readable/>;
}
