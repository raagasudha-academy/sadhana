import test from 'node:test';
import assert from 'node:assert/strict';
import {assembleSchedule,assembleManagedEvents,canonicalRecords,makeM95CompatibilityReader} from '../src/m95Compatibility.ts';
import {makeM95CompatibilityRoutes} from '../src/routes/m95CompatibilityRoutes.ts';
// Use records that satisfy the production schedule validator. Master classes have no date;
// dated records require an end date, and every record needs its programme and timezone.
const base=(id:string,recordType:string,institution='raaga')=>({
 institutionId:institution,recordType,
 legacyPayload:{
  PK:`SCHEDULE#${institution}`,SK:`ITEM#${id}`,GSI1PK:`LOOKUP#${id}`,GSI1SK:`INDEX#${id}`,GSI2PK:`SECONDARY#${id}`,GSI2SK:`INDEX#${id}`,entityType:'schedule',
  id,recordType,institution,name:id,
  programme:'Carnatic Vocal',teacher:'',mode:'in-person',location:'Newcastle',
  ...(recordType==='class'?{}:{date:'2026-11-07',endDate:'2026-11-07'}),
  startTime:'10:00',endTime:'11:00',timezone:'Europe/London',
  ...(recordType==='holiday'?{affectsClasses:false}:{}),
  status:'confirmed',version:1
 }
});
const claims={'sub':'fake','cognito:groups':'raagasudha-admin'};
test('legacy schedule reconstructs original endpoint shape without private keys',()=>{
 const result=assembleSchedule('raaga',[base('CLASS-A','class')],[base('SESSION-A','class-session'),base('HOLIDAY','holiday','shared')]);
 assert.equal(result.records.length,2);
 assert.equal(result.more,false);
 for(const key of ['PK','SK','GSI1PK','GSI1SK','GSI2PK','GSI2SK','entityType'])assert.equal(key in result.records[0],false,key);
});
test('shared schedule shows holidays but not class records',()=>{
 const result=assembleSchedule('shared',[base('CLASS-A','class')],[base('H1','holiday','shared')]);
 assert.deepEqual(result.records.map(x=>x.id),['H1']);
});
test('series changes project on dated sessions',()=>{
 const cls=base('CLASS-A','class');
 const session=base('SESSION-A','class-session');(session.legacyPayload as Record<string,unknown>).classId='CLASS-A';
 const rule={institutionId:'raaga',recordType:'series-change',legacyPayload:{institution:'raaga',classId:'CLASS-A',effectiveFrom:'2026-11-01',changes:{startTime:'09:30'}}};
 const result=assembleSchedule('raaga',[cls],[session,rule]);
 assert.equal(result.records.find(x=>x.id==='SESSION-A')?.startTime,'09:30');
});
test('managed event list retains legacy endpoint payload and filters by scope',()=>{
 const row={...base('E1','special-event'),legacyPayload:{...base('E1','special-event').legacyPayload,managedEvent:true}};
 const records=assembleManagedEvents('raaga',[row,base('H1','holiday')]).records;
 assert.deepEqual(records.map(x=>x.id),['E1']);
 for(const key of ['PK','SK','GSI1PK','GSI1SK','GSI2PK','GSI2SK','entityType'])assert.equal(key in records[0],false,key);
});
test('canonical comparison ignores ordering and attribute insertion order',()=>{
 assert.equal(canonicalRecords([{id:'a',name:'A'},{name:'B',id:'b'}]),canonicalRecords([{id:'b',name:'B'},{name:'A',id:'a'}]));
});
test('scan reader paginates instead of silently dropping records',async()=>{
 let calls=0;
 const mock={send:async(cmd:any)=>{calls++;const name=cmd.input.TableName;return {Items:name.endsWith('classes')?[base('C1','class')]:name.endsWith('sessions')&&calls===2?[base('S1','class-session')]:[],LastEvaluatedKey:undefined};}};
 const out=await makeM95CompatibilityReader(mock).schedule('raaga');
 assert.equal(out.records.length,2);
});
test('pilot permits verified admin scoped schedule',async()=>{
 const prev=process.env.M95_COMPAT_MODE;process.env.M95_COMPAT_MODE='pilot';
 try{
  const handler=makeM95CompatibilityRoutes(()=>({schedule:async()=>({records:[],more:false as const,source:'Sadhana DynamoDB'}),managedEvents:async()=>({records:[]}),inventory:async()=>({classes:22,sessions:423,events:6,venues:3,people:7})}));
  const response=await handler({parts:['schedule'],method:'GET',query:{institution:'raaga'},claims,groups:['raaga'],inst:'raaga',event:{} as any});
  assert.equal(response?.statusCode,200);
  await assert.rejects(()=>handler({parts:['schedule'],method:'GET',query:{institution:'sruti'},claims,groups:['raaga'],inst:'sruti',event:{} as any}),/access/);
 }finally{if(prev===undefined)delete process.env.M95_COMPAT_MODE;else process.env.M95_COMPAT_MODE=prev;}
});

test('special events stored in M9 events table remain visible in legacy schedule list',()=>{
 const ev=base('EVT-1','special-event');
 const result=assembleSchedule('raaga',[base('CLASS-A','class')],[base('SESSION-A','class-session')],[ev]);
 assert.equal(result.records.length,3);
 assert.deepEqual(result.records.filter(r=>r.recordType==='special-event').map(r=>r.id),['EVT-1']);
});
test('M9 schedule reader scans events table and does not double count other institutions',async()=>{
 const commands:string[]=[];
 const fake={send:async(command:any)=>{
  const name=command.input.TableName as string;commands.push(name);
  const Items=name.endsWith('-classes')?[base('CLASS-A','class')]:
   name.endsWith('-sessions')?[base('SESSION-A','class-session')]:
   name.endsWith('-events')?[base('E1','special-event'),base('E2','special-event','sruti')]:[];
  return {Items};
 }};
 const result=await makeM95CompatibilityReader(fake).schedule('raaga');
 assert.equal(result.records.length,3);
 assert.equal(result.records.filter(r=>r.recordType==='special-event').length,1);
 assert.ok(commands.some(name=>name.endsWith('-events')));
});

// Regression: real M9 event transformation does not create a top-level recordType.
test('transferred M9 events are included by their legacyPayload recordType',()=>{
 const original=base('E-REAL','special-event');
 const stored={institutionId:'raaga',eventId:'E-REAL',title:'Example event',managedEvent:false,legacyPayload:original.legacyPayload};
 const result=assembleSchedule('raaga',[],[],[stored]);
 assert.equal(result.records.length,1);
 assert.equal(result.records[0].id,'E-REAL');
});

test('M9 reader reconstructs transferred event with no top-level recordType',async()=>{
 const item={institutionId:'raaga',eventId:'E-REAL',title:'Example event',legacyPayload:base('E-REAL','special-event').legacyPayload};
 const mock={send:async(command:any)=>({Items:command.input.TableName.endsWith('-events')?[item]:[]})};
 const result=await makeM95CompatibilityReader(mock).schedule('raaga');
 assert.deepEqual(result.records.map(r=>r.id),['E-REAL']);
});
