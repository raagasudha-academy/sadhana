import test from 'node:test';
import assert from 'node:assert/strict';
import {finalGuardianQueue,canonicalGuardianPersonForSubject,finalSrutiGuardianCandidates,finalSrutiGuardianRequest} from '../finalGuardianQueue.mjs';
import {finalCoreIdentityRoute} from '../finalCoreIdentity.mjs';
const inst='raaga',sub='f34d3b0b-3acd-44df-adfe-1560274aa321';
const guardian={personId:'PERSON-GUARDIAN-1',familyId:'FAMILY-1',cognitoSub:sub,status:'active',institutionIds:[inst],personTypes:['guardian']};
const student={personId:'PERSON-STUDENT-1',familyId:'FAMILY-1',status:'active',institutionIds:[inst],personTypes:['student']};
const row={linkId:'LINK-GUARDIAN-1',recordType:'guardian-access',familyId:'FAMILY-1',guardianPersonId:guardian.personId,studentId:student.personId,institutionId:inst,accessStatus:'pending',version:2};
const reader=(overrides={})=>({
 links:async()=>[row], link:async()=>row,
 person:async id=>id===guardian.personId?guardian:id===student.personId?student:null,
 peopleForSubject:async s=>s===sub?[guardian]:[],
 verifiedIdentity:async()=>({name:'Verified guardian',email:'guardian@example.com',verified:true}),
 ...overrides
});
const env={SADHANA_ENTITY_TABLE_SET:'final',SADHANA_DATA_MODE:'off',SADHANA_ENTITY_FINAL_ACK:'enabled',SADHANA_FINAL_GUARDIAN_QUEUE_READS:'enabled',SADHANA_FINAL_GUARDIAN_DECISIONS:'enabled'};
const who={sub:'admin-1',admin:['raaga']};
const context=(parts,method='GET',body={})=>({parts:parts.split('/'),method,claims:who,query:{institution:inst},inst,event:{body:JSON.stringify(body)}});
const access={admin:(actor,requested)=>{if(!actor.admin?.includes(requested))throw Object.assign(Error('Forbidden'),{status:403});}};
let calls=[];
const deps={assertConfigured:()=>calls.push('configured'),parse:event=>JSON.parse(event.body||'{}'),guardianReader:()=>reader(),guardian:()=>({decide:async(...args)=>(calls.push(args),{status:'approved'})})};
test('final admin queue maps canonical guardian records to existing UI and separately verifies identity',async()=>{
 const q=await finalGuardianQueue(inst,reader());
 assert.equal(q.source,'final');assert.deepEqual(q.records,[{studentId:student.personId,subject:sub,kind:'guardian',status:'pending',version:2}]);
 assert.equal(q.identities[sub].verified,true);
});
test('queue excludes wrong institution rather than disclosing it',async()=>{
 const q=await finalGuardianQueue(inst,reader({links:async()=>[{...row,institutionId:'sruti'}]}));
 assert.deepEqual(q.records,[]);
});
test('unverified Cognito identities cannot be described as verified',async()=>{
 const q=await finalGuardianQueue(inst,reader({verifiedIdentity:async()=>null}));
 assert.equal(Object.keys(q.identities).length,0);
});
test('Cognito directory outage does not create verified account status',async()=>{
 const q=await finalGuardianQueue(inst,reader({verifiedIdentity:async()=>{throw Error('unavailable')}}));
 assert.equal(Object.keys(q.identities).length,0);
});
test('guardian queue isolates stale, broken, mismatched family and cross-academy records without approving them',async()=>{
 for(const bad of [
  {link:async()=>({...row,accessStatus:'approved',version:0})},
  {person:async id=>id===guardian.personId?{...guardian,familyId:'WRONG'}:student},
  {person:async id=>id===guardian.personId?{...guardian,institutionIds:['sruti']}:student},
  {link:async()=>null},
 ]){const result=await finalGuardianQueue(inst,reader(bad));assert.equal(result.records.length,0);assert.equal(result.reconciliationRequired,1);}
});
test('duplicate guardian records refuse to silently select one',async()=>{
 await assert.rejects(()=>finalGuardianQueue(inst,reader({links:async()=>[row,row]})),{status:409});
});
test('subject-to-person resolution requires a unique current canonical guardian',async()=>{
 assert.equal(await canonicalGuardianPersonForSubject(inst,sub,reader()),guardian.personId);
 await assert.rejects(()=>canonicalGuardianPersonForSubject(inst,sub,reader({peopleForSubject:async()=>[guardian,guardian]})),{status:409});
 await assert.rejects(()=>canonicalGuardianPersonForSubject(inst,sub,reader({person:async()=>({...guardian,status:'archived'})})),{status:409});
});
test('admin queue opt-in and authentication, no datastore access before authorisation',async()=>{
 calls=[];
 assert.equal((await finalCoreIdentityRoute(context('family-access/requests'),deps,access,{...env,SADHANA_FINAL_GUARDIAN_QUEUE_READS:''})).status,503);
 assert.equal((await finalCoreIdentityRoute(context('family-access/requests'),deps,access,{...env,SADHANA_DATA_MODE:'split'})).status,503);
 assert.deepEqual(calls,[]);
 await assert.rejects(()=>finalCoreIdentityRoute({...context('family-access/requests'),claims:{sub:'not-admin'}},deps,access,env),{status:403});
 assert.deepEqual(calls,[]);
});
test('admin queue route returns canonical records only after schema guard',async()=>{
 calls=[];const result=await finalCoreIdentityRoute(context('family-access/requests'),deps,access,env);
 assert.equal(result.status,200);assert.equal(result.body.source,'final');assert.deepEqual(calls,['configured']);
});
test('guardian final review translates Cognito subject to person id with independent evidence',async()=>{
 calls=[];
 const request={subject:sub,studentId:student.personId,decision:'approved',expectedVersion:2,relationshipVerified:true,evidenceReference:'ticket-2026-0001'};
 const result=await finalCoreIdentityRoute(context('family-access/decide','POST',request),deps,access,env);
 assert.equal(result.status,200);assert.deepEqual(calls[1],[inst,who,{guardianPersonId:guardian.personId,studentId:student.personId,decision:'approved',expectedVersion:2,relationshipVerified:true,evidenceReference:'ticket-2026-0001'}]);
});
test('guardian decisions fail closed for missing evidence, extraneous keys, disabled flags, and self-approval delegated',async()=>{
 for(const body of [
  {subject:sub,studentId:student.personId,decision:'approved',expectedVersion:2,relationshipVerified:true},
  {subject:sub,studentId:student.personId,decision:'approved',expectedVersion:2,relationshipVerified:true,evidenceReference:'bad space'},
  {subject:sub,studentId:student.personId,decision:'approved',expectedVersion:2,relationshipVerified:true,evidenceReference:'ticket-123',guardianPersonId:'WRONG'},
 ]){
  calls=[];assert.equal((await finalCoreIdentityRoute(context('family-access/decide','POST',body),deps,access,env)).status,400);assert.deepEqual(calls,[]);
 }
 calls=[];assert.equal((await finalCoreIdentityRoute(context('family-access/decide','POST',{}),deps,access,{...env,SADHANA_FINAL_GUARDIAN_DECISIONS:''})).status,503);assert.deepEqual(calls,[]);
});
test('split mode never invokes the final queue or guardian service',async()=>{
 calls=[];
 assert.equal(await finalCoreIdentityRoute(context('family-access/requests'),deps,access,{...env,SADHANA_ENTITY_TABLE_SET:'m9'}),undefined);
 assert.deepEqual(calls,[]);
});

