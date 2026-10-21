// Server-owned deployment profile. A future room gets its own authorized
// workbook and profile; no browser/chat may supply an arbitrary workbook ID.
export const settlementProfile = {
 id:'dream', name:'Dream Poker', timezone:'Asia/Ho_Chi_Minh', currency:'VND',
 workbook:'1QJUPswetSgSFAlKkDXdY_WMmM6LCp6nXs9EvmuQF22I',
 tabs:{daily:'일일 입력',fnb:'F&B 입력',weekly:'주간 정산'},
 sheetIds:{daily:2105749969,fnb:11003,weekly:11004},
 dailyHeaders:['NUMBER','DATE','T NO.','BLIND','PLAYER','CARD NO.','AGENCY','BUY IN','RAKE','RAKE BACK','MONGOL','JAPAN','CHINA (AK)','HOUSE','KOREA2'],
 columns:{date:1,table:2,player:4,agency:6,buyins:7,rake:8,back:9,mongol:10,japan:11,china:12,house:13,korea2:14},
};
