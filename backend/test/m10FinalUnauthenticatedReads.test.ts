import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../src/lambda.ts';

test('sensitive final-table list routes return 401 before repository or reader access',async()=>{
 const keys=['SADHANA_ENTITY_TABLE_SET'] as const;
 const prior=keys.map(k=>process.env[k]);
 const calls:string[]=[];
 try{
  process.env.SADHANA_ENTITY_TABLE_SET='final';
  const handler=createHandler({list:async(...args:any[])=>{calls.push(String(args[0]));return {records:[],more:false};}} as any);
  for(const [path,institution] of [
   ['students','raaga'],['families','raaga'],['schedule','raaga'],['events','raaga'],['identities/search','raaga']
  ]){
   const result=await handler({
    pathParameters:{proxy:path},requestContext:{http:{method:'GET'}},
    queryStringParameters:{institution}
   } as any);
   assert.equal(result.statusCode,401,path);
   assert.match(result.body,/Authenticated Cognito access token required/,path);
  }
  assert.deepEqual(calls,[]);
 }finally{
  keys.forEach((k,i)=>prior[i]===undefined?delete process.env[k]:process.env[k]=prior[i]);
 }
});
