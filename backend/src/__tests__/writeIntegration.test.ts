import test from 'node:test';
import assert from 'node:assert/strict';
import {PutCommand,UpdateCommand} from '@aws-sdk/lib-dynamodb';
import {makeM9TargetWriter} from '../targetWriter.ts';
import {makeM9WriteRoutes} from '../routes/writeRoutes.ts';
import type {RouteContext} from '../routes/http.ts';
const old={a:process.env.M9_TARGET_REPOSITORY_WRITES,b:process.env.M9_API_WRITES_ENABLED};
const enable=()=>{process.env.M9_TARGET_REPOSITORY_WRITES='enabled';process.env.M9_API_WRITES_ENABLED='enabled';};
const disable=()=>{delete process.env.M9_TARGET_REPOSITORY_WRITES;delete process.env.M9_API_WRITES_ENABLED;};
const ctx=(parts:string[],method:string,body:any={},groups=['raagasudha-admin'],inst='raaga'):RouteContext=>({
 parts,method,query:{institution:inst},claims:{sub:'admin', 'cognito:groups':groups},inst:'raaga',groups:['raaga'],
 event:{body:JSON.stringify(body)}
});
const result=(x:any)=>JSON.parse(x.body);
test('repository denies every write unless explicitly opted in',async()=>{
 disable();const calls:any[]=[];const writer=makeM9TargetWriter({send:async(c:any)=>{calls.push(c);return {};}} as any,{enabled:true});
 await assert.rejects(()=>writer.create('classes',{classId:'c1'}),/disabled/);assert.equal(calls.length,0);
});
test('create uses conditional put and rejects existing key collisions in DynamoDB',async()=>{
 enable();const calls:any[]=[];const writer=makeM9TargetWriter({send:async(c:any)=>{calls.push(c);return {};}} as any,{enabled:true});
 const value=await writer.create('classes',{classId:'c1',institutionId:'raaga',name:'Music'});
 assert.equal(value.version,1);assert.ok(calls[0] instanceof PutCommand);
 assert.equal(calls[0].input.ConditionExpression,'attribute_not_exists(#pk)');assert.equal(calls[0].input.TableName,'sadhana-dev-m9-classes');disable();
});
test('repository update guards version and institution atomically',async()=>{
 enable();const calls:any[]=[];const writer=makeM9TargetWriter({send:async(c:any)=>{calls.push(c);return {Attributes:{classId:'c1'}};}} as any,{enabled:true});
 await writer.update('classes','c1',2,{name:'Updated'},'raaga');
 assert.ok(calls[0] instanceof UpdateCommand);assert.match(calls[0].input.ConditionExpression,/institutionId/);
 assert.match(calls[0].input.ConditionExpression,/version/);assert.equal(calls[0].input.ExpressionAttributeValues[':expected'],2);disable();
});
test('repository refuses identifier, institution and version modifications',async()=>{
 enable();const writer=makeM9TargetWriter({send:async()=>({})} as any,{enabled:true});
 for(const field of ['classId','institutionId','version','cognitoSub','PK']){
  await assert.rejects(()=>writer.update('classes','c1',1,{[field]:'bad'},'raaga'),/Immutable|reserved/);
 }disable();
});
test('API is disabled by default without calling repository',async()=>{
 disable();let called=0;const route=makeM9WriteRoutes(()=>({create:async()=>{called++;return{};},update:async()=>{called++;return{};}} as any));
 const out=await route(ctx(['m9','record','classes'],'POST',{classId:'c1'}));assert.equal(out?.statusCode,405);assert.equal(called,0);
});
test('API checks admin and institution before repository write',async()=>{
 enable();let called=0;const route=makeM9WriteRoutes(()=>({create:async()=>{called++;return{};},update:async()=>{called++;return{};}} as any));
 await assert.rejects(()=>route(ctx(['m9','record','classes'],'POST',{classId:'c1',institutionId:'raaga',name:'Class'},['raagasudha-viewer'])),/Administrator/);
 await assert.rejects(()=>route(ctx(['m9','record','classes'],'POST',{classId:'c1',institutionId:'sruti',name:'Class'})),/Institution mismatch/);
 assert.equal(called,0);disable();
});
test('API does not expose guardian, registration, audit or counter generic writes',async()=>{
 enable();let called=0;const route=makeM9WriteRoutes(()=>({create:async()=>{called++;return{};},update:async()=>{called++;return{};}} as any));
 for(const entity of ['family-links','registrations','audit','counters']){
  const r=await route(ctx(['m9','record',entity],'POST',{institutionId:'raaga'}));assert.equal(r?.statusCode,405);
 }assert.equal(called,0);disable();
});
test('API creates allowed entity and patches with expected version',async()=>{
 enable();const ops:any[]=[];const route=makeM9WriteRoutes(()=>({create:async(...a:any[])=>{ops.push(['create',...a]);return {classId:'c1'};},update:async(...a:any[])=>{ops.push(['update',...a]);return {classId:'c1',version:2};}} as any));
 const a=await route(ctx(['m9','record','classes'],'POST',{classId:'c1',institutionId:'raaga',name:'Music'}));assert.equal(a?.statusCode,201);
 const b=await route(ctx(['m9','record','classes','c1'],'PATCH',{expectedVersion:1,changes:{name:'New'}}));assert.equal(b?.statusCode,200);
 assert.equal(ops[1][5],'raaga');disable();
});
test('API rejects unapproved fields',async()=>{
 enable();const route=makeM9WriteRoutes(()=>({create:async()=>({}),update:async()=>({})} as any));
 await assert.rejects(()=>route(ctx(['m9','record','events'],'POST',{eventId:'e1',institutionId:'raaga',title:'Music',cognitoSub:'hack'})),/not permitted/);disable();
});
test.after(()=>{if(old.a===undefined)delete process.env.M9_TARGET_REPOSITORY_WRITES;else process.env.M9_TARGET_REPOSITORY_WRITES=old.a;if(old.b===undefined)delete process.env.M9_API_WRITES_ENABLED;else process.env.M9_API_WRITES_ENABLED=old.b;});
