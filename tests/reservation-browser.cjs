// Local verification harness for the real operational React component and SQL functions.
// Binds loopback only. Uses invented staff identities and isolated in-memory PostgreSQL.
// Supabase Auth/Realtime, Telegram and Google delivery are NOT simulated as successful.
const fs=require('node:fs'),http=require('node:http'),crypto=require('node:crypto'),ts=require('typescript');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const pg=new PGlite(),users={desk:crypto.randomUUID(),cashier:crypto.randomUUID()};let queue=Promise.resolve();
const transpile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
let component=transpile('app/OperationalReservations.tsx');const command=transpile('lib/reservation-command.ts'),copy=transpile('lib/reservation-ui.ts'),authCopy=transpile('lib/staff-auth.ts'),login=transpile('app/StaffLogin.tsx'),workflow=transpile('lib/reservation-workflow.ts');
const client=String.raw`
const role=location.pathname.includes('desk')?'desk':'cashier';
let verificationOffline=false,verificationDropResponse=false;
async function api(body){if(verificationOffline)return {error:{message:'Test connection unavailable'}};try{const r=await fetch('/test-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,role})});const result=await r.json();if(verificationDropResponse&&body.kind==='rpc'&&['staff_reservation_command','submit_reservation_request'].includes(body.name)){verificationDropResponse=false;return{error:{message:'Response lost after server commit'}}}return result}catch(e){return{error:{message:e.message}}}}
const db={from(table){const q={kind:'select',table,filters:[],limit:1000};const builder={select(columns){q.latest=columns?.includes('latest_audit:');return builder},eq(k,v){q.filters.push([k,v]);return builder},order(k,o){if(!o?.referencedTable)q.order=[k,o?.ascending];return builder},limit(n,o){if(!o?.referencedTable)q.limit=n;return builder},then(resolve,reject){return api(q).then(resolve,reject)}};return builder},rpc(name,args){if(name==='resolve_login_email')return Promise.resolve({data:'test@example.invalid',error:null});return api({kind:'rpc',name,args})},channel(){const c={on(){return c},subscribe(){return c}};return c},removeChannel(){return Promise.resolve()},auth:{getSession:async()=>({data:{session:null}}),signInWithPassword:async()=>({error:{code:'invalid_credentials'}}),resetPasswordForEmail:async()=>({error:{code:'mock_delivery_disabled'}})}};
const commands={exports:{}};
`;
function html(){component=transpile('app/OperationalReservations.tsx');return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dream Poker · Isolated operational verification</title><style>body{margin:0;background:#101115;color:#eee;font-family:Arial,sans-serif}*{box-sizing:border-box}.verification{background:#3c2714;padding:10px 24px;color:#e8c77e;font-size:14px}a{color:#d7ba77}${fs.readFileSync('app/globals.css','utf8')}${fs.readFileSync('app/OperationalReservations.module.css','utf8')}</style></head><body><div class="verification">LOCAL VERIFICATION · 실제 운영 코드 + 분리된 PostgreSQL · 외부 전송 없음</div><div class="verification"><button id="offline-check" onclick="verificationOffline=!verificationOffline;this.textContent=verificationOffline?'Reconnect this screen':'Disconnect this screen'">Disconnect this screen</button><button onclick="verificationDropResponse=true">Lose next response</button></div><div id="root"></div><script src="/react.js"></script><script src="/react-dom.js"></script><script>${client}
(function(module,exports){${command}})(commands,commands.exports);
const copyModule={exports:{}};
(function(module,exports){${copy}})(copyModule,copyModule.exports);
const authModule={exports:{}};
(function(module,exports){${authCopy}})(authModule,authModule.exports);
const workflowModule={exports:{}};
(function(module,exports){${workflow}})(workflowModule,workflowModule.exports);
const componentModule={exports:{}},loginModule={exports:{}};
function require(n){if(n==='react')return React;if(n==='react/jsx-runtime')return{jsx:(t,p,k)=>React.createElement(t,{...p,key:k}),jsxs:(t,p,k)=>React.createElement(t,{...p,key:k}),Fragment:React.Fragment};if(n.endsWith('/db'))return{db,configured:true};if(n.endsWith('/staff-auth'))return authModule.exports;if(n.endsWith('/reservation-command'))return commands.exports;if(n.endsWith('/reservation-ui'))return copyModule.exports;if(n.endsWith('/reservation-workflow'))return workflowModule.exports;if(n.endsWith('.css'))return{default:new Proxy({},{get:(_,k)=>k})};throw Error(n)}
(function(module,exports){${component}})(componentModule,componentModule.exports);
(function(module,exports){${login}})(loginModule,loginModule.exports);
function Verification(){const [lang,setLang]=React.useState('en');return React.createElement('main',{className:'shell bookingTheme themeDark staffShell staffMobileShell'},React.createElement('header',{className:'header'},React.createElement('div',{className:'brand'},React.createElement('img',{className:'brandLogo',src:'/dream-poker-logo.svg',alt:'Dream Poker'}),React.createElement('strong',null,'Dream Poker')),React.createElement('div',{className:'bookingHeaderActions'},React.createElement('select',{'aria-label':'Language',value:lang,onChange:e=>setLang(e.target.value)},[['ko','한국어'],['en','English'],['vi','Tiếng Việt']].map(([v,label])=>React.createElement('option',{key:v,value:v},label))))),location.pathname==='/login'?React.createElement(loginModule.exports.default,{lang,workspace:'cashier'}):React.createElement(componentModule.exports.default,{lang,workspace:role,profileName:'TEST '+role.toUpperCase(),admin:false,onLogout:()=>{},management:null}))}
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
   const rows=(await tx.query(sql,params)).rows;
   if(body.table==='reservations'&&body.latest)for(const row of rows)row.latest_audit=(await tx.query('select * from public.reservation_audit where reservation_id=$1 order by id desc limit 1',[row.id])).rows;
   return {data:rows,error:null};
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
   if(req.method==='GET'&&req.url==='/dream-poker-logo.svg'){res.setHeader('Content-Type','image/svg+xml');res.end(fs.readFileSync('public/dream-poker-logo.svg'));return}
   if(req.method==='GET'&&req.url==='/mobile'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><meta charset="utf-8"><title>Cashier mobile verification</title><style>body{background:#24262b;color:#fff;font-family:Arial;margin:0;padding:12px}iframe{display:block;width:390px;height:800px;border:1px solid #555;margin:10px auto}</style><p>LOCAL VERIFICATION · 390px mobile viewport</p><iframe title="Cashier mobile viewport" src="/cashier?test=1"></iframe></html>');return}
   if(req.method==='GET'&&req.url.startsWith('/react')){const file=req.url==='/react.js'?'node_modules/react/umd/react.development.js':'node_modules/react-dom/umd/react-dom.development.js';res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(file));return}
   if(req.method==='POST'&&req.url==='/test-api'){
    const buffers=[];for await(const chunk of req){buffers.push(chunk);if(Buffer.concat(buffers).length>10000)throw Error('Request too large')}
    const body=JSON.parse(Buffer.concat(buffers));const task=queue.then(()=>request(body));queue=task.catch(()=>{});
    let data;try{data=await task}catch(e){data={data:null,error:{message:e.message}}}res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return;
   }
   if(req.method==='GET'&&req.url==='/verification-counts'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify((await pg.query('select (select count(*) from reservation_private.outbox) as telegram_jobs,(select revision from reservation_private.sheet_sync) as sheet_revision,(select count(*) from reservations where not is_test) as operational_bookings')).rows[0]));return}
   if(req.method==='GET'&&/^\/(desk|cashier|login)(\?|$)/.test(req.url)){res.setHeader('Content-Type','text/html');res.end(html());return}
   res.writeHead(404);res.end('Not found');
  }catch(e){res.writeHead(500);res.end('Test harness error')}
 }).listen(8786,'127.0.0.1',()=>console.log('Isolated operational UI: http://127.0.0.1:8786/desk?test=1 and /cashier?test=1'));
})().catch(e=>{console.error(e.message);process.exitCode=1});
