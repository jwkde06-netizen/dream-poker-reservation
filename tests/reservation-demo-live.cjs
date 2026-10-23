// Integration tests create ONLY expiring demo rooms. Never call operational booking/Telegram APIs.
const assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('node:crypto');
const base=process.argv[2];if(!base||!/^https:\/\/dream-poker-reservation(?:-[a-z0-9-]+)?\.vercel\.app$/.test(base))throw Error('Pass the verified reservation deployment URL');
const room=randomUUID(),deskKey=randomBytes(32).toString('hex'),cashierKey=randomBytes(32).toString('hex');
const url=`${base}/api/reservation-demo?room=${room}`;
async function raw(url,body,key){const res=await fetch(url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(key?{Authorization:`Bearer ${key}`}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});const text=await res.text();let data;try{data=JSON.parse(text)}catch{throw Error(`Non-JSON HTTP ${res.status}`)}return {status:res.status,data};}
const command=(c,key=deskKey)=>raw(url,{command:c},key);
const details=(name,size)=>({name,party_size:size,game_id:'dream-5m',arrival_at:new Date(Date.now()+3600000).toISOString(),note:'DEMO ONLY',note_vi:'CHỈ DEMO'});
const request=(name,size)=>({id:randomUUID(),action:'request',details:details(name,size)});
(async()=>{
 assert.equal((await raw(`${base}/api/reservation-demo`,{op:'create',room,deskKey,cashierKey})).status,200);
 const a=request('DEMO KIM MIN SU',6),b=request('DEMO NGUYEN AN',6);
 let r=await command(a);assert.equal(r.status,200);assert.equal(r.data.state.bookings[0].status,'pending');
 // Concurrent copies of the identical command produce only one booking and one event.
 const repeats=await Promise.all([command(a),command(a),command(a)]);assert(repeats.every(x=>x.status===200));
 r=await command(b);assert.equal(r.status,200);
 let snap=(await raw(url,null,cashierKey)).data;assert.equal(snap.state.bookings.length,2);assert.equal(snap.state.events.length,2);
 const approve=c=>({id:randomUUID(),action:'approve',reservation_id:c.id,expected_version:0});
 r=await command(approve(a),deskKey);assert.equal(r.status,422);assert.equal(r.data.error,'role');
 const pair=await Promise.all([command(approve(a),cashierKey),command(approve(b),cashierKey)]);
 assert.equal(pair.filter(x=>x.status===200).length,1);assert.equal(pair.filter(x=>x.status===422&&x.data.error==='full').length,1);
 snap=(await raw(url,null,deskKey)).data;
 assert.equal(snap.state.bookings.filter(x=>x.status==='confirmed').reduce((n,b)=>n+b.party_size,0),6);
 const waiting=snap.state.bookings.find(x=>x.status==='pending');
 const reject={id:randomUUID(),action:'reject',reservation_id:waiting.id,expected_version:waiting.version,reply:'좌석 부족',reply_vi:'Không đủ chỗ'};
 r=await command(reject,cashierKey);assert.equal(r.status,200);r=await command(reject,cashierKey);assert.equal(r.status,200);
 const confirmed=r.data.state.bookings.find(x=>x.status==='confirmed');
 const change={id:randomUUID(),action:'change',reservation_id:confirmed.id,expected_version:confirmed.version,details:details(confirmed.name,3)};
 r=await command(change);assert.equal(r.status,200);assert.equal(r.data.state.bookings.find(x=>x.id===confirmed.id).party_size,6);
 r=await command({id:randomUUID(),action:'approve',reservation_id:confirmed.id,expected_version:confirmed.version+1},cashierKey);assert.equal(r.status,200);
 const edited=r.data.state.bookings.find(x=>x.id===confirmed.id);assert.equal(edited.party_size,3);
 r=await command({id:randomUUID(),action:'cancel_request',reservation_id:edited.id,expected_version:edited.version});assert.equal(r.status,200);assert.equal(r.data.state.bookings.find(x=>x.id===edited.id).status,'confirmed');
 r=await command({id:randomUUID(),action:'approve',reservation_id:edited.id,expected_version:edited.version+1},cashierKey);assert.equal(r.status,200);assert.equal(r.data.state.bookings.find(x=>x.id===edited.id).status,'cancelled');
 r=await raw(url,null,randomBytes(32).toString('hex'));assert.equal(r.status,403);
 snap=(await raw(url,null,deskKey)).data;assert.equal(snap.state.bookings.length,2);assert.equal(snap.state.events.length,8);assert(snap.state.events.every(x=>x.actor&&x.at));
 console.log(JSON.stringify({result:'PASS',room,checks:['independent role snapshots','same-command concurrent replay','desk cannot approve','two cashiers competing for 9 seats','bilingual rejection','change retains held seats until approval','cancel request/approval','wrong token denied'],bookings:snap.state.bookings.length,events:snap.state.events.length}));
})().catch(e=>{console.error(e);process.exitCode=1});
