import test from 'node:test';
import assert from 'node:assert/strict';
import {assembleSchedule,assembleManagedEvents,canonicalRecords,makeM95CompatibilityReader} from '../src/m95Compatibility.ts';
import {makeM95CompatibilityRoutes} from '../src/routes/m95CompatibilityRoutes.ts';
// Use records that satisfy the production schedule validator. Master classes have no date;
// dated records require an end date, and every record needs its programme and timezone.
const base=(id:string,recordType:string,institution='raaga')=>({
 institutionId:institution,recordType,
 legacyPayload:{
  PK:`SCHEDULE#${institution}`,SK:`ITEM#${id}`,entityType:'schedule',
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
 assert.ok(!('PK' in result.records[0]));
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
 assert.deepEqual(assembleManagedEvents('raaga',[row,base('H1','holiday')]).records.map(x=>x.id),['E1']);
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
