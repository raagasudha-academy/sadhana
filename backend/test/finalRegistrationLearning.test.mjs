import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {finalRegistrationRoute} from '../src/finalRegistration.mjs';
import {finalLearningRoute} from '../src/finalLearning.mjs';

const base={SADHANA_ENTITY_TABLE_SET:'final',SADHANA_ENTITY_FINAL_ACK:'enabled',SADHANA_DATA_MODE:'off'};
const regFlags={...base,SADHANA_FINAL_SRUTI_INGRESS_READY:'enabled',SADHANA_FINAL_SRUTI_REGISTRATION_READS:'enabled',SADHANA_FINAL_SRUTI_REVIEW_WRITES:'enabled',M91_SRUTI_REVIEW_WRITES:'enabled'};
const learnFlags={...base,SADHANA_FINAL_LEARNER_READS:'enabled',SADHANA_FINAL_LEARNER_WRITES:'enabled',SADHANA_FINAL_HOMEWORK_READS:'enabled',SADHANA_FINAL_HOMEWORK_WRITES:'enabled',SADHANA_FINAL_TEACHER_PRACTICE_READS:'enabled',SADHANA_FINAL_TEACHER_PRACTICE_WRITES:'enabled',SADHANA_FINAL_HOMEWORK_MEDIA:'enabled'};
const srutiAdmin={sub:'real-sruti-admin',admin:['sruti']};
const raagaAdmin={sub:'real-raaga-admin',admin:['raaga']};
const student={sub:'verified-student'};
const guardian={sub:'verified-guardian'};
let called=[];
const depsReg={assertConfigured:()=>called.push('schema'),parse:event=>JSON.parse(event.body||'{}'),registration:async ctx=>{
 called.push(['registration',ctx.parts.join('/'),ctx.method,ctx.claims.sub]);
 return {statusCode:ctx.method==='PATCH'?200:200,body:JSON.stringify({records:[],source:'canonical'})};
}};
const access={admin:(who,inst)=>{if(!who.admin?.includes(inst))throw Object.assign(new Error('Forbidden'),{status:403});}};
const ctx=(path,method='GET',institution='sruti',claims=srutiAdmin,body={})=>({parts:path.split('/'),method,query:{institution},inst:institution,claims,event:{body:JSON.stringify(body)}});
const reg=(path,method='GET',institution='sruti',who=srutiAdmin,body={},env=regFlags)=>
 finalRegistrationRoute(ctx(path,method,institution,who,body),depsReg,access,env);
const depsLearn={
 assertConfigured:()=>called.push('schema'),
 parse:request=>(called.push('parse'),JSON.parse(request.body||'{}')),
 learner:()=>({dashboard:async(inst,who,id)=>(called.push(['dashboard',inst,who.sub,id]),{classes:[]})}),
 learnerWrites:()=>({
  savePractice:async(inst,who,id,body,practiceId)=>(called.push(['savePractice',inst,who.sub,id,body,practiceId]),{record:{id:'practice'}}),
  saveRsvp:async(inst,who,id,body)=>(called.push(['saveRsvp',inst,who.sub,id,body]),{saved:true})
 }),
 homework:()=>Object.fromEntries(['listClass','publish','edit','remove','learnerList','complete','teacherSubmissions','staffMediaLinks','feedback','getSubmission','saveSubmission','mediaLinks','mediaStart','mediaFinish','beginTeacherMaterial','finishTeacherMaterial','selectTeacherMaterials','teacherMaterialLinks','learnerMaterialLinks'].map(name=>[name,async(...args)=>(called.push(['homework',name,...args]),name==='remove'?{deleted:true,archived:true}:{saved:true})])),
 learnerMedia:()=>Object.fromEntries(['start','finish','list'].map(name=>[name,async(...args)=>(called.push(['learner-media',name,...args]),name==='list'?{records:[]}:{key:'private'})])),
 teacherPractice:async context=>(called.push(['teacherPractice',context.method,context.claims.sub]),{statusCode:context.method==='GET'?200:201,body:JSON.stringify({records:[]})})
};
const learn=(path,method='GET',institution='raaga',who=student,body={},env=learnFlags)=>
 finalLearningRoute(ctx(path,method,institution,who,body),depsLearn,env);
const reset=()=>called=[];

