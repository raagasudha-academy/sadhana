import test from 'node:test';
import assert from 'node:assert/strict';
import {makeM10FinalScheduleSessionAdmin} from '../finalScheduleSessionAdmin.ts';

type Item = Record<string,any>;
const teacherId='TEACHER-540b1a18-5df6-45de-a343-93a3f88e432d';
const master={classId:'CLASS-SRUTI-ONE',institutionId:'sruti',recordType:'class',version:3,status:'active',teacherPersonIds:[teacherId],
 legacyPayload:{id:'CLASS-SRUTI-ONE',recordType:'class',institution:'sruti',name:'Vedam',teacher:'Example Teacher',teacherId,programme:'Vedam',mode:'Online',location:'Online',startTime:'18:00',endTime:'19:00',timezone:'Europe/London',version:3}};
const teacher={personId:teacherId,personTypes:['teacher'],status:'active',institutionIds:['sruti'],cognitoSub:'teacher-sub'};
const claims={sub:'teacher-sub'} as any;
function make(rows:Record<string,Item[]|Item|null>={}) {
 const actions:any[]=[];
 const db={send:async (cmd:any)=>{
  const input=cmd.input;
  if(input.TransactItems){
   actions.push(input.TransactItems);
   for(const action of input.TransactItems){if(!action.Delete)continue;const entity=String(action.Delete.TableName).split('sadhana-dev-').at(-1)!;const id=String(action.Delete.Key.classId??action.Delete.Key.sessionId);delete rows[`${entity}:${id}`];if(Array.isArray(rows[entity]))rows[entity]=(rows[entity] as Item[]).filter(item=>String(item.classId??item.sessionId)!==id);}
   return {};
  }
  const table=String(input.TableName).replace('sadhana-dev-audit-records','audit');
  const entity=table.split('sadhana-dev-').at(-1)!;
  if(input.Key){const id=String(input.Key.classId??input.Key.sessionId);return {Item:rows[`${entity}:${id}`]??(entity==='classes'&&id===master.classId?master:undefined)}};
  if(input.Limit){return {Items:rows[entity]??(entity==='people'?[teacher]:[]),LastEvaluatedKey:undefined}};
  throw new Error('Unexpected command');
 }};
 return {service:makeM10FinalScheduleSessionAdmin(db),actions};
}
function assertScheduleProjection(value:unknown,expectedKeys:string[]){
 assert.deepEqual(Object.keys(value as object).sort(),expectedKeys.sort());
 const serialized=JSON.stringify(value);
 for(const field of ['PK','SK','GSI1PK','GSI1SK','GSI2PK','GSI2SK','entityType','cognitoSub','actorCognitoSub','email','phone','address'])
  assert.equal(serialized?.includes(`\"${field}\"`),false,`${field} must not appear in a schedule response`);
}
async function withFinal(fn:()=>Promise<void>){const old={...process.env};Object.assign(process.env,{SADHANA_ENTITY_STAGE:'dev',SADHANA_ENTITY_TABLE_SET:'final',SADHANA_ENTITY_FINAL_ACK:'enabled',SADHANA_DATA_MODE:'final'});try{await fn()}finally{process.env=old}}

