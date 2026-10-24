const fs=require('node:fs');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{
 const db=new PGlite();
 try{
  await db.exec(fs.readFileSync('tests/fixtures/reservation-schema.sql','utf8'));
  for(const file of ['20261024092735_reservation_operations.sql','20261024094526_reservation_operations_transitions.sql','20261024094527_reservation_sheet_delivery.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  await db.exec(fs.readFileSync('tests/reservation-operations.sql','utf8'));
  await db.exec(fs.readFileSync('tests/reservation-delivery-postgres.sql','utf8'));
  console.log('Isolated PostgreSQL checks passed: exact migration, staff roles, retries, capacity, changes, cancellation, audit and test isolation.');
 }finally{await db.close()}
})().catch(e=>{console.error({message:e.message,detail:e.detail,where:e.where,position:e.position});process.exitCode=1});
