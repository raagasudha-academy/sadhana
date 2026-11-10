import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareM95OperationalTransfer,hashRecord,M95_EXPECTED,normalizeM95IndexKeys} from '../../scripts/operationalTransferCore.mjs';

const source=()=>({calendar:[],admin:[],audit:[],students:[],learning:[]});
const rec=(institution,id,recordType,extra={})=>({PK:`SCHEDULE#${institution}`,SK:`RECORD#${id}`,institution,id,recordType,...extra});
function baseline(){
 const src=source();
 for(const [inst,n] of [['raaga',16],['sruti',6]])for(let i=1;i<=n;i++)src.calendar.push(rec(inst,`CL-${inst}-${i}`,'class',{name:'Vocal',teacherId:'T1',venueId:'V1'}));
 for(const [inst,n] of [['raaga',279],['sruti',103]])for(let i=1;i<=n;i++)src.calendar.push(rec(inst,`SS-${inst}-${i}`,'class-session',{classId:`CL-${inst}-1`,teacherId:'T1',venueId:'V1',date:'2026-11-09',startTime:'10:00',endTime:'11:00'}));
 for(let i=1;i<=32;i++)src.calendar.push(rec('shared',`HOL-${i}`,'holiday',{date:'2026-12-25',allDay:true}));
 for(let i=1;i<=6;i++)src.calendar.push(rec(i<=5?'raaga':'sruti',`EV-${i}`,'special-event',{name:'Event',date:'2026-11-10',startTime:'15:00',endTime:'16:00'}));
 for(let i=1;i<=3;i++)src.calendar.push({PK:`VENUE#V${i}`,SK:'DETAIL',id:`V${i}`,name:`Venue ${i}`});
 for(let i=1;i<=9;i++){const inst=i<=7?'sruti':'raaga';src.calendar.push({PK:`SCHEDULE_SERIES#${inst}`,SK:`RULE#${i}`,institution:inst,classId:`CL-${inst}-1`,effectiveFrom:'2026-11-09',changes:{startTime:'10:00'}});}
 for(let i=1;i<=7;i++){
   const id=`T${i}`,sub=`SUB${i}`;
   src.admin.push({PK:'TEACHER_REGISTRY',SK:`TEACHER#${id}`,id,displayName:`Teacher ${i}`,cognitoSub:sub,institutions:['raaga','sruti']});
   src.admin.push({PK:`TEACHER_SUB#${sub}`,SK:'LINK',teacherId:id});
 }
 for(let i=1;i<=174;i++)src.audit.push({PK:'AUDIT#raaga',SK:`EVENT#${i}`,at:'2026-11-01T10:00:00Z'});
 return src;
}
test('selects exactly 461 operational records and excludes audits/learning',()=>{
 const p=prepareM95OperationalTransfer(baseline());
 assert.deepEqual(p.problems,[]);
 assert.equal(p.ready,true);
 assert.equal(p.items.length,461);
 assert.deepEqual(p.counts,M95_EXPECTED);
 assert.equal(p.excludedAudit,174);
 assert.equal(p.teacherIdentityLinks,7);
 assert.ok(p.items.every(x=>x.tableName.startsWith('sadhana-dev-m9-')));
 assert.ok(p.items.every(x=>x.item.m95TransferHash===hashRecord(Object.fromEntries(Object.entries(x.item).filter(([key])=>key!=='m95TransferHash')))));
});
test('the transfer fingerprint is stable regardless of source ordering',()=>{
 const a=baseline(),b=structuredClone(a);for(const key of Object.keys(b))b[key].reverse();
 assert.equal(prepareM95OperationalTransfer(a).fingerprint,prepareM95OperationalTransfer(b).fingerprint);
});
test('stops on baseline drift and orphan references',()=>{
 const a=baseline();a.audit.pop();assert.equal(prepareM95OperationalTransfer(a).ready,false);
 const b=baseline();b.calendar.find(x=>x.recordType==='class-session').classId='MISSING';
 assert.equal(prepareM95OperationalTransfer(b).ready,false);
});
test('stops when student records have reappeared',()=>{
 const a=baseline();a.students.push({PK:'X',SK:'Y'});
 assert.equal(prepareM95OperationalTransfer(a).ready,false);
});


test('removes NULL GSI key attributes without changing other optional NULLs',()=>{
 const row={sessionId:'S1',institutionId:'raaga',seriesId:null,classId:null,startAt:null,endAt:null,localEndDate:null};
 const sanitized=normalizeM95IndexKeys('sadhana-dev-m9-sessions',structuredClone(row));
 assert.equal(Object.hasOwn(sanitized,'seriesId'),false);
 assert.equal(Object.hasOwn(sanitized,'classId'),false);
 assert.equal(Object.hasOwn(sanitized,'startAt'),false);
 assert.equal(sanitized.endAt,null);
 assert.equal(sanitized.localEndDate,null);
 assert.equal(row.seriesId,null,'original record must remain unchanged');
});

test('retains non-NULL index attributes and rejects malformed index keys',()=>{
 const sample={sessionId:'S2',institutionId:'raaga',classId:'C1',seriesId:'C1',startAt:'2026-11-07T10:00:00Z'};
 assert.deepEqual(normalizeM95IndexKeys('sadhana-dev-m9-sessions',structuredClone(sample)),sample);
 assert.throws(()=>normalizeM95IndexKeys('sadhana-dev-m9-sessions',{sessionId:'S3',institutionId:'raaga',seriesId:12}),/Invalid GSI key/);
});

test('generated transfer payload contains no explicit NULL attributes for any GSI key',()=>{
 const plan=prepareM95OperationalTransfer(baseline());
 assert.equal(plan.ready,true);
 const schemaKeys={
   'sadhana-dev-m9-sessions':['institutionId','startAt','classId','seriesId'],
   'sadhana-dev-m9-people':['cognitoSub','directoryGroup','displayNameSort'],
   'sadhana-dev-m9-classes':['institutionId','nameSort'],
   'sadhana-dev-m9-events':['institutionId','startAt','organiserPersonId'],
 };
 for(const row of plan.items){
   for(const key of schemaKeys[row.tableName]??[])
     assert.notEqual(row.item[key],null,`${row.tableName}.${key}`);
 }
 const oneSession=plan.items.find(x=>x.tableName==='sadhana-dev-m9-sessions'&&x.item.recordType==='class-session');
 assert.equal(Object.hasOwn(oneSession.item,'seriesId'),false);
 assert.equal(oneSession.item.m95TransferHash,hashRecord(Object.fromEntries(Object.entries(oneSession.item).filter(([key])=>key!=='m95TransferHash'))));
});
