import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {markerId,guardianLinkId} from '../src/websiteImportCore.mjs';
import {canonicalRaagaParentSnapshot,canonicalRaagaParentAction} from '../src/finalRaagaParentActions.mjs';
import {finalRaagaIntakeRoute} from '../src/finalRaagaIntake.mjs';
import {finalRegistrationRoute} from '../src/finalRegistration.mjs';

const id='RS-2026-PARENT-01',registrationId=markerId('raaga',id),sub='12345678-1111-2222-3333-abcdefabcdef';
function fixtures(){
 const reg={registrationId,externalRegistrationId:id,institutionId:'raaga',source:'website',importStatus:'imported',
  familyId:'fam_family1',studentIds:['per_student1','per_student2'],provisioningStatus:'EXISTING_ACCOUNT_LINKED'};
 const family={familyId:'fam_family1',primaryContactPersonId:'per_guardian1',institutionIds:['raaga'],status:'active'};
 const guardian={personId:'per_guardian1',familyId:family.familyId,personTypes:['guardian'],institutionIds:['raaga'],status:'active',cognitoSub:sub};
 const students=['per_student1','per_student2'].map(personId=>({personId,familyId:family.familyId,personTypes:['student'],institutionIds:['raaga'],status:'active'}));
 const links=students.map(s=>({linkId:guardianLinkId('raaga',guardian.personId,s.personId),recordType:'guardian-access',familyId:family.familyId,
  guardianPersonId:guardian.personId,studentId:s.personId,institutionId:'raaga',accessStatus:'approved',relationshipVerified:true}));
 const guards={['COGNITO_SUB#'+createHash('sha256').update(sub).digest('hex')]:{personId:guardian.personId}};
 const calls=[];const reader={
  registration:async k=>(calls.push(['registration',k]),k===registrationId?reg:null),
  family:async k=>(calls.push(['family',k]),k===family.familyId?family:null),
  person:async k=>(calls.push(['person',k]),[guardian,...students].find(s=>s.personId===k)||null),
  link:async k=>(calls.push(['link',k]),links.find(s=>s.linkId===k)||null),
  subjectGuard:async s=>(calls.push(['guard',s]),guards['COGNITO_SUB#'+createHash('sha256').update(s).digest('hex')]||null),
  linkVerifiedAccount:async (k,inst,claims,expected)=>(calls.push(['linkVerified',k,inst,claims.sub,expected]),{linked:true,alreadyLinked:false}),
 };
 return {reg,family,guardian,students,links,guards,calls,reader};
}
const actor={sub:'admin-1'};