const srutiGuardian={...guardian,institutionIds:['raaga','sruti']};
const srutiStudent={...student,institutionIds:['raaga','sruti']};
const approvedRaaga={...row,accessStatus:'approved',relationshipVerified:true};
function crossReader(overrides={}){
 const g='link_raaga_verified',s='link_sruti_expected';
 return reader({links:async()=>[approvedRaaga],link:async id=>id===approvedRaaga.linkId?approvedRaaga:null,
  person:async id=>id===guardian.personId?srutiGuardian:id===student.personId?srutiStudent:null,
  peopleForSubject:async()=>[srutiGuardian],
  guardianLinkId:async(inst)=>inst==='raaga'?approvedRaaga.linkId:s,
  createPendingSruti:async()=>({status:'pending',submitted:true}),...overrides});
}
test('Sruti candidate requires approved independently verified Raaga link and Sruti memberships',async()=>{
 assert.deepEqual((await finalSrutiGuardianCandidates(crossReader())).records,[{studentId:student.personId,subject:sub}]);
 assert.deepEqual((await finalSrutiGuardianCandidates(crossReader({link:async()=>({...approvedRaaga,relationshipVerified:false})}))).records,[]);
 assert.deepEqual((await finalSrutiGuardianCandidates(crossReader({person:async id=>id===guardian.personId?srutiGuardian:{...srutiStudent,institutionIds:['raaga']}}))).records,[]);
 assert.deepEqual((await finalSrutiGuardianCandidates(crossReader({link:async id=>id===approvedRaaga.linkId?approvedRaaga:{accessStatus:'pending'}}))).records,[]);
});
test('Sruti already-pending guardian link remains pending and is never duplicated',async()=>{
 const result=await finalSrutiGuardianRequest(crossReader({link:async id=>id===approvedRaaga.linkId?approvedRaaga:{linkId:id,institutionId:'sruti',guardianPersonId:guardian.personId,studentId:student.personId,accessStatus:'pending'}}),student.personId,sub);
 assert.deepEqual(result,{status:'pending',submitted:false});
});
test('Sruti candidate/request route requires admin, final flags and well-formed exact IDs',async()=>{
 const srutiEnv={...env,SADHANA_FINAL_GUARDIAN_REQUESTS:'enabled'};
 const srutiContext=(route,method='GET',body={})=>({parts:['family-access',route],method,claims:{sub:'admin',admin:['sruti']},query:{institution:'sruti'},inst:'sruti',event:{body:JSON.stringify(body)}});
 const adminSruti={admin:(claims,inst)=>{if(!claims.admin?.includes(inst))throw Object.assign(Error('Forbidden'),{status:403});}};
 const fake={...deps,guardianReader:()=>crossReader()};
 assert.equal((await finalCoreIdentityRoute(srutiContext('sruti-candidates'),fake,adminSruti,srutiEnv)).status,200);
 assert.equal((await finalCoreIdentityRoute(srutiContext('sruti-candidates'),fake,adminSruti,{...srutiEnv,SADHANA_FINAL_GUARDIAN_QUEUE_READS:''})).status,503);
 assert.equal((await finalCoreIdentityRoute(srutiContext('sruti-request','POST',{studentId:'bad'}),fake,adminSruti,srutiEnv)).status,400);
 assert.equal((await finalCoreIdentityRoute(srutiContext('sruti-request','POST',{studentId:student.personId,subject:sub}),fake,adminSruti,srutiEnv)).status,201);
 await assert.rejects(()=>finalCoreIdentityRoute({...srutiContext('sruti-candidates'),claims:{sub:'stranger'}},fake,adminSruti,srutiEnv),{status:403});
});

test('unreconciled historical link does not prevent valid pending guardian review',async()=>{
 const invalid={...row,linkId:'LINK-BROKEN-1',guardianPersonId:'PERSON-UNLINKED-1'};
 const r=reader({links:async()=>[invalid,row],link:async id=>id===row.linkId?row:invalid});
 const result=await finalGuardianQueue(inst,r);
 assert.equal(result.records.length,1);
 assert.equal(result.records[0].studentId,student.personId);
 assert.equal(result.reconciliationRequired,1);
});
