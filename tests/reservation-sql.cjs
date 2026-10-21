const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
(async()=>{
 const db=new PGlite();
 try{
  // Minimal fixture from observed production columns/defaults, without any guest data.
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create table public.reservation_games(id uuid primary key default gen_random_uuid(),title text not null,starts_at timestamptz not null,capacity integer not null default 9 check(capacity between 1 and 30),is_open boolean not null default true,table_no text not null default '',game_no text not null default '',booking_state text not null default 'open');
   create table public.reservations(id uuid primary key default gen_random_uuid(),game_id uuid not null references public.reservation_games(id),player_name text not null check(length(player_name) between 2 and 80),arrival_at timestamptz not null,lookup_token uuid not null unique default gen_random_uuid(),status text not null default 'pending' check(status in ('pending','confirmed','waitlisted','rejected','cancelled','checked_in','no_show')),guest_note text not null default '',created_at timestamptz not null default now());
   grant select,insert,update on public.reservation_games,public.reservations to service_role;`);
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/reservation_agent.sql'),'utf8'));
  await db.exec('set role service_role');
  const game=randomUUID(),next=randomUUID();
  await db.query("insert into public.reservation_games(id,title,starts_at,capacity,table_no,game_no) values($1,'TEST 5M',now(),3,'4','7'),($2,'TEST 5M',now(),1,'5','8')",[game,next]);
  const one=async(sql,args=[])=> (await db.query(sql,args)).rows[0];
  const apply=async(action,source=randomUUID())=>(await one('select public.dream_reservation_apply($1::jsonb,$2,$3) result',[JSON.stringify(action),'staff:synthetic',source])).result;
  const snapshot=async(id=game)=>(await one('select public.dream_reservation_snapshot($1) result',[id])).result[0];
  assert.equal((await snapshot()).held,2);assert.equal((await snapshot()).confirmed,0);
  await apply({kind:'holds',game_id:game,count:3},'synthetic-holds');
  let state=await snapshot();assert.equal(state.capacity,3);assert.equal(state.held,3);assert.equal(state.confirmed,0);assert.equal(state.unheld,0);
  const replay=await apply({kind:'holds',game_id:game,count:3},'synthetic-holds');assert.equal(replay.duplicate,true);assert.equal((await snapshot()).held,3);
  await assert.rejects(()=>apply({kind:'holds',game_id:game,count:2},'synthetic-holds'),/reservation_source_conflict/);
  const hold=state.holds[0].id;
  const replacement=await apply({kind:'replace',hold_id:hold,name:'SYNTHETIC ALICE',arrival_at:new Date().toISOString()},'synthetic-replace');
  state=await snapshot();assert.equal(state.held,2);assert.equal(state.allocated_pending,1);assert.equal(state.confirmed,0);assert.equal(state.pending,1);assert.equal(state.unheld,0);
  await assert.rejects(()=>apply({kind:'replace',hold_id:hold,name:'SYNTHETIC BOB',arrival_at:new Date().toISOString()}),/reservation_hold_stale/);
  assert.equal((await snapshot()).pending,1);
  // The linked pending reservation can be approved without double-counting its hold.
  await db.query("update public.reservations set status='confirmed' where id=$1",[replacement.reservation_id]);
  state=await snapshot();assert.equal(state.confirmed,1);assert.equal(state.allocated_pending,0);assert.equal(state.held,2);
  await assert.rejects(()=>db.query("insert into public.reservations(game_id,player_name,arrival_at,status) values($1,'SYNTHETIC OVERFLOW',now(),'confirmed')",[game]),/reservation_capacity/);
  await assert.rejects(()=>apply({kind:'carryover',game_id:game,count:7}),/reservation_capacity/);
  await assert.rejects(()=>db.query('update public.reservation_games set capacity=2 where id=$1',[game]),/reservation_capacity/);
  await apply({kind:'holds',game_id:game,count:0});
  await apply({kind:'holds',game_id:next,count:0});
  await apply({kind:'assign',reservation_id:replacement.reservation_id,game_id:next});
  assert.equal((await snapshot()).confirmed,0);assert.equal((await snapshot(next)).confirmed,1);
  await apply({kind:'carryover',game_id:game,count:9});state=await snapshot();assert.equal(state.capacity,0);assert.equal(state.unheld,0);assert.equal(state.is_open,false);
  await apply({kind:'carryover',game_id:game,count:6});state=await snapshot();assert.equal(state.capacity,3);assert.equal(state.is_open,true);assert.equal(state.held,2);
  await apply({kind:'holds',game_id:game,count:2});
  const second=(await snapshot()).holds.find(h=>h.status==='held');
  const candidate={kind:'replace',hold_id:second.id,name:'SYNTHETIC RACE',arrival_at:new Date().toISOString()};
  const results=await Promise.allSettled([apply(candidate,'synthetic-race-1'),apply(candidate,'synthetic-race-2')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
  assert.equal((await snapshot()).pending,1);
  // Existing web request path also converts a hold without manufacturing confirmation.
  const web=(await one("insert into public.reservations(game_id,player_name,arrival_at,status) values($1,'SYNTHETIC WEB',now(),'pending') returning id",[game])).id;
  assert.equal((await snapshot()).held,0);assert.equal((await snapshot()).allocated_pending,2);assert.equal((await snapshot()).confirmed,0);
  await db.query('update public.reservations set game_id=$1 where id=$2',[next,web]);
  assert.equal((await snapshot()).allocated_pending,1);
  assert.ok(Number((await one('select count(*) n from public.reservation_desk_events')).n)>5);
  await db.exec('reset role;set role anon');
  await assert.rejects(()=>db.query('select * from public.reservation_desk_holds'),/permission denied/);
  await assert.rejects(()=>db.query('select public.dream_reservation_snapshot(null)'),/permission denied/);
  await assert.rejects(()=>db.query("select public.dream_reservation_apply('{}','forged','forged')"),/permission denied/);
  console.log('Reservation SQL: capacity, named replacements, replay/stale requests, carryover close/reopen and grants passed');
 }finally{await db.close();}
})().catch(error=>{console.error(error);process.exit(1)});
