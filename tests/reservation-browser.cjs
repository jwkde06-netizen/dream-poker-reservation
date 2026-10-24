// Local verification harness for the real operational React component and SQL functions.
// Binds loopback only. Uses invented staff identities and isolated in-memory PostgreSQL.
// Supabase Auth/Realtime, Telegram and Google delivery are NOT simulated as successful.
const fs=require('node:fs'),http=require('node:http'),crypto=require('node:crypto'),ts=require('typescript');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const pg=new PGlite(),users={desk:crypto.randomUUID(),cashier:crypto.randomUUID()};let queue=Promise.resolve();
const transpile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const component=transpile('app/OperationalReservations.tsx'),command=transpile('lib/reservation-command.ts'),copy=transpile('lib/reservation-ui.ts');
const client=String.raw`
const role=location.pathname.includes('cashier')?'cashier':'desk';
async function api(body){try{const r=await fetch('/test-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,role})});return await r.json()}catch(e){return{error:{message:e.message}}}}
const db={from(table){const q={kind:'select',table,filters:[],limit:1000};const builder={select(){return builder},eq(k,v){q.filters.push([k,v]);return builder},order(k,o){q.order=[k,o?.ascending];return builder},limit(n){q.limit=n;return builder},then(resolve,reject){return api(q).then(resolve,reject)}};return builder},rpc(name,args){return api({kind:'rpc',name,args})},channel(){const c={on(){return c},subscribe(){return c}};return c},removeChannel(){return Promise.resolve()},auth:{getSession:async()=>({data:{session:null}})}};
const commands={exports:{}};
`;
function html(){return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dream Poker · Isolated operational verification</title><style>body{margin:0;background:#101115;color:#eee;font-family:Arial,sans-serif}*{box-sizing:border-box}.verification{background:#3c2714;padding:10px 24px;color:#e8c77e;font-size:14px}a{color:#d7ba77}${fs.readFileSync('app/OperationalReservations.module.css','utf8')}</style></head><body><div class="verification">LOCAL VERIFICATION · 실제 운영 코드 + 분리된 PostgreSQL · 외부 전송 없음</div><div id="root"></div><script src="/react.js"></script><script src="/react-dom.js"></script><script>${client}
(function(module,exports){${command}})(commands,commands.exports);
const copyModule={exports:{}};
(function(module,exports){${copy}})(copyModule,copyModule.exports);
const componentModule={exports:{}};
function require(n){if(n==='react')return React;if(n==='react/jsx-runtime')return{jsx:(t,p,k)=>React.createElement(t,{...p,key:k}),jsxs:(t,p,k)=>React.createElement(t,{...p,key:k}),Fragment:React.Fragment};if(n.endsWith('/db'))return{db};if(n.endsWith('/reservation-command'))return commands.exports;if(n.endsWith('/reservation-ui'))return copyModule.exports;if(n.endsWith('.css'))return{default:new Proxy({},{get:(_,k)=>k})};throw Error(n)}
(function(module,exports){${component}})(componentModule,componentModule.exports);
function Verification(){const [lang,setLang]=React.useState('ko');return React.createElement(React.Fragment,null,React.createElement('select',{'aria-label':'Language',value:lang,onChange:e=>setLang(e.target.value)},['ko','en','vi'].map(v=>React.createElement('option',{key:v,value:v},v))),React.createElement(componentModule.exports.default,{lang,workspace:role,profileName:'TEST '+role.toUpperCase(),admin:false,onLogout:()=>{},management:null}))}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Verification));
</script></body></html>`}
async function request(body){
 if(!users[body.role])throw Error('Invalid test role');
 return pg.transaction(async tx=>{
  await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[users[body.role]]);
  await tx.exec('set local role authenticated');
  if(body.kind==='rpc'){
   const calls={submit_reservation_request:['p_command','p_data'],staff_reservation_command:['p_command','p_id','p_version','p_action','p_data'],reservation_sheet_status:[]};
   const keys=calls[body.name];if(!keys)throw Error('Unsupported test call');
   const result=await tx.query(`select public.${body.name}(${keys.map((k,i)=>k+' => $'+(i+1)).join(',')}) as result`,keys.map(k=>body.args?.[k]));
   return {data:result.rows[0].result,error:null};
  }
  if(body.kind==='select'){
   if(!['reservations','reservation_games','reservation_audit'].includes(body.table))throw Error('Unsupported table');
   const params=[],clauses=[];
   for(const [key,value] of body.filters||[]){if(!['is_test','reservation_id'].includes(key))throw Error('Unsupported filter');params.push(value);clauses.push(key+'=$'+params.length)}
   const order=body.order?.[0];if(order&&!['id','created_at','starts_at'].includes(order))throw Error('Unsupported order');
   const sql=`select * from public.${body.table}${clauses.length?' where '+clauses.join(' and '):''}${order?' order by '+order+(body.order[1]?' asc':' desc'):''} limit ${Math.min(1000,Number(body.limit)||1000)}`;
   return {data:(await tx.query(sql,params)).rows,error:null};
  }
  throw Error('Invalid test request');
 });
}
(async()=>{
 await pg.exec(fs.readFileSync('tests/fixtures/reservation-schema.sql','utf8'));
 for(const file of ['20261024092735_reservation_operations.sql','20261024094526_reservation_operations_transitions.sql','20261024094527_reservation_sheet_delivery.sql','20261024100342_reservation_test_queue_isolation.sql','20261024101021_reservation_request_actor_label.sql'])await pg.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 await pg.exec(`grant usage on schema public,auth to authenticated;grant select on reservations,reservation_games,reservation_audit to authenticated;
 alter table reservations enable row level security;create policy staff_read on reservations for select to authenticated using(current_app_role() in ('admin','staff','desk','cashier'));
 alter table reservation_audit enable row level security;create policy staff_read on reservation_audit for select to authenticated using(current_app_role() in ('admin','staff','desk','cashier'));`);
 for(const role of ['desk','cashier']){await pg.query('insert into auth.users(id,email) values($1,$2)',[users[role],role+'@example.invalid']);await pg.query('insert into user_profiles(user_id,role,active,display_name) values($1,$2,true,$3)',[users[role],role,'TEST '+role.toUpperCase()])}
 await pg.exec("insert into reservation_games(title,starts_at,capacity,is_open,is_default_queue,is_test) values('TEST · Dream Poker 5M',now(),9,true,true,true)");
 http.createServer(async(req,res)=>{
  try{
   if(req.method==='GET'&&req.url.startsWith('/react')){const file=req.url==='/react.js'?'node_modules/react/umd/react.development.js':'node_modules/react-dom/umd/react-dom.development.js';res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(file));return}
   if(req.method==='POST'&&req.url==='/test-api'){
    const buffers=[];for await(const chunk of req){buffers.push(chunk);if(Buffer.concat(buffers).length>10000)throw Error('Request too large')}
    const body=JSON.parse(Buffer.concat(buffers));const task=queue.then(()=>request(body));queue=task.catch(()=>{});
    let data;try{data=await task}catch(e){data={data:null,error:{message:e.message}}}res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return;
   }
   if(req.method==='GET'&&req.url==='/verification-counts'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify((await pg.query('select (select count(*) from reservation_private.outbox) as telegram_jobs,(select revision from reservation_private.sheet_sync) as sheet_revision,(select count(*) from reservations where not is_test) as operational_bookings')).rows[0]));return}
   if(req.method==='GET'&&/^\/(desk|cashier)(\?|$)/.test(req.url)){res.setHeader('Content-Type','text/html');res.end(html());return}
   res.writeHead(404);res.end('Not found');
  }catch(e){res.writeHead(500);res.end('Test harness error')}
 }).listen(8786,'127.0.0.1',()=>console.log('Isolated operational UI: http://127.0.0.1:8786/desk?test=1 and /cashier?test=1'));
})().catch(e=>{console.error(e.message);process.exitCode=1});