test('already-linked family can safely retry provisioning without creating an account',async()=>{
 const x=fixtures();const result=await canonicalRaagaParentAction('provision-parent',id,{},actor,x.reader);
 assert.deepEqual(result,{status:'ACCOUNT_FOUND',alreadyProcessed:true,guardianAccessGranted:false});
 assert.equal(x.calls.some(c=>c[0]==='linkVerified'),false);
});
test('queue action counts already-existing approved family links and never writes',async()=>{
 const x=fixtures();const res=await canonicalRaagaParentAction('queue-parent-links',id,{},actor,x.reader);
 assert.equal(res.queued,0);assert.equal(res.alreadyExists,2);assert.equal(res.approved,2);assert.equal(res.guardianAccessGranted,false);
 assert.equal(x.calls.some(c=>c[0]==='linkVerified'),false);
});
test('pending guardian links are not claimed approved',async()=>{
 const x=fixtures();x.links.forEach(l=>{l.accessStatus='pending';l.relationshipVerified=false;});
 const res=await canonicalRaagaParentAction('queue-parent-links',id,{},actor,x.reader);
 assert.equal(res.pending,2);assert.equal(res.approved,0);assert.equal(res.queued,0);
});
test('rejected and revoked links are preserved, not requeued',async()=>{
 const x=fixtures();x.links[0].accessStatus='rejected';x.links[1].accessStatus='revoked';
 const res=await canonicalRaagaParentAction('queue-parent-links',id,{},actor,x.reader);
 assert.equal(res.alreadyExists,2);assert.equal(res.queued,0);assert.equal(res.approved,0);
});
test('missing, mismatched or foreign guardian links stop the entire action',async()=>{
 for(const mutation of [x=>x.links.pop(),x=>x.links[0].familyId='fam_wrong',x=>x.links[0].institutionId='sruti']){
  const x=fixtures();mutation(x);await assert.rejects(canonicalRaagaParentAction('queue-parent-links',id,{},actor,x.reader),/Guardian review record/);
 }
});
test('wrong institution, missing registration and missing family never route into legacy',async()=>{
 for(const mutation of [x=>x.reg.institutionId='sruti',x=>x.reg.externalRegistrationId='RS-OTHER',x=>x.family.status='archived']){
  const x=fixtures();mutation(x);await assert.rejects(canonicalRaagaParentSnapshot(id,x.reader),/reconciliation/);
 }
});
test('canonical link must have a valid uniqueness guard',async()=>{
 const x=fixtures();x.guards['COGNITO_SUB#'+createHash('sha256').update(sub).digest('hex')].personId='per_other';
 await assert.rejects(canonicalRaagaParentAction('provision-parent',id,{},actor,x.reader),/uniqueness guard/);
});
test('unlinked registration remains disabled without explicit identity proof',async()=>{
 const x=fixtures();x.reg.provisioningStatus='NOT_INVITED';delete x.guardian.cognitoSub;
 const out=await canonicalRaagaParentAction('provision-parent',id,{},actor,x.reader);
 assert.equal(out.disabled,true);assert.equal(out.guardianAccessGranted,false);assert.equal(x.calls.some(c=>c[0]==='linkVerified'),false);
});
test('verified account linkage needs both exact reference and subject',async()=>{
 const x=fixtures();x.reg.provisioningStatus='NOT_INVITED';delete x.guardian.cognitoSub;
 for(const body of [{expectedSubject:sub},{confirmReference:id},{expectedSubject:'bad',confirmReference:id},{expectedSubject:sub,confirmReference:'RS-OTHER'},{expectedSubject:sub,confirmReference:id,adminOverride:true}]){
  await assert.rejects(canonicalRaagaParentAction('provision-parent',id,body,actor,x.reader),/Specify the exact/);
 }
 assert.equal(x.calls.some(c=>c[0]==='linkVerified'),false);
 const out=await canonicalRaagaParentAction('provision-parent',id,{expectedSubject:sub,confirmReference:id},actor,x.reader);
 assert.equal(out.status,'ACCOUNT_FOUND');assert.equal(out.guardianAccessGranted,false);
 assert.deepEqual(x.calls.at(-1),['linkVerified',registrationId,'raaga','admin-1',sub]);
});
test('historically imported account never relinks to a different subject',async()=>{
 const x=fixtures();await assert.rejects(canonicalRaagaParentAction('provision-parent',id,{expectedSubject:sub,confirmReference:id},actor,x.reader),/already linked/);
 assert.equal(x.calls.some(c=>c[0]==='linkVerified'),false);
});
test('resend cannot use PK/SK legacy handler and requires a real invitation',async()=>{
 const x=fixtures();await assert.rejects(canonicalRaagaParentAction('resend-parent-invitation',id,{},actor,x.reader),/No pending invitation/);
 x.reg.provisioningStatus='INVITATION_SENT';await assert.rejects(canonicalRaagaParentAction('resend-parent-invitation',id,{},actor,x.reader),/Confirm the exact registration reference/);
});
test('final route refuses all parent operations in split mode even if every flag set',async()=>{
 const x=fixtures(),env={SADHANA_ENTITY_TABLE_SET:'final',SADHANA_ENTITY_FINAL_ACK:'enabled',SADHANA_FINAL_RAAGA_PARENT_ACTION_READS:'enabled',SADHANA_DATA_MODE:'split'};
 const deps={parse:e=>JSON.parse(e.body||'{}'),assertConfigured:()=>{},parentAction:(...args)=>canonicalRaagaParentAction(...args,x.reader)};
 for(const action of ['queue-parent-links','provision-parent','resend-parent-invitation']){
  const route={parts:['website-registrations',id,action],method:'POST',claims:actor,event:{body:'{}'}};
  const result=await finalRaagaIntakeRoute(route,deps,env);assert.equal(result.status,503);
 }
 assert.equal(x.calls.length,0);
});
test('final parent action requires independent explicit feature flag',async()=>{
 const x=fixtures(),deps={parse:e=>JSON.parse(e.body||'{}'),assertConfigured:()=>{},parentAction:(...args)=>canonicalRaagaParentAction(...args,x.reader)};
 const route={parts:['website-registrations',id,'queue-parent-links'],method:'POST',claims:actor,event:{body:'{}'}};
 assert.equal((await finalRaagaIntakeRoute(route,deps,{SADHANA_ENTITY_TABLE_SET:'final',SADHANA_ENTITY_FINAL_ACK:'enabled'})).status,503);
 assert.equal(x.calls.length,0);
});
test('final intake routes approved parent read action only after flag, without fallback',async()=>{
 const x=fixtures(),calls=[];const deps={parse:e=>JSON.parse(e.body||'{}'),assertConfigured:()=>calls.push('configured'),parentAction:(...args)=>canonicalRaagaParentAction(...args,x.reader)};
 const route={parts:['website-registrations',id,'queue-parent-links'],method:'POST',claims:actor,event:{body:'{}'}};
 const out=await finalRaagaIntakeRoute(route,deps,{SADHANA_ENTITY_TABLE_SET:'final',SADHANA_ENTITY_FINAL_ACK:'enabled',SADHANA_FINAL_RAAGA_PARENT_ACTION_READS:'enabled'});
 assert.equal(out.status,200);assert.equal(out.body.approved,2);assert.deepEqual(calls,['configured']);
});

test('inconsistent existing guardian Cognito link cannot be overwritten when marker says NOT_INVITED',async()=>{
 const x=fixtures();x.reg.provisioningStatus='NOT_INVITED';
 await assert.rejects(canonicalRaagaParentAction('provision-parent',id,{expectedSubject:sub,confirmReference:id},actor,x.reader),/Provisioning state and Cognito link disagree/);
 assert.equal(x.calls.some(c=>c[0]==='linkVerified'),false);
});

test('final administrator permission is required before canonical parent data is read',async()=>{
 const x=fixtures(),env={SADHANA_ENTITY_TABLE_SET:'final',SADHANA_ENTITY_FINAL_ACK:'enabled',SADHANA_FINAL_RAAGA_PARENT_ACTION_READS:'enabled'};
 const context={parts:['website-registrations',id,'queue-parent-links'],method:'POST',claims:actor,query:{},event:{body:'{}'}};
 const deps={assertConfigured:()=>{},registration:async()=>{throw Error('Sruti path used')},
  raaga:c=>finalRaagaIntakeRoute(c,{assertConfigured:()=>{},parse:e=>JSON.parse(e.body||'{}'),
   parentAction:(...args)=>canonicalRaagaParentAction(...args,x.reader)},env)};
 await assert.rejects(finalRegistrationRoute(context,deps,{admin:()=>{throw Object.assign(new Error('Forbidden'),{status:403});}},env),/Forbidden/);
 assert.deepEqual(x.calls,[]);
});
