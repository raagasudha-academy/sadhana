import test from 'node:test';
import assert from 'node:assert/strict';
import {makeM9Homework} from '../legacyHomework.ts';

const teacherId='PERSON-TEACHER';
const homeworkId='HOMEWORK-00000000-0000-4000-8000-000000000001';
const classId='CLASS-SRUTI-ONE';
const person={personId:teacherId,cognitoSub:'teacher-sub',status:'active',personTypes:['teacher'],institutionIds:['sruti']};
const cls={classId,institutionId:'sruti',status:'active',teacherPersonIds:[teacherId]};
const assignment={homeworkId,classId,institutionId:'sruti',status:'active',version:2};
function fixture(overrides:{teacherIds?:string[];inst?:string;status?:string}={}){
 const tx:any[]=[];
 const db={send:async(command:any)=>{
  const input=command.input;
  if(input.TransactItems){tx.push(input.TransactItems);return {}};
  const table=String(input.TableName);
  if(input.Key){
   const item=table.endsWith('-people')?person:table.endsWith('-classes')?{...cls,teacherPersonIds:overrides.teacherIds??cls.teacherPersonIds}:table.endsWith('-homework')?{...assignment,institutionId:overrides.inst??'sruti',status:overrides.status??'active'}:null;
   return {Item:item};
  }
  if(input.IndexName==='CognitoIdentityIndex')return {Items:[person]};
  throw Error('Unexpected query '+JSON.stringify(input));
 }};
 return {service:makeM9Homework(db as any),tx};
}
const teacherClaims={sub:'teacher-sub'} as any;
const final=async(fn:()=>Promise<void>)=>{const prior={...process.env};Object.assign(process.env,{SADHANA_DATA_MODE:'final',SADHANA_ENTITY_TABLE_SET:'final',SADHANA_ENTITY_FINAL_ACK:'enabled'});try{await fn()}finally{process.env=prior}};

test('assigned teacher archives homework atomically and records audit without deleting submissions',()=>final(async()=>{
 const f=fixture();const result=await f.service.remove('sruti',teacherClaims,classId,homeworkId);
 assert.deepEqual(result,{deleted:true,archived:true});assert.equal(f.tx.length,1);
 const actions=f.tx[0];assert.equal(actions.length,4);
 const update=actions.find((a:any)=>a.Update)?.Update;
 assert.match(update.TableName,/sadhana-dev-homework$/);
 assert.match(update.ConditionExpression,/classId=:class/);
 assert.match(update.UpdateExpression,/#status=:archived/);
 assert.equal(actions.some((a:any)=>a.Delete),false);
 assert.equal(actions.find((a:any)=>a.Put)?.Put?.Item.action,'homeworkArchived');
}));
test('unassigned teacher cannot archive homework',()=>final(async()=>{
 const f=fixture({teacherIds:['OTHER']});await assert.rejects(()=>f.service.remove('sruti',teacherClaims,classId,homeworkId),{status:403});assert.equal(f.tx.length,0);
}));
test('cross-academy and already archived homework cannot be removed',()=>final(async()=>{
 const other=fixture({inst:'raaga'});await assert.rejects(()=>other.service.remove('sruti',teacherClaims,classId,homeworkId),{status:404});assert.equal(other.tx.length,0);
 const archived=fixture({status:'archived'});await assert.rejects(()=>archived.service.remove('sruti',teacherClaims,classId,homeworkId),{status:404});assert.equal(archived.tx.length,0);
}));
