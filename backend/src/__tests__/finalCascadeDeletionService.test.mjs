import test from 'node:test';
import assert from 'node:assert/strict';
import {makeFinalCascadeDeletionService} from '../finalCascadeDeletionService.mjs';
import {markerId} from '../websiteImportCore.mjs';
Object.assign(process.env,{SADHANA_ENTITY_TABLE_SET:'final',SADHANA_ENTITY_FINAL_ACK:'enabled',SADHANA_DATA_MODE:'final',SADHANA_ENTITY_STAGE:'dev'});
const root=()=>({personId:'PERSON-test1',version:1,status:'active',institutionIds:['sruti'],personTypes:['student'],studentProfile:{rollNumbers:{sruti:'SR-123'}},familyId:'FAMILY-test1'});
function store(extra={}){
 const data={people:[root()],families:[{familyId:'FAMILY-test1',version:1,status:'active',institutionIds:['sruti']}],...extra};
 const sent=[];
 const db={sent,data,async send(cmd){
  sent.push(cmd);
  const name=cmd.constructor.name==='TransactWriteCommand'
   ? ''
   : cmd.input.TableName.replace(/^sadhana-dev-/,'');
  const entity=name==='audit-records'?'audit':name;
  if(cmd.constructor.name==='GetCommand')return {Item:(data[entity]||[]).find(row=>Object.entries(cmd.input.Key).every(([k,v])=>row[k]===v))};
  if(cmd.constructor.name==='ScanCommand')return {Items:data[entity]||[]};
  if(cmd.constructor.name==='PutCommand'){
   const id=cmd.input.Item.counterId;
   if((data[entity]||[]).some(row=>row.counterId===id))throw Error('duplicate preview');
   (data[entity]||= []).push(structuredClone(cmd.input.Item));return {};
  }
  if(cmd.constructor.name==='TransactWriteCommand'){
   for(const item of cmd.input.TransactItems){
    const action=item.Delete||item.Put||item.Update, tableName=action.TableName.replace(/^sadhana-dev-/,'');
    const e=tableName==='audit-records'?'audit':tableName;
    if(item.Delete||item.Update){const row=(data[e]||[]).find(r=>Object.entries(action.Key).every(([k,v])=>r[k]===v));
     if(!row)throw Object.assign(Error('stale'),{name:'TransactionCanceledException'});
     if(item.Update&&row.version!==action.ExpressionAttributeValues[':version'])throw Object.assign(Error('stale'),{name:'TransactionCanceledException'});
    }
   }
   for(const item of cmd.input.TransactItems){
    if(item.Delete){const action=item.Delete,e=action.TableName.replace(/^sadhana-dev-/,'');data[e]=data[e].filter(row=>!Object.entries(action.Key).every(([k,v])=>row[k]===v));}
    else if(item.Update){const action=item.Update,e=action.TableName.replace(/^sadhana-dev-/,'');const row=data[e].find(r=>Object.entries(action.Key).every(([k,v])=>r[k]===v));const values=action.ExpressionAttributeValues;Object.assign(row,{studentIds:values[':students'],sourceStudentIds:values[':sources'],deletedStudentIds:values[':deleted'],version:values[':next'],updatedAt:values[':now']});}
    else{const action=item.Put,e=action.TableName.replace(/^sadhana-dev-/,'')==='audit-records'?'audit':action.TableName.replace(/^sadhana-dev-/,'');(data[e]||=[]).push(action.Item);}
   }
   return {};
  }
  throw Error(`unexpected ${cmd.constructor.name}`);
 }};
 return db;
}
const args={actor:'admin-sub',institution:'sruti',type:'student',id:'PERSON-test1',expectedVersion:1};
test('preview stores opaque token in canonical counters without a signing secret',async()=>{
 const db=store(),svc=makeFinalCascadeDeletionService({db});
 const result=await svc.preview(args);
 assert.equal(result.total,1);assert.deepEqual(result.counts,[{label:'people',count:1}]);
 assert.match(result.signature,/^[A-Za-z0-9_-]{43}$/);
 assert.equal(db.data.counters.length,1);
 assert.equal(db.data.counters[0].recordType,'CASCADE_PREVIEW');
 assert.equal(db.data.counters[0].actorCognitoSub,args.actor);
 assert.ok(!JSON.stringify(db.data.counters).includes(result.signature),'plain bearer token must not be stored');
 assert.equal(db.sent.some(c=>c.constructor.name==='TransactWriteCommand'),false);
});
test('execution remains blocked by default',async()=>{
 const db=store(),svc=makeFinalCascadeDeletionService({db});const result=await svc.preview(args);
 assert.equal(result.executionEnabled,false);
 await assert.rejects(()=>svc.execute({...args,signature:result.signature}),/writer-fencing/);
 assert.equal(db.data.people.length,1);
});
test('preview exposes execution only when enabled and the target is eligible',async()=>{
 const db=store(),svc=makeFinalCascadeDeletionService({db,allowExecute:true});
 const result=await svc.preview(args);
 assert.equal(result.executionEnabled,true);
 assert.equal(result.executionBlocked,false);
});
test('runtime execution requires both the execute flag and writer-fence attestation',async()=>{
 const previousExecute=process.env.SADHANA_FINAL_CASCADE_EXECUTE;
 const previousFence=process.env.SADHANA_FINAL_CASCADE_WRITER_FENCE_VERIFIED;
 try{
  process.env.SADHANA_FINAL_CASCADE_EXECUTE='enabled';
  delete process.env.SADHANA_FINAL_CASCADE_WRITER_FENCE_VERIFIED;
  let db=store(),svc=makeFinalCascadeDeletionService({db}),preview=await svc.preview(args);
  assert.equal(preview.executionEnabled,false);
  await assert.rejects(()=>svc.execute({...args,signature:preview.signature}),/writer-fencing/);

  process.env.SADHANA_FINAL_CASCADE_WRITER_FENCE_VERIFIED='enabled';
  db=store();svc=makeFinalCascadeDeletionService({db});preview=await svc.preview(args);
  assert.equal(preview.executionEnabled,true);
 }finally{
  if(previousExecute===undefined)delete process.env.SADHANA_FINAL_CASCADE_EXECUTE;
  else process.env.SADHANA_FINAL_CASCADE_EXECUTE=previousExecute;
  if(previousFence===undefined)delete process.env.SADHANA_FINAL_CASCADE_WRITER_FENCE_VERIFIED;
  else process.env.SADHANA_FINAL_CASCADE_WRITER_FENCE_VERIFIED=previousFence;
 }
});
test('preview is actor-bound, expires, and cannot be replayed',async()=>{
 let instant=100000;const db=store(),svc=makeFinalCascadeDeletionService({db,now:()=>instant,allowExecute:true});
 const signed=await svc.preview(args);
 await assert.rejects(()=>svc.execute({...args,actor:'another-admin',signature:signed.signature}),/match/);
 instant+=301000;
 await assert.rejects(()=>svc.execute({...args,signature:signed.signature}),/expired/);
});
test('successful bounded delete consumes token and writes audit atomically',async()=>{
 const db=store(),svc=makeFinalCascadeDeletionService({db,allowExecute:true});
 const preview=await svc.preview(args);
 const result=await svc.execute({...args,signature:preview.signature});
 assert.deepEqual(result,{deleted:true});
 assert.equal(db.data.people.length,0);assert.equal(db.data.families.length,1);
 assert.equal(db.data.counters.length,0);assert.equal(db.data.audit.length,1);
 await assert.rejects(()=>svc.execute({...args,signature:preview.signature}),/missing or already used/);
});
test('family cascade permanently retains every deleted student roll reservation',async()=>{
 const second={...root(),personId:'PERSON-test2',studentProfile:{rollNumbers:{sruti:'SR-124'}}};
 const db=store({people:[root(),second],counters:[
  {counterId:'ROLL_GLOBAL#SR-123',sequenceType:'ROLL_UNIQUE',institutionId:'sruti',personId:'PERSON-test1'},
  {counterId:'ROLL_GLOBAL#SR-124',sequenceType:'ROLL_UNIQUE',institutionId:'sruti',personId:'PERSON-test2'}
 ]});
 const familyArgs={...args,type:'family',id:'FAMILY-test1'};
 const svc=makeFinalCascadeDeletionService({db,allowExecute:true});
 const preview=await svc.preview(familyArgs);
 await svc.execute({...familyArgs,signature:preview.signature});
 assert.equal(db.data.people.length,0);
 assert.equal(db.data.families.length,0);
 assert.deepEqual(db.data.counters.map(row=>row.counterId).sort(),['ROLL_GLOBAL#SR-123','ROLL_GLOBAL#SR-124']);
});
test('imported student deletion reconciles its Sadhana marker and permanently retains its roll',async()=>{
 const externalRegistrationId='SR-2026-EXAMPLE',sourcePersonId='SOURCE-STUDENT-1';
 const student={...root(),sourceWebsiteRegistrationId:externalRegistrationId};
 const marker={registrationId:markerId('sruti',externalRegistrationId),institutionId:'sruti',source:'website',externalRegistrationId,
  importStatus:'imported',familyId:'FAMILY-test1',studentIds:[student.personId],sourceStudentIds:{[sourcePersonId]:student.personId},version:1};
 const source={registrationId:externalRegistrationId,source:'sruti-website',institutionId:'sruti',importStatus:'imported',sadhanaImport:{studentIds:{[sourcePersonId]:student.personId}},version:2};
 const db=store({people:[student],registrations:[marker,source],counters:[
  {counterId:'ROLL_GLOBAL#SR-123',sequenceType:'ROLL_UNIQUE',institutionId:'sruti',personId:student.personId}
 ]});
 const svc=makeFinalCascadeDeletionService({db,allowExecute:true});
 const preview=await svc.preview(args);
 assert.equal(preview.executionBlocked,false);
 assert.equal(preview.executionEnabled,true);
 assert.match(preview.notice,/source website registration is retained/i);
 await svc.execute({...args,signature:preview.signature});
 assert.equal(db.data.people.length,0);
 const updatedMarker=db.data.registrations.find(row=>row.registrationId===marker.registrationId);
 assert.deepEqual(updatedMarker.studentIds,[]);
 assert.deepEqual(updatedMarker.sourceStudentIds,{});
 assert.deepEqual(updatedMarker.deletedStudentIds,[{personId:student.personId,sourcePersonId,sourceRegistrationId:externalRegistrationId,deletedAt:updatedMarker.updatedAt,deletedBy:args.actor}]);
 assert.ok(db.data.registrations.some(row=>row.registrationId===externalRegistrationId),'external registration remains as history');
 assert.ok(db.data.counters.some(row=>row.counterId==='ROLL_GLOBAL#SR-123'),'roll reservation remains permanently');
});
test('new linked records invalidate existing preview',async()=>{
 const db=store(),svc=makeFinalCascadeDeletionService({db,allowExecute:true});const preview=await svc.preview(args);
 db.data.enrolments=[{enrolmentId:'ENROLMENT-1',studentId:'PERSON-test1',institutionId:'sruti',version:1}];
 await assert.rejects(()=>svc.execute({...args,signature:preview.signature}),/Linked records changed/);
 assert.equal(db.data.people.length,1);
});
test('cross-academy student is refused',async()=>{
 const db=store({people:[{...root(),institutionIds:['sruti','raaga']}]});
 await assert.rejects(()=>makeFinalCascadeDeletionService({db}).preview(args),/Cross-academy/);
});
