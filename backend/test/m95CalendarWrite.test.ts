import assert from 'node:assert/strict';
import test from 'node:test';
import {GetCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {makeM95CalendarWriter,utcForWallTime} from '../src/m95CalendarWrite.ts';
import {pilotCalendarWriteRequest} from '../src/routes/m95CalendarWriteRoutes.ts';
const claims={sub:'cognito-admin-test','cognito:groups':'raagasudha-admin'};
const now='2026-11-10T10:00:00Z';
const master={id:'CLASS-TEST',recordType:'class',institution:'raaga',name:'Example class',programme:'Singing',teacher:'Kavya',mode:'Online',location:'Online',startTime:'10:00',endTime:'11:00',timezone:'Europe/London',version:2,createdAt:now,updatedAt:now};
const session={...master,id:'SESS-TEST',recordType:'class-session',classId:'CLASS-TEST',date:'2026-11-11',endDate:'2026-11-11',status:'confirmed',version:1};
const withPilot=async(fn:()=>Promise<void>)=>{
 const a=process.env.M95_COMPAT_MODE,b=process.env.M95_CALENDAR_WRITES;
 process.env.M95_COMPAT_MODE='pilot';process.env.M95_CALENDAR_WRITES='enabled';
 try{await fn();}finally{if(a===undefined)delete process.env.M95_COMPAT_MODE;else process.env.M95_COMPAT_MODE=a;if(b===undefined)delete process.env.M95_CALENDAR_WRITES;else process.env.M95_CALENDAR_WRITES=b;}
};
test('safe pilot route allowlist denies deletes and bulk edits',()=>{
 assert.equal(pilotCalendarWriteRequest('POST',['schedule']),true);
 assert.equal(pilotCalendarWriteRequest('PATCH',['schedule','SESS-TEST']),true);
 assert.equal(pilotCalendarWriteRequest('DELETE',['schedule','SESS-TEST']),false);
 assert.equal(pilotCalendarWriteRequest('PATCH',['schedule','series','CLASS-TEST']),false);
 assert.equal(pilotCalendarWriteRequest('POST',['events']),false);
});
test('summer date converts and DST gap fails closed',()=>{
 assert.equal(utcForWallTime('2026-07-01','10:00'),'2026-07-01T09:00:00.000Z');
 assert.throws(()=>utcForWallTime('2026-03-29','01:30'));
 assert.throws(()=>utcForWallTime('2026-10-25','01:30'));
});
test('class patch retains legacy response and conditions on version and institution',async()=>withPilot(async()=>{
 const calls:any[]=[];
 const client={send:async(cmd:any)=>{
  calls.push(cmd);
  if(cmd instanceof GetCommand)return {Item:cmd.input.TableName==='sadhana-dev-m9-classes'?{classId:master.id,institutionId:'raaga',version:2,legacyPayload:master}:undefined};
  return {};
 }};
 const result=await makeM95CalendarWriter(client).patch('raaga','CLASS-TEST',{expectedVersion:2,programme:'Singing basics'},claims);
 assert.equal(result.record.programme,'Singing basics');
 const tx=calls.find(x=>x instanceof TransactWriteCommand).input.TransactItems;
 assert.equal(tx.length,2);
 assert.equal(tx[0].Put.TableName,'sadhana-dev-m9-classes');
 assert.equal(tx[0].Put.ExpressionAttributeValues[':old'],2);
 assert.equal(tx[0].Put.ExpressionAttributeValues[':inst'],'raaga');
 assert.equal(tx[1].Put.TableName,'sadhana-dev-m9-audit');
}));
test('cannot rename master without atomic updates to linked sessions',async()=>withPilot(async()=>{
 const client={send:async(cmd:any)=>cmd instanceof GetCommand?{Item:cmd.input.TableName==='sadhana-dev-m9-classes'?{classId:master.id,institutionId:'raaga',version:2,legacyPayload:master}:undefined}: {}};
 await assert.rejects(()=>makeM95CalendarWriter(client).patch('raaga','CLASS-TEST',{expectedVersion:2,name:'Renamed'},claims),{status:501});
}));
test('rejects wrong institution and rejects missing version',async()=>withPilot(async()=>{
 const client={send:async(cmd:any)=>cmd instanceof GetCommand?{Item:cmd.input.TableName==='sadhana-dev-m9-classes'?{classId:master.id,institutionId:'raaga',version:2,legacyPayload:master}:undefined}: {}};
 await assert.rejects(()=>makeM95CalendarWriter(client).patch('sruti','CLASS-TEST',{expectedVersion:2,programme:'Changed'},claims));
 await assert.rejects(()=>makeM95CalendarWriter(client).patch('raaga','CLASS-TEST',{programme:'Changed'},claims),{status:409});
}));
test('session create checks M9 master and writes correct session schema',async()=>withPilot(async()=>{
 const calls:any[]=[];const client={send:async(cmd:any)=>{calls.push(cmd);return cmd instanceof GetCommand?{Item:{classId:master.id,institutionId:'raaga'}}:{};}};
 const body={recordType:'class-session',name:session.name,programme:session.programme,teacher:session.teacher,mode:session.mode,location:session.location,date:session.date,endDate:session.endDate,startTime:session.startTime,endTime:session.endTime,status:session.status,classId:session.classId};
 const response=await makeM95CalendarWriter(client).create('raaga',body,claims);
 assert.equal(response.record.recordType,'class-session');
 const tx=calls.find(x=>x instanceof TransactWriteCommand).input.TransactItems;
 assert.equal(tx[0].Put.TableName,'sadhana-dev-m9-sessions');
 assert.equal(tx[0].Put.Item.startAt,'2026-11-11T10:00:00.000Z');
 assert.equal(tx[0].Put.Item.seriesId,undefined);
}));
test('feature flag prevents any write',async()=>{
 delete process.env.M95_CALENDAR_WRITES;
 await assert.rejects(()=>makeM95CalendarWriter({send:async()=>{throw Error('should not call DynamoDB');}}).create('raaga',{},claims),{status:503});
});
