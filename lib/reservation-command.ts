// Keep the same command after a lost response, including a page reload.
export function reservationCommand(scope:string, body:unknown){
 const fingerprint=JSON.stringify(body), key='dream-reservation-command:'+scope;
 try {
  const saved=JSON.parse(sessionStorage.getItem(key)||'null');
  if(saved?.fingerprint===fingerprint&&typeof saved?.id==='string')return saved.id as string;
 } catch {}
 const id=crypto.randomUUID();
 try{sessionStorage.setItem(key,JSON.stringify({id,fingerprint}));}catch{}
 return id;
}
export function forgetReservationCommand(scope:string){try{sessionStorage.removeItem('dream-reservation-command:'+scope)}catch{}}
