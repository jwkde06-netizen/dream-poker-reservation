import {NextResponse} from 'next/server';
import {authorized} from '../../../../lib/accounting-agent';
import {requireAdmin} from '../../../../lib/telegram';
import {createWeeklyDraft,getWeeklyDraft,createWeeklySheetDraft,weeklyDraftAttachment} from '../../../../lib/accounting-weekly';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=180;

async function permitted(request:Request) {return authorized(request,'ACCOUNTING_OPS_SECRET')||Boolean(await requireAdmin(request));}

export async function POST(request:Request) {
  if(!await permitted(request))return NextResponse.json({error:'Admin login required'},{status:403});
  try {
    if(Number(request.headers.get('content-length'))>250000)return NextResponse.json({error:'Request too large'},{status:413});
    const input=await request.json();
    if(input.send||input.recipient||input.destination)return NextResponse.json({error:'This endpoint creates drafts only'},{status:400});
    if(input.createSheetDraft!==undefined&&typeof input.createSheetDraft!=='boolean')throw Error('Invalid sheet draft option');
    if(input.evidence!==undefined&&(!Array.isArray(input.evidence)||input.evidence.length>1000))throw Error('Invalid cashier evidence');
    const result=input.id?await getWeeklyDraft(input.id):await createWeeklyDraft({startDate:input.startDate,endDate:input.endDate,salaryAdvanceVnd:input.salaryAdvanceVnd,evidence:input.evidence});
    const sheet=input.createSheetDraft===true?await createWeeklySheetDraft(result.id):null;
    return NextResponse.json({...result,attachment:weeklyDraftAttachment(result.draft),sheet,sent:false});
  } catch(e) {return NextResponse.json({error:e instanceof Error?e.message:'Weekly draft failed'},{status:400});}
}

export async function GET(request:Request) {
  if(!await permitted(request))return NextResponse.json({error:'Admin login required'},{status:403});
  try {
    const query=new URL(request.url).searchParams;
    const result=await getWeeklyDraft(query.get('id')||'');
    if(query.get('format')==='csv') {
      const file=weeklyDraftAttachment(result.draft);
      return new Response(file.content,{headers:{'Content-Type':'text/csv;charset=utf-8','Content-Disposition':`attachment; filename="${file.filename}"`,'Cache-Control':'no-store'}});
    }
    return NextResponse.json({...result,sent:false});
  } catch {return NextResponse.json({error:'Weekly draft not found'},{status:404});}
}
