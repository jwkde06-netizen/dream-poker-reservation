export type ReservationNames={player_name:string;player_name_en?:string|null;player_name_ko?:string|null};
export function bookingName(p:ReservationNames){
 const names=[p.player_name_en?.trim(),p.player_name_ko?.trim()].filter((n):n is string=>!!n);
 return Array.from(new Set(names)).join(' · ')||p.player_name;
}
export function validBookingNames(en:string,ko:string){
 const names=[en.trim(),ko.trim()].filter(Boolean);
 return names.length>0&&names.every(n=>n.length>=2&&n.length<=80);
}

export function validEnglishBookingName(value:string){
 const name=value.trim();
 return name.length<=80&&/^[A-Za-z .'-]+$/.test(name)&&(name.match(/[A-Za-z]/g)||[]).length>=2;
}