test('only linked teacher creates a session; identity and class are server verified',async()=>withFinal(async()=>{
 const x=make();
 const result=await x.service.createTeacherSession('sruti',{recordType:'class-session',classId:master.classId,date:'2026-11-09',endDate:'2026-11-09',startTime:'18:00',endTime:'19:00'},claims);
 assert.equal(result.record.teacherId,teacherId);
 assert.equal(x.actions.length,1);
 const written=x.actions[0].find((a:any)=>a.Put?.Item?.sessionId);
 assert.equal(written.Put.Item.institutionId,'sruti');
 assert.equal(written.Put.Item.classId,master.classId);
 assert.equal(written.Put.Item.teacherPersonIds[0],teacherId);
}));
test('cross-academy or unlinked teacher cannot create',async()=>withFinal(async()=>{
 const x=make();
 await assert.rejects(()=>x.service.createTeacherSession('raaga',{recordType:'class-session',classId:master.classId},claims),{status:404});
 await assert.rejects(()=>x.service.createTeacherSession('sruti',{recordType:'class-session',classId:master.classId,date:'2026-11-09',endDate:'2026-11-09',startTime:'18:00',endTime:'19:00'}, {...claims,sub:'stranger'}),{status:403});
 assert.equal(x.actions.length,0);
}));
test('additional sessions accept canonical classes whose class type is present in legacyPayload',async()=>withFinal(async()=>{
 const legacyShape={...master};delete legacyShape.recordType;
 const x=make({[`classes:${master.classId}`]:legacyShape});
 const result=await x.service.createAdditionalSessions('sruti',{classId:master.classId,sessions:[{date:'2027-02-14',startTime:'19:30',endTime:'20:30'}]},claims,true);
 assert.equal(result.count,1);
 assert.equal(x.actions.length,1);
 const items=x.actions[0].flatMap((action:any)=>action.Put?.Item?[action.Put.Item]:[]);
 const session=items.find((item:any)=>item.sessionId);
 const audit=items.find((item:any)=>item.action==='ADDITIONAL_SESSIONS_CREATED');
 assert.equal(session.institutionId,'sruti');
 assert.equal(session.classId,master.classId);
 assert.equal(session.additionalSession,true);
 assert.equal(audit.resourceId,master.classId);
}));
test('only the assigned teacher can create additional sessions and the transaction rechecks assignment',async()=>withFinal(async()=>{
 const body={classId:master.classId,sessions:[{date:'2027-02-15',startTime:'19:30',endTime:'20:30'}]};
 const x=make();
 const result=await x.service.createAdditionalSessions('sruti',body,claims,false);
 assert.equal(result.count,1);
 const items=x.actions[0];
 const condition=items.find((action:any)=>action.ConditionCheck?.TableName.endsWith('-classes'));
 const audit=items.find((action:any)=>action.Put?.Item?.action==='ADDITIONAL_SESSIONS_CREATED');
 assert.ok(condition.ConditionCheck.ConditionExpression.includes('contains(#teachers,:t)'));
 assert.equal(condition.ConditionCheck.ExpressionAttributeValues[':t'],teacherId);
 assert.equal(audit.Put.Item.actorCognitoSub,claims.sub);
 const stranger=make();
 await assert.rejects(()=>stranger.service.createAdditionalSessions('sruti',body,{sub:'stranger'} as any,false),{status:403});
 assert.equal(stranger.actions.length,0);
}));
test('additional-session validation, duplicates, and cross-academy class fail before writes',async()=>withFinal(async()=>{
 const x=make();
 await assert.rejects(()=>x.service.createAdditionalSessions('sruti',{classId:master.classId,sessions:[{date:'2027-02-30',startTime:'19:30',endTime:'20:30'}]},claims,true),{status:400});
 await assert.rejects(()=>x.service.createAdditionalSessions('sruti',{classId:master.classId,sessions:[{date:'2027-02-15',startTime:'19:30',endTime:'20:30'},{date:'2027-02-15',startTime:'19:30',endTime:'20:30'}]},claims,true),{status:409});
 await assert.rejects(()=>x.service.createAdditionalSessions('sruti',{classId:'CLASS-MISSING-1',sessions:[{date:'2027-02-15',startTime:'19:30',endTime:'20:30'}]},claims,true),{status:404});
 const foreign=make({['classes:'+master.classId]:{...master,institutionId:'raaga'}});
 await assert.rejects(()=>foreign.service.createAdditionalSessions('sruti',{classId:master.classId,sessions:[{date:'2027-02-15',startTime:'19:30',endTime:'20:30'}]},claims,true),{status:404});
 assert.equal(x.actions.length,0);assert.equal(foreign.actions.length,0);
}));
test('class delete preview refuses any linked enrolment history',async()=>withFinal(async()=>{
 const x=make({enrolments:[{institutionId:'sruti',classId:master.classId,studentId:'PERSON-TEST',status:'inactive'}]});
 await assert.rejects(()=>x.service.previewDeleteClass('sruti',master.classId,{expectedVersion:3}),{status:409});
 assert.equal(x.actions.length,0);
}));
test('administrator session delete conditionally removes the academy row and writes audit atomically',async()=>withFinal(async()=>{
 const session={sessionId:'SESSION-SRUTI-1',institutionId:'sruti',recordType:'class-session',classId:master.classId,version:4};
 const x=make({['sessions:'+session.sessionId]:session});
 const result=await x.service.deleteSession('sruti',session.sessionId,{expectedVersion:4},{sub:'admin-sub'} as any,true);
 assert.deepEqual(result,{deleted:true,id:session.sessionId});
 assert.equal(x.actions.length,1);
 const actions=x.actions[0];
 const deletion=actions.find((action:any)=>action.Delete);
 const audit=actions.find((action:any)=>action.Put?.Item?.action==='CLASS_SESSION_DELETED');
 assert.equal(deletion.Delete.Key.sessionId,session.sessionId);
 assert.match(deletion.Delete.ConditionExpression,/#v=:v AND #i=:i/);
 assert.equal(deletion.Delete.ExpressionAttributeValues[':v'],4);
 assert.equal(deletion.Delete.ExpressionAttributeValues[':i'],'sruti');
 assert.equal(audit.Put.Item.actorCognitoSub,'admin-sub');
}));
test('session with attendance history cannot be deleted and emits no transaction',async()=>withFinal(async()=>{
 const session={sessionId:'SESSION-SRUTI-2',institutionId:'sruti',recordType:'class-session',classId:master.classId,version:2};
 const x=make({['sessions:'+session.sessionId]:session,attendance:[{institutionId:'sruti',sessionId:session.sessionId,studentId:'PERSON-1'}]});
 await assert.rejects(()=>x.service.deleteSession('sruti',session.sessionId,{expectedVersion:2},{sub:'admin-sub'} as any,true),{status:409});
 assert.equal(x.actions.length,0);
}));
test('session delete rejects stale versions and repeated deletion after success',async()=>withFinal(async()=>{
 const session={sessionId:'SESSION-SRUTI-3',institutionId:'sruti',recordType:'class-session',classId:master.classId,version:2};
 const x=make({['sessions:'+session.sessionId]:session});
 await assert.rejects(()=>x.service.deleteSession('sruti',session.sessionId,{expectedVersion:1},{sub:'admin-sub'} as any,true),{status:409});
 assert.equal(x.actions.length,0);
 assert.deepEqual(await x.service.deleteSession('sruti',session.sessionId,{expectedVersion:2},{sub:'admin-sub'} as any,true),{deleted:true,id:session.sessionId});
 await assert.rejects(()=>x.service.deleteSession('sruti',session.sessionId,{expectedVersion:2},{sub:'admin-sub'} as any,true),{status:404});
 const missing=make();
 await assert.rejects(()=>missing.service.deleteSession('sruti',session.sessionId,{expectedVersion:2},{sub:'admin-sub'} as any,true),{status:404});
 assert.equal(x.actions.length,1);assert.equal(missing.actions.length,0);
}));
test('ranged session deletion requires the exact preview signature and audits in the transaction',async()=>withFinal(async()=>{
 const session={sessionId:'SESSION-SRUTI-4',institutionId:'sruti',recordType:'class-session',classId:master.classId,version:5,localDate:'2026-11-20',legacyPayload:{name:'Vedam'}};
 const x=make({sessions:[session]});
 const preview=await x.service.previewDeleteSeries('sruti',master.classId,{expectedVersion:3,effectiveFrom:'2026-11-01',effectiveUntil:'2026-11-30'});
 assertScheduleProjection(preview,['count','from','until','dates','signature']);
 assertScheduleProjection(preview.dates[0],['date','name','id']);
 await assert.rejects(()=>x.service.deleteSeries('sruti',master.classId,{expectedVersion:3,effectiveFrom:'2026-11-01',effectiveUntil:'2026-11-30',confirm:true,signature:'stale-signature'},{sub:'admin-sub'} as any),{status:409});
 assert.equal(x.actions.length,0);
 const result=await x.service.deleteSeries('sruti',master.classId,{expectedVersion:3,effectiveFrom:'2026-11-01',effectiveUntil:'2026-11-30',confirm:true,signature:preview.signature},{sub:'admin-sub'} as any);
 assertScheduleProjection(result,['deleted','count']);
 assert.deepEqual(result,{deleted:true,count:1});
 assert.equal(x.actions.length,1);
 const actions=x.actions[0];
 assert.equal(actions.filter((action:any)=>action.Delete?.Key.sessionId===session.sessionId).length,1);
 assert.equal(actions.find((action:any)=>action.Put?.Item?.action==='CLASS_SESSION_RANGE_DELETED').Put.Item.resourceId,master.classId);
}));
test('master delete includes linked sessions and class audit in one transaction',async()=>withFinal(async()=>{
 const session={sessionId:'SESSION-SRUTI-5',institutionId:'sruti',recordType:'class-session',classId:master.classId,version:1,localDate:'2026-11-20'};
 const x=make({sessions:[session]});
 const preview=await x.service.previewDeleteClass('sruti',master.classId,{expectedVersion:3});
 assertScheduleProjection(preview,['classId','name','masterVersion','sessionCount','ruleCount','dates','signature']);
 const result=await x.service.deleteClass('sruti',master.classId,{expectedVersion:3,confirm:true,signature:preview.signature},{sub:'admin-sub'} as any);
 assertScheduleProjection(result,['deleted','classId','sessionCount','ruleCount']);
 assert.deepEqual(result,{deleted:true,classId:master.classId,sessionCount:1,ruleCount:0});
 const actions=x.actions[0];
 assert.equal(actions.filter((action:any)=>action.Delete).length,2);
 assert.ok(actions.some((action:any)=>action.Delete?.Key.classId===master.classId));
 assert.ok(actions.some((action:any)=>action.Delete?.Key.sessionId===session.sessionId));
 assert.ok(actions.some((action:any)=>action.Put?.Item?.action==='MASTER_CLASS_DELETED'));
}));
test('master deletion rejects stale previews, missing classes, and sessions with learning history',async()=>withFinal(async()=>{
 const session={sessionId:'SESSION-SRUTI-6',institutionId:'sruti',recordType:'class-session',classId:master.classId,version:1,localDate:'2026-11-20'};
 const x=make({sessions:[session],attendance:[{institutionId:'sruti',sessionId:session.sessionId,studentId:'PERSON-1'}]});
 await assert.rejects(()=>x.service.previewDeleteClass('sruti',master.classId,{expectedVersion:2}),{status:409});
 await assert.rejects(()=>x.service.deleteClass('sruti',master.classId,{expectedVersion:3,confirm:true,signature:'stale'},{sub:'admin-sub'} as any),{status:409});
 await assert.rejects(()=>x.service.previewDeleteClass('sruti','CLASS-MISSING-1',{expectedVersion:3}),{status:404});
 await assert.rejects(()=>x.service.previewDeleteClass('sruti',master.classId,{expectedVersion:3}),{status:409});
 assert.equal(x.actions.length,0);
}));
test('ranged deletion refuses sessions with learning history before writing',async()=>withFinal(async()=>{
 const session={sessionId:'SESSION-SRUTI-7',institutionId:'sruti',recordType:'class-session',classId:master.classId,version:1,localDate:'2026-11-20'};
 const x=make({sessions:[session],homework:[{institutionId:'sruti',sessionId:session.sessionId,homeworkId:'HW-1'}]});
 await assert.rejects(()=>x.service.previewDeleteSeries('sruti',master.classId,{expectedVersion:3,effectiveFrom:'2026-11-01',effectiveUntil:'2026-11-30'}),{status:409});
 assert.equal(x.actions.length,0);
}));
test('master class delete commits class removal and audit together after a fresh preview',async()=>withFinal(async()=>{
 const x=make();
 const preview=await x.service.previewDeleteClass('sruti',master.classId,{expectedVersion:3});
 const result=await x.service.deleteClass('sruti',master.classId,{expectedVersion:3,confirm:true,signature:preview.signature},{sub:'admin-sub'} as any);
 assert.deepEqual(result,{deleted:true,classId:master.classId,sessionCount:0,ruleCount:0});
 assert.equal(x.actions.length,1);
 const actions=x.actions[0];
 const deletion=actions.find((action:any)=>action.Delete?.Key.classId===master.classId);
 const audit=actions.find((action:any)=>action.Put?.Item?.action==='MASTER_CLASS_DELETED');
 assert.equal(deletion.Delete.ConditionExpression,'#v=:v AND #i=:i');
 assert.equal(deletion.Delete.ExpressionAttributeValues[':i'],'sruti');
 assert.equal(audit.Put.Item.resourceId,master.classId);
}));
