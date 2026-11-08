import test from 'node:test';
import assert from 'node:assert/strict';
import {UpdateCommand} from '@aws-sdk/lib-dynamodb';
import {makeM95GuardianRegistrationRoutes} from '../src/routes/m95GuardianRegistrationRoutes.ts';

const admin={sub:'sruti-reviewer','cognito:groups':['sruti-admin']};
const ctx=(body:unknown,claims:any=admin)=>({
 parts:['m9-onboarding','sruti-intake','SR-2026-ABC','review'],method:'PATCH',
 query:{institution:'sruti'},claims,inst:'sruti',event:{body:JSON.stringify(body)}
}) as any;
async function withFlags(fn:()=>Promise<void>){
 const old=[process.env.M95_ONBOARDING_MODE,process.env.M91_SRUTI_REVIEW_WRITES];
 process.env.M95_ONBOARDING_MODE='enabled';process.env.M91_SRUTI_REVIEW_WRITES='enabled';
 try{await fn();}finally{
  for(const [i,key] of ['M95_ONBOARDING_MODE','M91_SRUTI_REVIEW_WRITES'].entries())
   old[i]===undefined?delete process.env[key]:process.env[key]=old[i];
 }
}

test('Sruti review route conditionally updates pending registration and never grants guardian access',async()=>withFlags(async()=>{
 const calls:any[]=[];const route=makeM95GuardianRegistrationRoutes({send:async(command:any)=>{calls.push(command);return {};}} as any);
 const result=await route(ctx({reviewStatus:'approved',expectedVersion:4}));
 assert.equal(result?.statusCode,200);
 assert.deepEqual(JSON.parse(result!.body),{registrationId:'SR-2026-ABC',reviewStatus:'approved',version:5,guardianAccessGranted:false});
 const command=calls[0];assert.ok(command instanceof UpdateCommand);
 assert.equal(command.input.TableName,'sadhana-dev-m9-registrations');
 assert.match(command.input.ConditionExpression,/institutionId=:inst AND #source=:source AND reviewStatus=:pending AND importStatus=:pending AND version=:previous/);
 assert.equal(command.input.ExpressionAttributeValues[':reviewer'],admin.sub);
 assert.equal(command.input.ExpressionAttributeValues[':previous'],4);
 assert.equal(command.input.ExpressionAttributeValues[':newVersion'],5);
}));

test('Sruti review rejects wrong role and disabled writes before database access',async()=>withFlags(async()=>{
 let calls=0;const route=makeM95GuardianRegistrationRoutes({send:async()=>{calls++;return {};}} as any);
 await assert.rejects(()=>route(ctx({reviewStatus:'approved',expectedVersion:1},{sub:'viewer','cognito:groups':['sruti-viewer']})),(e:any)=>e.status===403);
 process.env.M91_SRUTI_REVIEW_WRITES='disabled';
 await assert.rejects(()=>route(ctx({reviewStatus:'approved',expectedVersion:1})),(e:any)=>e.status===403);
 assert.equal(calls,0);
}));

test('Sruti review validates decision and version before storage and maps write races to conflict',async()=>withFlags(async()=>{
 let calls=0;const route=makeM95GuardianRegistrationRoutes({send:async(command:any)=>{
  calls++;if(command instanceof UpdateCommand)throw Object.assign(new Error('stale'),{name:'ConditionalCheckFailedException'});return {};
 }} as any);
 await assert.rejects(()=>route(ctx({reviewStatus:'pending',expectedVersion:1})),(e:any)=>e.status===400);
 await assert.rejects(()=>route(ctx({reviewStatus:'approved',expectedVersion:0})),(e:any)=>e.status===400);
 assert.equal(calls,0);
 await assert.rejects(()=>route(ctx({reviewStatus:'discarded',expectedVersion:1})),(e:any)=>e.status===409);
 assert.equal(calls,1);
}));

test('Sruti review cannot update another academy registration or a missing registration',async()=>withFlags(async()=>{
 const route=makeM95GuardianRegistrationRoutes({send:async(command:any)=>{
  assert.ok(command instanceof UpdateCommand);
  assert.equal(command.input.ExpressionAttributeValues[':inst'],'sruti');
  throw Object.assign(new Error('conditional write rejected'),{name:'ConditionalCheckFailedException'});
 }} as any);
 await assert.rejects(()=>route(ctx({reviewStatus:'approved',expectedVersion:2})),(e:any)=>e.status===409);
 await assert.rejects(()=>route(ctx({reviewStatus:'discarded',expectedVersion:2})),(e:any)=>e.status===409);
}));
