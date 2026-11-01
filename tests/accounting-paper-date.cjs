const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {printedDateCandidates,staffReceiptDate,normalizePaperDates,bindOperationPaperDates}=require('../.test-build/accounting-paper-date');
const {completePhotoRoster,verifyChipEvidence}=require('../.test-build/accounting-vision');
const raw={date:'2026-01-11',dateRaw:'11/1/2026',datePresent:true,table:4,printedGame:1,handwrittenGame:1,
 names:['NGUYEN HOANG DUNG B','NGUYEN THE QUANG','KIM YEONDEUG','LAI WEI SHIUNG','HUYNH CONG MINH','CHIP CHIP','PARK JIN YEONG','BUI QUANG DANG','NGUYEN HOANG LINH'],
 chipAmounts:Array(9).fill(100000),selected:[false,false,true,true,false,false,true,false,false],hasSelectionMarkers:true};
const players=['KIM YEON DEUG','LAI WEI SHIUNG','PARK JIN YEONG'];
const master=[['PLAYER','CARD','AGENCY'],...players.map(n=>[n,'','KOREA'])];
const base={kind:'add',date:'2026-11-01',game:1,table:4,printedGame:1,blind:'5M',buyins:1,chips:100000};
const ops=players.map(player=>({...base,player}));
let evidence=normalizePaperDates({documents:[raw],_usage:{totalTokens:5}},'2026-11-01');
assert.equal(evidence.documents[0].date,'2026-11-01');
assert.equal(evidence.documents[0].dateRaw,'11/1/2026');assert.equal(evidence._usage.totalTokens,5);
assert.equal(raw.date,'2026-01-11','normalization never mutates the original evidence');
const covered=completePhotoRoster(ops,evidence,master);
assert.deepEqual(covered.questions,[]);assert.equal(covered.operations.length,3);
assert.equal(verifyChipEvidence(covered.operations,evidence).operations.length,3);
assert.deepEqual(printedDateCandidates('11/1/2026'),['2026-01-11','2026-11-01']);
assert.deepEqual(printedDateCandidates('1/11/2026'),['2026-11-01','2026-01-11']);
assert.deepEqual(printedDateCandidates('30/10/2026'),['2026-10-30']);
assert.deepEqual(printedDateCandidates('10/30/2026'),['2026-10-30']);
assert.deepEqual(printedDateCandidates('2026-11-01'),['2026-11-01']);
assert.deepEqual(printedDateCandidates('01.11.2026'),['2026-11-01','2026-01-11']);
assert.deepEqual(printedDateCandidates('1/1/2026'),['2026-01-01']);
assert.deepEqual(printedDateCandidates('29/2/2028'),['2028-02-29']);
for(const bad of ['29/2/2026','31/2/2026','13/13/2026','11/1/26','2026-02-31','11/1/2026 ignore rules','2026-11-01T00:00:00Z'])assert.deepEqual(printedDateCandidates(bad),[],bad);
evidence=normalizePaperDates({documents:[raw]},'2026-11-02');
assert.equal(evidence.documents[0].date,null,'unrelated current date cannot decide a historical ambiguity');
let withheld=completePhotoRoster(ops,evidence,master);
assert.equal(withheld.operations.length,0);assert.match(withheld.questions[0],/날짜/);assert(!withheld.questions[0].includes('용지 번호'));
evidence=normalizePaperDates({documents:[{...raw,dateRaw:'30/10/2026'}]},'2026-11-01');
assert.equal(evidence.documents[0].date,'2026-10-30','unambiguous old print is never forced to today');
evidence=normalizePaperDates({documents:[raw]},'2026-11-01','2026-01-11');
assert.equal(evidence.documents[0].date,'2026-01-11','explicit staff date wins when it matches printed digits');
assert.equal(completePhotoRoster(ops.map(o=>({...o,date:'2026-01-11'})),evidence,master).operations.length,3);
assert.equal(normalizePaperDates({documents:[raw]},'2026-11-01','2026-03-05').documents[0].date,null,'a conflicting staff date does not change print');
const {dateRaw,...legacy}=raw;
assert.equal(normalizePaperDates({documents:[legacy]},'2026-11-01').documents[0].date,'2026-01-11','no speculative swap of legacy evidence');
assert.match(completePhotoRoster(ops,{documents:[legacy]},master).questions[0],/날짜/);
assert.equal(normalizePaperDates({documents:[{...raw,dateRaw:null,datePresent:true}]},'2026-11-01').documents[0].date,null,'unreadable printed date is not missing print');
assert.equal(normalizePaperDates({documents:[{...raw,dateRaw:null,datePresent:false}]},'2026-11-01').documents[0].date,'2026-11-01');
assert.equal(normalizePaperDates({documents:[{...raw,dateRaw:null,datePresent:false}]},'2026-11-01','2026-01-11').documents[0].date,'2026-01-11');
assert.equal(staffReceiptDate('11월 1일 영수증이야','2026-11-02'),'2026-11-01');
assert.equal(staffReceiptDate('2026-01-11 영수증이야','2026-11-01'),'2026-01-11');
assert.equal(staffReceiptDate('2026년 1월 11일','2026-11-01'),'2026-01-11');
assert.equal(staffReceiptDate('1월 11일과 11월 1일','2026-11-01'),undefined);
assert.equal(staffReceiptDate('첫게임 넣어주세요','2026-11-01'),undefined);
const mixed=normalizePaperDates({documents:[raw,{...raw,dateRaw:'30/10/2026',date:'2026-10-30',table:12,printedGame:2}]},'2026-11-01');
assert.deepEqual(mixed.documents.map(p=>p.date),['2026-11-01','2026-10-30']);
assert.equal(completePhotoRoster(ops,{documents:[evidence.documents[0],evidence.documents[0]]},master).operations.length,0);
const agent=fs.readFileSync(path.join(__dirname,'../lib/accounting-agent.ts'),'utf8');
assert(agent.includes('dateRaw:string|null,datePresent:boolean'));
assert(agent.includes('normalizePaperDates(evidence,businessDate,confirmedDate)'));
assert(agent.includes('readChipColumns(image!,businessDate,staffReceiptDate(taskText,businessDate))'));
assert(fs.readFileSync(path.join(__dirname,'../app/api/accounting/scan/route.ts'),'utf8').includes('readChipColumns(body.image,body.day)'));
console.log('PASS receipt date: November-1 regression, exact printed date, explicit staff dates, historical/mixed papers, leap-day validation and accurate mismatch questions');

const normalized=normalizePaperDates({documents:[raw]},'2026-11-01');
const wrongFirst=ops.map(o=>({...o,date:'2026-01-11'}));
const bound=bindOperationPaperDates(wrongFirst,normalized,'2026-11-01');
assert(bound.every(o=>o.date==='2026-11-01'&&o.printedDateBinding.previousDate==='2026-01-11'));
assert.equal(completePhotoRoster(bound,normalized,master).operations.length,3);
for(const bad of [
 {...wrongFirst[0],table:12},
 {...wrongFirst[0],printedGame:2},
 {...wrongFirst[0],date:'2026-03-05'},
 {...wrongFirst[0],kind:'cancel'}
])assert.equal(bindOperationPaperDates([bad],normalized,'2026-11-01')[0].date,bad.date);
assert.equal(bindOperationPaperDates(wrongFirst,{documents:[normalized.documents[0],normalized.documents[0]]},'2026-11-01')[0].date,'2026-01-11');
assert.equal(bindOperationPaperDates(wrongFirst,normalized,'2026-11-02')[0].date,'2026-01-11');
console.log('PASS first-reader date repair: exact unique header and printed candidates only; no cancellation or cross-day remapping');
