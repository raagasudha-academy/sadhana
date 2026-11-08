import test from 'node:test';
import assert from 'node:assert/strict';
import {makeM95ManagedEventWriter,isPilotManagedEventRequest,validateM95ManagedEvent} from '../src/m95ManagedEventWrite.ts';
const raagaAdmin={sub:'admin-1','cognito:groups':['raagasudha-admin']};
const dualAdmin={sub:'admin-both','cognito:groups':['raagasudha-admin','sruti-admin']};
const event={name:'Academy Event',eventKind:'event',programme:'Event',mode:'Event',location:'',venueId:'',date:'2026-11-14',startTime:'10:00',endTime:'11:00'};
function fixture(){
 const calls:any[]=[];const items=new Map<string,any>();
 return {calls,items,client:{async send(c:any){calls.push(c);const name=c.constructor.name;
  const i=c.input;
  if(name==='GetCommand')return {Item:items.get(`${i.TableName}|${Object.values(i.Key)[0]}`)};
  if(name==='ScanCommand')return {Items:[...items.values()].filter(x=>x.personId)};
  if(name==='TransactWriteCommand'){
   for(const action of i.TransactItems){const put=action.Put;if(!put)continue;const key=put.Item.eventId??put.Item.auditId;
    if(put.Item.eventId){const prior=items.get(`${put.TableName}|${key}`);if(prior&&put.ConditionExpression.includes('attribute_not_exists'))throw Object.assign(new Error('collision'),{name:'TransactionCanceledException'});
     if(prior&&put.ConditionExpression.includes('#v')&&prior.version!==put.ExpressionAttributeValues[':old'])throw Object.assign(new Error('stale'),{name:'TransactionCanceledException'});}
   }
   for(const action of i.TransactItems){const put=action.Put;if(put){const key=put.Item.eventId??put.Item.auditId;items.set(`${put.TableName}|${key}`,structuredClone(put.Item));}}
   return {};
  }
  throw Error(`Unexpected ${name}`);
 }}};
}
test('allowlist includes old event create edit cancel and shared operations only',()=>{
 for(const [method,path] of [['POST',['events']],['PATCH',['events','EVT-1234']],['DELETE',['events','EVT-1234']],['POST',['events','shared']],['PATCH',['events','shared','EVT-1234']],['DELETE',['events','shared','EVT-1234']]] as const)
  assert.equal(isPilotManagedEventRequest(method,path),true);
 assert.equal(isPilotManagedEventRequest('GET',['events']),false);
 assert.equal(isPilotManagedEventRequest('DELETE',['schedule','EVT-1234']),false);
});
test('strict event fields, BST timestamps, invalid dates and times rejected',()=>{
 assert.equal(validateM95ManagedEvent(event,'raaga').startAt,'2026-11-14T10:00:00.000Z');
 assert.throws(()=>validateM95ManagedEvent({...event,unknown:'oops'},'raaga'));
 assert.throws(()=>validateM95ManagedEvent({...event,date:'2026-02-30'},'raaga'));
 assert.throws(()=>validateM95ManagedEvent({...event,endTime:'09:00'},'raaga'));
});
test('flags fail closed before any DynamoDB calls',async()=>{
 const f=fixture(),writer=makeM95ManagedEventWriter(f.client);
 const previous=process.env.M95_COMPAT_MODE,enabled=process.env.M95_MANAGED_EVENT_WRITES;
 try {delete process.env.M95_COMPAT_MODE;delete process.env.M95_MANAGED_EVENT_WRITES;
  await assert.rejects(writer.save('raaga',raagaAdmin,event),/disabled/);assert.equal(f.calls.length,0);
 }finally{if(previous===undefined)delete process.env.M95_COMPAT_MODE;else process.env.M95_COMPAT_MODE=previous;
  if(enabled===undefined)delete process.env.M95_MANAGED_EVENT_WRITES;else process.env.M95_MANAGED_EVENT_WRITES=enabled;}
});
test('academy event create/edit/cancel retains legacy payload with transactional audit',async()=>{
 const f=fixture(),writer=makeM95ManagedEventWriter(f.client);
 const a=process.env.M95_COMPAT_MODE,b=process.env.M95_MANAGED_EVENT_WRITES;
 process.env.M95_COMPAT_MODE='pilot';process.env.M95_MANAGED_EVENT_WRITES='enabled';
 try{
  const created=await writer.save('raaga',raagaAdmin,event);
  assert.equal(created.record.managedEvent,true);
  const id=created.record.id;
  const updated=await writer.save('raaga',raagaAdmin,{...event,name:'Academy Event Updated',expectedVersion:1},id);
  assert.equal(updated.record.version,2);
  const cancelled=await writer.cancel('raaga',raagaAdmin,id,2);
  assert.equal(cancelled.record.status,'cancelled');assert.equal(cancelled.record.version,3);
  for(const key of ['PK','SK','entityType','GSI1PK','cognitoSub','email','phone','address'])assert.equal(key in cancelled.record,false,key);
  const cancellation=f.calls.filter(x=>x.constructor.name==='TransactWriteCommand').at(-1);
  const eventWrite=cancellation.input.TransactItems.find((x:any)=>x.Put?.Item?.eventId);
  const auditWrite=cancellation.input.TransactItems.find((x:any)=>x.Put?.Item?.action==='M95_CANCEL_MANAGED_EVENT');
  assert.equal(eventWrite.Put.Item.status,'cancelled');assert.equal(eventWrite.Put.Item.version,3);
  assert.equal(eventWrite.Put.ConditionExpression,'#v=:old AND #i=:inst');
  assert.equal(auditWrite.Put.Item.institutionId,'raaga');
  assert.equal(auditWrite.Put.Item.resourceId,id);
  assert.equal(auditWrite.Put.Item.actorCognitoSub,raagaAdmin.sub);
  await assert.rejects(writer.cancel('raaga',raagaAdmin,id,2),/changed/);
  assert.equal(f.calls.filter(x=>x.constructor.name==='TransactWriteCommand').length,3);
  assert.equal(f.items.get(`sadhana-dev-m9-events|${id}`).legacyPayload.recordType,'special-event');
 }finally{if(a===undefined)delete process.env.M95_COMPAT_MODE;else process.env.M95_COMPAT_MODE=a;
  if(b===undefined)delete process.env.M95_MANAGED_EVENT_WRITES;else process.env.M95_MANAGED_EVENT_WRITES=b;}
});
test('event cancellation rejects cross-academy and missing managed events without a write',async()=>{
 const f=fixture(),writer=makeM95ManagedEventWriter(f.client);
 const a=process.env.M95_COMPAT_MODE,b=process.env.M95_MANAGED_EVENT_WRITES;
 process.env.M95_COMPAT_MODE='pilot';process.env.M95_MANAGED_EVENT_WRITES='enabled';
 try{
  await assert.rejects(writer.cancel('raaga',raagaAdmin,'EVT-MISSING-1',1),{status:404});
  const created=await writer.save('raaga',raagaAdmin,event);
  const transactions=f.calls.filter(x=>x.constructor.name==='TransactWriteCommand').length;
  await assert.rejects(writer.cancel('sruti',raagaAdmin,created.record.id,1),{status:403});
  assert.equal(f.calls.filter(x=>x.constructor.name==='TransactWriteCommand').length,transactions);
 }finally{if(a===undefined)delete process.env.M95_COMPAT_MODE;else process.env.M95_COMPAT_MODE=a;
  if(b===undefined)delete process.env.M95_MANAGED_EVENT_WRITES;else process.env.M95_MANAGED_EVENT_WRITES=b;}
});
test('shared events require dual-admin scope and write two distinct physical keys atomically',async()=>{
 const f=fixture(),writer=makeM95ManagedEventWriter(f.client);
 const a=process.env.M95_COMPAT_MODE,b=process.env.M95_MANAGED_EVENT_WRITES;
 process.env.M95_COMPAT_MODE='pilot';process.env.M95_MANAGED_EVENT_WRITES='enabled';
 try{
  await assert.rejects(writer.shared(raagaAdmin,event),/both academy/);
  const created=await writer.shared(dualAdmin,event);
  const group=created.record.id;
  assert.equal(created.records.length,2);
  assert.ok(f.items.get(`sadhana-dev-m9-events|${group}__raaga`));
  assert.ok(f.items.get(`sadhana-dev-m9-events|${group}__sruti`));
  const cancelled=await writer.shared(dualAdmin,{expectedVersion:1},group,true);
  assert.ok(cancelled.records.every(x=>x.status==='cancelled'));
  for(const record of cancelled.records)for(const key of ['PK','SK','entityType','GSI1PK','cognitoSub','email','phone','address'])assert.equal(key in record,false,key);
  const last=f.calls.filter(x=>x.constructor.name==='TransactWriteCommand').at(-1);
  assert.equal(last.input.TransactItems.length,3);
  const cancelledCopies=last.input.TransactItems.filter((x:any)=>x.Put?.Item?.eventId);
  const audit=last.input.TransactItems.find((x:any)=>x.Put?.Item?.action==='M95_CANCEL_SHARED_EVENT');
  assert.equal(cancelledCopies.length,2);
  assert.deepEqual(cancelledCopies.map((x:any)=>[x.Put.Item.institutionId,x.Put.Item.status,x.Put.Item.version]),[['raaga','cancelled',2],['sruti','cancelled',2]]);
  assert.equal(audit.Put.Item.institutionId,'shared');assert.equal(audit.Put.Item.resourceId,group);
  await assert.rejects(writer.shared(dualAdmin,{expectedVersion:1},group,true),/changed/);
  assert.equal(f.calls.filter(x=>x.constructor.name==='TransactWriteCommand').length,2);
 }finally{if(a===undefined)delete process.env.M95_COMPAT_MODE;else process.env.M95_COMPAT_MODE=a;
  if(b===undefined)delete process.env.M95_MANAGED_EVENT_WRITES;else process.env.M95_MANAGED_EVENT_WRITES=b;}
});
