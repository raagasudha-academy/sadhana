import assert from 'node:assert/strict';
import test from 'node:test';
import {GetCommand,ScanCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {makeM95SeriesWriter} from '../src/m95SeriesWrite.ts';
import {pilotSeriesWriteRequest} from '../src/routes/m95SeriesWriteRoutes.ts';
const now='2026-11-03T10:00:00Z';
const classId='CLASS-TEST';
const master={id:classId,recordType:'class',institution:'raaga',name:'Vocal',programme:'Music',teacher:'Kavya',mode:'Online',location:'Online',startTime:'10:00',endTime:'11:00',timezone:'Europe/London',version:2,createdAt:now,updatedAt:now};
const session={...master,id:'SESSION-TEST',recordType:'class-session',classId,date:'2026-11-20',endDate:'2026-11-20',status:'confirmed',version:1};
const claims={sub:'admin-sub','cognito:groups':'raagasudha-admin'};
const input={effectiveFrom:'2026-11-19',expectedVersion:2,changes:{startTime:'09:30'}};
function client(options:{rule?:boolean,wrongScope?:boolean}={}){
 const calls:any[]=[];
 return {calls,send:async(cmd:any)=>{
  calls.push(cmd);
  if(cmd instanceof GetCommand){
   if(cmd.input.TableName==='sadhana-dev-m9-classes')return {Item:{classId,institutionId:options.wrongScope?'sruti':'raaga',version:2,legacyPayload:master}};
   return {Item:undefined};
  }
  if(cmd instanceof ScanCommand)return {Items:[
   {sessionId:'SESSION-TEST',recordType:'class-session',classId,institutionId:'raaga',legacyPayload:session},
   ...(options.rule?[{sessionId:'RULE-EXISTING',recordType:'series-change',classId,institutionId:'raaga',effectiveFrom:input.effectiveFrom,changes:{startTime:'09:00'}}]:[])
  ]};
  return {};
 }};
}
async function pilot(fn:()=>Promise<void>){
 const old=[process.env.M95_COMPAT_MODE,process.env.M95_CALENDAR_WRITES,process.env.M95_SERIES_WRITES];
 process.env.M95_COMPAT_MODE='pilot';process.env.M95_CALENDAR_WRITES='enabled';process.env.M95_SERIES_WRITES='enabled';
 try{await fn();}finally{['M95_COMPAT_MODE','M95_CALENDAR_WRITES','M95_SERIES_WRITES'].forEach((k,i)=>old[i]===undefined?delete process.env[k]:process.env[k]=old[i]);}
}
test('only series preview/patch paths intercepted',()=>{
 assert.equal(pilotSeriesWriteRequest('POST',['schedule','series',classId,'preview']),true);
 assert.equal(pilotSeriesWriteRequest('PATCH',['schedule','series',classId]),true);
 assert.equal(pilotSeriesWriteRequest('DELETE',['schedule','series',classId]),false);
 assert.equal(pilotSeriesWriteRequest('POST',['schedule','series',classId,'delete-preview']),false);
});
test('preview validates affected session and performs no writes',async()=>pilot(async()=>{
 const c=client();const result=await makeM95SeriesWriter(c).preview('raaga',classId,input,claims);
 assert.equal(result.affectedSessionCount,1);assert.equal(result.masterVersion,2);
 assert.equal(c.calls.some(x=>x instanceof TransactWriteCommand),false);
}));
test('change atomically increments master, creates rule, creates audit',async()=>pilot(async()=>{
 const c=client();const result=await makeM95SeriesWriter(c).change('raaga',classId,input,claims);
 assert.equal(result.masterVersion,3);
 const tx=c.calls.find(x=>x instanceof TransactWriteCommand).input.TransactItems;
 assert.equal(tx.length,3);
 assert.equal(tx[0].Update.TableName,'sadhana-dev-m9-classes');
 assert.equal(tx[0].Update.ExpressionAttributeValues[':old'],2);
 assert.equal(tx[1].Put.TableName,'sadhana-dev-m9-sessions');
 assert.equal(tx[1].Put.Item.seriesId,classId);
 assert.equal(tx[1].Put.Item.legacyPayload.changes.startTime,'09:30');
 assert.equal(tx[2].Put.TableName,'sadhana-dev-m9-audit');
}));
test('repeated effective date is rejected before write',async()=>pilot(async()=>{
 const c=client({rule:true});await assert.rejects(()=>makeM95SeriesWriter(c).change('raaga',classId,input,claims),{status:409});
 assert.equal(c.calls.some(x=>x instanceof TransactWriteCommand),false);
}));
test('wrong institution and stale version blocked',async()=>pilot(async()=>{
 await assert.rejects(()=>makeM95SeriesWriter(client({wrongScope:true})).change('raaga',classId,input,claims),{status:404});
 await assert.rejects(()=>makeM95SeriesWriter(client()).change('raaga',classId,{...input,expectedVersion:1},claims),{status:409});
}));
test('pilot and series feature flags both required',async()=>{
 const c=client();await assert.rejects(()=>makeM95SeriesWriter(c).change('raaga',classId,input,claims),{status:503});
 assert.equal(c.calls.length,0);
});
