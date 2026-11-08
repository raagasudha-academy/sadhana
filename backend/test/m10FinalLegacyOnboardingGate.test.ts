import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../src/lambda.ts';

test('final Lambda blocks exact legacy onboarding writes before repository access',async()=>{
 const keys=['SADHANA_ENTITY_TABLE_SET','M95_ONBOARDING_MODE','M10_CORE_FRONTEND_WRITES','M9_TARGET_REPOSITORY_WRITES'] as const;
 const prior=keys.map(k=>process.env[k]);
 const calls:string[]=[];
 try{
  process.env.SADHANA_ENTITY_TABLE_SET='final';
  process.env.M95_ONBOARDING_MODE='enabled';
  process.env.M10_CORE_FRONTEND_WRITES='enabled';
  process.env.M9_TARGET_REPOSITORY_WRITES='enabled';
  const handler=createHandler({list:async(...args:any[])=>{calls.push(String(args[0]));return {records:[],more:false};}} as any);
  for(const [method,path] of [
   ['POST','m9-onboarding/guardian/request'],
   ['POST','m9-onboarding/guardian/decision'],
   ['POST','m9-onboarding/verified-account/REG-1/link'],
   ['POST','m9-onboarding/legacy-bridge/REG-1/execute'],
  ]){
   const result=await handler({
    pathParameters:{proxy:path},
    requestContext:{http:{method},authorizer:{jwt:{claims:{sub:'admin-sub','cognito:groups':['raagasudha-admin']}}}},
    queryStringParameters:{institution:'raaga'},body:'{}'
   } as any);
   assert.equal(result.statusCode,503,path);
   assert.match(result.body,/legacy database fallback blocked/,path);
  }
  assert.deepEqual(calls,[]);
 }finally{
  keys.forEach((k,i)=>prior[i]===undefined?delete process.env[k]:process.env[k]=prior[i]);
 }
});
