// Handwriting must stay attached to the header it corrects. Legacy evidence
// remains supported; new readers explicitly identify the adjacent field.
export const headerBindingInstruction='Bind handwritten numbers to their spatial header: a number beside or crossing Table corrects the TABLE, never the game. Example printed No.5, Table 2 with handwritten 4 beside Table means printedGame=5, table=4, handwrittenGame=null. A number beside No. or clearly isolated at the top as a game label may correct the GAME. LV3/LV4 are levels. 3M/5M/10M/15M are stake labels, NEVER game numbers: handwritten 5M must not become game 5 or 54 (M is a letter, not 4). Copy the exact visible ink as rawText, including letters. Return headerCorrections:[{field:"table"|"game"|"level"|"unknown",value:integer,rawText:string}] for visible handwritten labels. Mark stake labels as unknown. A game correction must be a standalone numeric label, not a stake or level. Never infer a game correction from a table correction.';
export function bindPaperHeaders(paper:any){
 if(!Array.isArray(paper?.headerCorrections))return paper;
 const unique=(field:string)=>Array.from(new Set(paper.headerCorrections.filter((x:any)=>x.field===field&&Number.isInteger(x.value)&&x.value>0&&
  // Keep legacy evidence compatible, but a new reader must show numeric ink.
  // In particular, an OCR value of 54 with rawText=5M is not a game correction.
  (x.rawText===undefined||typeof x.rawText==='string'&&/^\s*\d+\s*$/.test(x.rawText)&&Number(x.rawText.trim())===x.value)).map((x:any)=>x.value)));
 const tables=unique('table'),games=unique('game');
 return {...paper,headerAmbiguous:tables.length>1||games.length>1,printedTable:paper.printedTable??paper.table,table:tables.length===1?tables[0]:tables.length>1?null:paper.table,handwrittenGame:games.length===1?games[0]:null};
}
// A correction is one request, not independent delete/add requests. If any
// replacement is withheld, preserve ALL existing entries until it is verified.
export function correctionBlocked(original:any[],accepted:any[],question:unknown){
 const replacements=original.filter(o=>['add','total'].includes(o.kind));
 if(!original.some(o=>o.kind==='cancel')||!replacements.length)return false;
 const key=(o:any)=>JSON.stringify([o.kind,o.date,o.game,o.table,o.player,o.buyins]);
 return !!question||replacements.some(o=>!accepted.some(a=>key(a)===key(o)));
}