test('normal M9 mode is unaffected by new registration and learner adapters',async()=>{
 reset();const env={...regFlags,SADHANA_ENTITY_TABLE_SET:'m9'};
 assert.equal(await reg('website-registrations','GET','sruti',srutiAdmin,{},env),undefined);
 assert.equal(await learn('learner/STU-123/dashboard','GET','raaga',student,{},env),undefined);
 assert.deepEqual(called,[]);
});
test('registration access requires final ACK, non-split mode, and Sruti ingress fence',async()=>{
 for(const env of [{...regFlags,SADHANA_DATA_MODE:'split'},{...regFlags,SADHANA_ENTITY_FINAL_ACK:''},{...regFlags,SADHANA_FINAL_SRUTI_INGRESS_READY:''}]){
  reset();assert.equal((await reg('website-registrations','GET','sruti',srutiAdmin,{},env)).status,503);assert.deepEqual(called,[]);
 }
});
test('registration read and review use existing canonical reader under separate flags',async()=>{
 reset();assert.equal((await reg('website-registrations','GET')).status,200);
 assert.equal((await reg('website-registrations/SR-2026-4D6401','GET')).status,200);
 assert.equal((await reg('website-registrations/SR-2026-4D6401','PATCH','sruti',srutiAdmin,{reviewStatus:'approved',expectedVersion:2})).status,200);
 assert.equal((await reg('website-registrations/SR-2026-4D6401/import-preview','POST')).status,200);
 assert.equal(called.filter(Array.isArray).length,3);
});
test('Sruti student import execution remains blocked even if M91 flag is accidentally enabled',async()=>{
 reset();const env={...regFlags,M91_SRUTI_IMPORT_WRITES:'enabled',SADHANA_FINAL_SRUTI_IMPORT_WRITES:'enabled'};
 assert.equal((await reg('website-registrations/SR-2026-4D6401/import-execute','POST','sruti',srutiAdmin,{},env)).status,409);
 assert.deepEqual(called,[]);
});
test('Raagasudha registration gateway cannot be accessed through the Sruti facade',async()=>{
 reset();assert.equal((await reg('website-registrations','GET','raaga',raagaAdmin)).status,503);
 await assert.rejects(()=>reg('website-registrations','GET','raaga',srutiAdmin),{status:403});
 assert.deepEqual(called,[]);
});
test('registration rejects unauthorised, missing JWT, invalid method and disabled flags',async()=>{
 reset();await assert.rejects(()=>reg('website-registrations','GET','sruti',raagaAdmin),{status:403});
 assert.equal((await reg('website-registrations','GET','sruti',{},{})).status,401);
 assert.equal((await reg('website-registrations/garbage!','GET')).status,503);
 assert.equal((await reg('website-registrations','DELETE')).status,503);
 assert.equal((await reg('website-registrations','GET','sruti',srutiAdmin,{}, {...regFlags,SADHANA_FINAL_SRUTI_REGISTRATION_READS:''})).status,503);
 assert.equal((await reg('website-registrations/SR-2026-4D6401','PATCH','sruti',srutiAdmin,{}, {...regFlags,M91_SRUTI_REVIEW_WRITES:''})).status,503);
 assert.deepEqual(called,[]);
});
test('learner dashboard guarded and retains verified subject/student ID',async()=>{
 reset();const response=await learn('learner/STUDENT-1001/dashboard','GET');assert.equal(response.status,200);
 assert.deepEqual(called.filter(Array.isArray),[['dashboard','raaga','verified-student','STUDENT-1001']]);
 reset();assert.equal((await learn('learner/STUDENT-1001/dashboard','GET','raaga',student,{}, {...learnFlags,SADHANA_FINAL_LEARNER_READS:''})).status,503);assert.deepEqual(called,[]);
});
test('learner practice POST/PATCH and RSVP PUT delegate to original transaction service',async()=>{
 reset();assert.equal((await learn('learner/STUDENT-1001/practice','POST','raaga',guardian,{classId:'CLASS-1001',minutes:10})).status,201);
 assert.equal((await learn('learner/STUDENT-1001/practice/PRACTICE-1001','PATCH','raaga',guardian,{expectedVersion:2})).status,200);
 assert.equal((await learn('learner/STUDENT-1001/rsvp','PUT','raaga',guardian,{sessionId:'SESSION-1001'})).status,200);
 assert.deepEqual(called.filter(Array.isArray).map(x=>[x[0],x[1],x[2],x[3]]),[
  ['savePractice','raaga','verified-guardian','STUDENT-1001'],
  ['savePractice','raaga','verified-guardian','STUDENT-1001'],
  ['saveRsvp','raaga','verified-guardian','STUDENT-1001']
 ]);
});
test('learner writes can be disabled independently without invoking services',async()=>{
 reset();assert.equal((await learn('learner/STUDENT-1001/practice','POST','raaga',student,{}, {...learnFlags,SADHANA_FINAL_LEARNER_WRITES:''})).status,503);assert.deepEqual(called,[]);
});
test('homework read, publish and learner submission reuse existing identity-checked service',async()=>{
 reset();const paths=[
  ['homework/CLASS-1001','GET','listClass'],
  ['homework/CLASS-1001','POST','publish'],
  ['homework/CLASS-1001/HOMEWORK-1001','PUT','edit'],
  ['homework/CLASS-1001/HOMEWORK-1001','DELETE','remove'],
  ['learner/STUDENT-1001/homework','GET','learnerList'],
  ['learner/STUDENT-1001/homework','POST','complete'],
  ['learner/STUDENT-1001/submission/HOMEWORK-1001','GET','getSubmission'],
  ['learner/STUDENT-1001/submission/HOMEWORK-1001','PUT','saveSubmission'],
  ['homework/CLASS-1001/submissions/HOMEWORK-1001','GET','teacherSubmissions'],
  ['homework/CLASS-1001/feedback/HOMEWORK-1001/STUDENT-1001','POST','feedback']
 ];
 for(const [path,method] of paths)assert.ok([200,201].includes((await learn(path,method)).status));
 assert.deepEqual(called.filter(x=>x[0]==='homework').map(x=>x[1]),paths.map(x=>x[2]));
 assert.deepEqual(called.filter(x=>x[0]==='homework'&&x[1]==='remove'),[['homework','remove','raaga',student,'CLASS-1001','HOMEWORK-1001']]);
});
test('homework DELETE rejects malformed IDs and respects the final write opt-in',async()=>{
 reset();assert.equal((await learn('homework/CLASS-1001/invalid!','DELETE')).status,400);assert.deepEqual(called,[]);
 assert.equal((await learn('homework/CLASS-1001/HOMEWORK-1001','DELETE','raaga',student,{}, {...learnFlags,SADHANA_FINAL_HOMEWORK_WRITES:''})).status,503);assert.deepEqual(called,[]);
});
test('media endpoints require an independent media flag and never fall back',async()=>{
 reset();const path='learner/STUDENT-1001/submission/HOMEWORK-1001/evidence/start';
 assert.equal((await learn(path,'POST','raaga',student,{}, {...learnFlags,SADHANA_FINAL_HOMEWORK_MEDIA:''})).status,503);
 assert.deepEqual(called,[]);
 assert.equal((await learn(path,'POST')).status,200);
 assert.equal((await learn('learner/STUDENT-1001/submission/HOMEWORK-1001/evidence/finish','POST')).status,200);
 assert.equal((await learn('learner/STUDENT-1001/submission/HOMEWORK-1001/evidence','GET')).status,200);
 assert.equal((await learn('homework/CLASS-1001/evidence/HOMEWORK-1001/STUDENT-1001','GET')).status,200);
});
test('teacher-practice comments are read and written with independent opt-ins',async()=>{
 reset();assert.equal((await learn('teacher-practice/PRACTICE-1001/comments','GET')).status,200);
 assert.equal((await learn('teacher-practice/PRACTICE-1001/comments','POST')).status,201);
 assert.deepEqual(called.filter(Array.isArray),[['teacherPractice','GET','verified-student'],['teacherPractice','POST','verified-student']]);
 reset();assert.equal((await learn('teacher-practice/PRACTICE-1001/comments','POST','raaga',student,{}, {...learnFlags,SADHANA_FINAL_TEACHER_PRACTICE_WRITES:''})).status,503);
 assert.deepEqual(called,[]);
});
test('invalid institution, IDs and unsupported methods fail closed before dependency call',async()=>{
 reset();for(const c of [
  ['learner/STU-1001/dashboard','GET','shared'],
  ['learner/invalid!/dashboard','GET','raaga'],
  ['learner/STU-1001/unknown','GET','raaga'],
  ['homework/invalid!','POST','raaga'],
  ['homework/CLS-1001','DELETE','raaga'],
  ['teacher-practice/bad!/comments','GET','raaga']
 ]){const res=await learn(...c);assert.ok([400,503].includes(res.status));}
 assert.deepEqual(called,[]);
});
test('learning paths require final ACK, JWT and non-split mode before service calls',async()=>{
 for(const env of [{...learnFlags,SADHANA_DATA_MODE:'split'}, {...learnFlags,SADHANA_ENTITY_FINAL_ACK:''}]){
  reset();assert.equal((await learn('learner/STUDENT-1001/dashboard','GET','raaga',student,{},env)).status,503);assert.deepEqual(called,[]);
 }
 reset();assert.equal((await learn('learner/STUDENT-1001/dashboard','GET','raaga',{})).status,401);assert.deepEqual(called,[]);
});
test('actual Lambda orders final registration/learning before final gate and legacy pilot routes',()=>{
 const code=readFileSync(new URL('../src/lambda.ts',import.meta.url),'utf8');
 const registration=code.indexOf('await finalRegistrationRoute(routeContext');
 const learning=code.indexOf('await finalLearningRoute(routeContext');
 const fallback=code.indexOf("finalOnlyGate(parts,method,'fallback')");
 const oldRegistration=code.indexOf('await m10RegistrationCutoverRoutes(routeContext)');
 const oldLearner=code.indexOf('await m9FinalLearnerRoutes(routeContext)');
 assert.ok(registration>0&&learning>registration&&fallback>learning);
 assert.ok(oldRegistration>fallback&&oldLearner>fallback);
});
test('underlying services require final-specific flags instead of inherited M9 flags',()=>{
 for(const [filename,token] of [['finalLearner.ts','SADHANA_FINAL_LEARNER_READS'],['learnerWrites.ts','SADHANA_FINAL_LEARNER_WRITES'],['legacyHomework.ts','SADHANA_FINAL_HOMEWORK_MEDIA'],['routes/teacherPracticeRoutes.ts','SADHANA_FINAL_TEACHER_PRACTICE_READS']]){
  const source=readFileSync(new URL('../src/'+filename,import.meta.url),'utf8');
  assert.ok(source.includes(token),filename);
  assert.ok(source.includes("SADHANA_ENTITY_TABLE_SET==='final'"),filename);
 }
});

