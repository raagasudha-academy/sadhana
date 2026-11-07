import test from 'node:test';
import assert from 'node:assert/strict';
import {makeM10FinalScheduleSessionAdmin} from '../src/m10FinalScheduleSessionAdmin.ts';

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
  if(input.TransactItems){actions.push(input.TransactItems);return {}};
  const table=String(input.TableName).replace('sadhana-dev-audit-records','audit');
  const entity=table.split('sadhana-dev-').at(-1)!;
  if(input.Key){const id=String(input.Key.classId??input.Key.sessionId);return {Item:rows[`${entity}:${id}`]??(entity==='classes'&&id===master.classId?master:undefined)}};
  if(input.Limit){return {Items:rows[entity]??(entity==='people'?[teacher]:[]),LastEvaluatedKey:undefined}};
  throw new Error('Unexpected command');
 }};
 return {service:makeM10FinalScheduleSessionAdmin(db),actions};
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
test('class delete preview refuses any linked enrolment history',async()=>withFinal(async()=>{
 const x=make({enrolments:[{institutionId:'sruti',classId:master.classId,studentId:'PERSON-TEST',status:'inactive'}]});
 await assert.rejects(()=>x.service.previewDeleteClass('sruti',master.classId,{expectedVersion:3}),{status:409});
 assert.equal(x.actions.length,0);
}));
