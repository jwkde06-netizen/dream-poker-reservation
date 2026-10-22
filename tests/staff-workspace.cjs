const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function compile(path,requireFn=require){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{exports,require:requireFn});return exports;}
const {canAccessStaffWorkspace}=compile('lib/staff-workspace.ts');
for(const role of ['admin','staff','cashier','desk','pending','guest'])for(const workspace of ['cashier','desk']){
 assert.equal(canAccessStaffWorkspace({role,active:true},workspace),['admin','staff',workspace].includes(role));
 assert.equal(canAccessStaffWorkspace({role,active:false},workspace),false);
}
assert.equal(canAccessStaffWorkspace(null,'cashier'),false);
const Dashboard=compile('app/StaffDashboard.tsx',name=>{
 if(name.startsWith('./'))return {default:()=>null,__esModule:true};
 if(name.startsWith('../lib/'))return compile(name.replace('../','')+'.ts');
 return require(name);
}).default;
const game={id:'game',title:'Next 5M',is_default_queue:true,is_open:true,starts_at:'2026-10-22T10:00:00Z',capacity:9,table_no:'',description:''};
const booking={id:'test',game_id:'game',player_name:'TEST PLAYER',status:'confirmed',version:1,arrival_at:'2026-10-22T10:00:00Z',created_at:'2026-10-22T09:00:00Z'};
const props={lang:'en',games:[game],bookings:[booking],bookingsLoaded:true,stats:[],running:0,profileName:'TEST STAFF',admin:false,busy:false,refreshing:false,onLogout(){},onRefresh(){},onManage(){},onCreate(){},onToggle(){},newGame:{title:'Next 5M',starts:'2026-10-22T17:00',capacity:'9',table_no:'4',game_no:'2',description:''},setNewGame(){},sound:false,setSound(){},audit:[]};
const cashier=renderToStaticMarkup(React.createElement(Dashboard,{...props,workspace:'cashier',canManageGames:true}));
const desk=renderToStaticMarkup(React.createElement(Dashboard,{...props,workspace:'desk',canManageGames:false,lang:'ko'}));
assert(cashier.includes('Cashier'));assert(cashier.includes('Open next game'));assert(cashier.includes('staffGames'));
assert(desk.includes('한국인 데스크'));assert(desk.includes('staffDeskGrid'));assert(!desk.includes('staffGames'));assert(!desk.includes('다음 게임 예약 열기'));
for(const html of [cashier,desk]){assert(html.includes('TEST PLAYER'));assert(html.includes('staffActionGrid'));assert(!html.includes('Account management'));}
console.log('PASS: active staff role access and distinct cashier/desk interfaces with shared reservation review');
