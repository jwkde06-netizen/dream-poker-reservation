import {canonicalPlayers,correctedOperations,playerIdentity} from './accounting-context';
import {completePhotoRoster,verifyChipEvidence,photoPlayerExcluded} from './accounting-vision';
import {bindPaperHeaders} from './accounting-corrections';
import {serial} from './accounting-plan';

export function scanImage(value:unknown){
 if(typeof value!=='string'||value.length>3500000)throw Error('사진 용량을 줄여 다시 선택해주세요.');
 const match=value.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
 if(!match)throw Error('JPG, PNG 또는 WebP 사진을 선택해주세요.');
 const bytes=Buffer.from(match[2],'base64');
 if(bytes.length<16||bytes.length>2600000||bytes.toString('base64')!==match[2])throw Error('사진 파일을 확인해주세요.');
 const valid=match[1]==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:match[1]==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
 if(!valid)throw Error('사진 파일 형식을 확인해주세요.');
 return bytes;
}

// A web scan is a review draft only. No model output is a sheet command.
export function scanReview(result:any,evidence:any,master:any[][],rules:any[],day:string){
 serial(day);
 if(result?.documentType!=='paper_game')throw Error('바이인 시트의 종이 명단을 촬영해주세요.');
 if(!Array.isArray(evidence?.documents)||evidence.documents.length!==1)throw Error('바이인 시트를 한 장씩 촬영해주세요.');
 const paper=bindPaperHeaders(evidence.documents[0]);
 if(paper.date&&paper.date!==day)throw Error(`사진 날짜는 ${paper.date}입니다. 현재 영업일 ${day}의 시트를 선택해주세요.`);
 if(!Array.isArray(paper.names)||!Array.isArray(paper.chipAmounts)||paper.names.length!==paper.chipAmounts.length||paper.names.length>20)throw Error('명단을 읽지 못했습니다. 이름과 칩 수가 보이도록 촬영해주세요.');
 const ops=correctedOperations(Array.isArray(result.operations)?result.operations:[],'',master,rules).filter(o=>['add','total'].includes(o.kind));
 const complete=completePhotoRoster(ops,evidence,master,rules);
 const verified=verifyChipEvidence(complete.operations,evidence,rules).operations;
 const known=canonicalPlayers(master),players:any[]=[],warnings:string[]=[];
 for(let i=0;i<paper.names.length;i++){
  const raw=paper.names[i];if(typeof raw!=='string'||!raw.trim()||paper.crossedOut?.[i]===true)continue;
  const identity=playerIdentity(raw,rules),matches=known.filter(m=>playerIdentity(m[0],rules)===identity);
  if(photoPlayerExcluded(raw,rules))continue;
  if(matches.length!==1||!matches[0][2]){if(paper.hasSelectionMarkers&&paper.selected?.[i])warnings.push(`${raw}: 등록된 이름과 소속을 확인해주세요.`);continue;}
  const duplicate=players.find(p=>playerIdentity(p.player,rules)===identity);
  if(duplicate){duplicate.buyins='';warnings.push(`${raw}: 중복으로 읽혀 총 바인을 직접 확인해주세요.`);continue;}
  const matched=verified.filter(o=>playerIdentity(o.player,rules)===identity);
  const chips=paper.chipAmounts[i];
  const count=matched.length===1&&Number.isSafeInteger(chips)&&chips>=100000&&chips<=5000000&&chips%100000===0&&matched[0].buyins===chips/100000?chips/100000:'';
  players.push({player:String(matches[0][0]),buyins:count});
  if(count==='')warnings.push(`${matches[0][0]}: 총 바인을 확인해주세요.`);
 }
 if(!players.length)throw Error(warnings[0]||'등록된 플레이어를 찾지 못했습니다. 이름이 선명하게 보이는지 확인해주세요.');
 const blinds=Array.from(new Set(ops.map(o=>o.blind).filter(b=>['3M','5M','10M','15M'].includes(b))));
 return {date:day,table:!paper.headerAmbiguous&&Number.isSafeInteger(paper.table)?paper.table:'',blind:blinds.length===1?blinds[0]:'',sourceNo:Number.isSafeInteger(paper.printedGame)?String(paper.printedGame):'',players,warnings:Array.from(new Set(warnings))};
}