test('final teacher material upload/selection/link endpoints preserve exact existing frontend URLs',async()=>{
 reset();const names=[];
 for(const [path,method,name] of [
  ['homework/CLASS-1001/materials/HOMEWORK-1001/start','POST','beginTeacherMaterial'],
  ['homework/CLASS-1001/materials/HOMEWORK-1001/finish','POST','finishTeacherMaterial'],
  ['homework/CLASS-1001/materials/HOMEWORK-1001/selection','POST','selectTeacherMaterials'],
  ['homework/CLASS-1001/materials/HOMEWORK-1001/links','GET','teacherMaterialLinks'],
  ['learner/STUDENT-1001/homework/HOMEWORK-1001/materials','GET','learnerMaterialLinks']
 ]){
  const result=await learn(path,method);assert.equal(result.status,200);names.push(name);
 }
 assert.deepEqual(called.filter(x=>x[0]==='homework').map(x=>x[1]),names);
});
test('teacher materials cannot use homework read/write flags as a media bypass',async()=>{
 for(const env of [{...learnFlags,SADHANA_FINAL_HOMEWORK_MEDIA:''},
                   {...learnFlags,SADHANA_FINAL_HOMEWORK_READS:''},
                   {...learnFlags,SADHANA_ENTITY_FINAL_ACK:''}]){
  reset();const result=await learn('homework/CLASS-1001/materials/HOMEWORK-1001/links','GET','raaga',student,{},env);
  assert.equal(result.status,503);assert.deepEqual(called,[]);
 }
 reset();assert.equal((await learn('homework/CLASS-1001/materials/invalid!/start','POST')).status,503);
 assert.deepEqual(called,[]);
});
test('learner private media has separate opt-in and exact start/finish/list contracts',async()=>{
 reset();const env={...learnFlags,SADHANA_FINAL_LEARNER_MEDIA:'enabled'};
 for(const [path,method] of [
  ['learner/STUDENT-1001/media','GET'],
  ['learner/STUDENT-1001/media/start','POST'],
  ['learner/STUDENT-1001/media/finish','POST']
 ])assert.equal((await learn(path,method,'raaga',student,{},env)).status,200);
 assert.deepEqual(called.filter(x=>x[0]==='learner-media').map(x=>x[1]),['list','start','finish']);
 reset();assert.equal((await learn('learner/STUDENT-1001/media','GET','raaga',student,{},learnFlags)).status,503);
 assert.deepEqual(called,[]);
});
