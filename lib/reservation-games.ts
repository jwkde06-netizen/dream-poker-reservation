export type ReservableGame={id:string;title:string;starts_at:string;is_open:boolean;is_default_queue?:boolean};
export function guestGames<T extends ReservableGame>(games:T[],now=Date.now()):T[]{
 const scheduled=games.filter(g=>g.is_open&&!g.is_default_queue&&new Date(g.starts_at).getTime()>now-12*3600000);
 const has5m=scheduled.some(g=>/\b5M\b/i.test(g.title));
 return [...scheduled,...(has5m?[]:games.filter(g=>g.is_open&&g.is_default_queue))];
}
export function intakeTitle(lang:'ko'|'en'|'vi'){
 return lang==='ko'?'다음 5M 게임':lang==='vi'?'Ván 5M tiếp theo':'Next 5M game';
}
export function startPending(lang:'ko'|'en'|'vi'){
 return lang==='ko'?'시작 시간 추후 안내':lang==='vi'?'Giờ bắt đầu sẽ được thông báo':'Start time to be announced';
}
