import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanonicalRaagaInvitationFlow,canonicalRaagaContactGuardId} from '../finalRaagaInvitationFlow.mjs';
import {canonicalRaagaParentAction} from '../finalRaagaParentActions.mjs';
import {markerId,guardianLinkId} from '../websiteImportCore.mjs';
const ref='RS-2026-COMMITTED';
const id=markerId('raaga',ref),email='parent@example.org',sub='12345678-1234-1234-1234-123456789abc';
const flags={SADHANA_ENTITY_TABLE_SET:'final',SADHANA_ENTITY_FINAL_ACK:'enabled',SADHANA_DATA_MODE:'final',
 SADHANA_FINAL_RAAGA_PARENT_INVITATIONS:'enabled',SADHANA_FINAL_RAAGA_PARENT_RESENDS:'enabled'};
const t='2026-11-06T15:00:00.000Z';
function fixture(){
 const reg={registrationId:id,source:'website',institutionId:'raaga',importStatus:'imported',provisioningStatus:'NOT_INVITED',familyId:'fam_family1',externalRegistrationId:ref,studentIds:['per_child1']};
 const guardian={personId:'per_parent1',familyId:reg.familyId,personTypes:['guardian'],institutionIds:['raaga'],status:'active',email,firstName:'P'};
 const contact={personId:guardian.personId,familyId:reg.familyId,institutionId:'raaga'};
 const calls=[],ops={
  contact:async()=>{calls.push('contact');return contact;},
  listByEmail:async()=>{calls.push('list');return {count:0,paginated:false};},
  reserveInvite:async()=>{calls.push('reserveInvite');},
  createUser:async(username,mail,name)=>{calls.push(['create',username,mail,name]);return {Username:username,Attributes:[{Name:'sub',Value:sub}]};},
  completeInvite:async()=>{calls.push('completeInvite');},
  getUser:async()=>{calls.push('getUser');return {Enabled:true,UserStatus:'FORCE_CHANGE_PASSWORD',UserAttributes:[{Name:'email',Value:email},{Name:'sub',Value:sub}]};},
  reserveResend:async()=>{calls.push('reserveResend');},
  sendResend:async()=>{calls.push('sendResend');},
  completeResend:async()=>{calls.push('completeResend');}
 };
 const flow=(env=flags)=>createCanonicalRaagaInvitationFlow(ops,env,()=>t,()=>`00000000-0000-0000-0000-000000000001`);
 return {reg,guardian,contact,calls,ops,flow};
}
test('new invitation reserves canonical state before Cognito, without granting access',async()=>{
 const x=fixture();const result=await x.flow().invite(x.reg,x.guardian,'admin-sub');
 assert.equal(result.status,'INVITATION_SENT');assert.equal(result.guardianAccessGranted,false);
 assert.deepEqual(x.calls.map(v=>Array.isArray(v)?v[0]:v),['contact','list','reserveInvite','create','completeInvite']);
 assert.match(x.calls[3][1],/^parent-[a-f0-9]{32}$/);
});
test('all invitations and resends are disabled without final mode, ack and independent flags',async()=>{
 const x=fixture();for(const env of [{...flags,SADHANA_DATA_MODE:'split'}, {...flags,SADHANA_ENTITY_FINAL_ACK:''}, {...flags,SADHANA_FINAL_RAAGA_PARENT_INVITATIONS:''}]){
  await assert.rejects(x.flow(env).invite(x.reg,x.guardian,'admin-sub'),e=>e.status===503);
 }
 x.reg.provisioningStatus='INVITATION_SENT';x.reg.parentAccountEmail=email;x.reg.parentAccountSub=sub;x.reg.parentAccountUsername=`parent-${id.slice(4,36)}`;
 await assert.rejects(x.flow({...flags,SADHANA_FINAL_RAAGA_PARENT_RESENDS:''}).resend(x.reg,x.guardian,'admin-sub'),e=>e.status===503);
 assert.deepEqual(x.calls,[]);
});
test('existing Cognito user blocks duplicate new invitation before reservation',async()=>{
 const x=fixture();x.ops.listByEmail=async()=>({count:1,paginated:false});
 await assert.rejects(x.flow().invite(x.reg,x.guardian,'admin-sub'),/Independently verify/);
 assert(!x.calls.includes('reserveInvite'));
});
test('ambiguous Cognito search blocks provisioning',async()=>{
 const x=fixture();x.ops.listByEmail=async()=>({count:0,paginated:true});
 await assert.rejects(x.flow().invite(x.reg,x.guardian,'admin-sub'),/Independently verify/);
 assert(!x.calls.includes('reserveInvite'));
});
test('wrong contact guard fails before contacting Cognito',async()=>{
 const x=fixture();x.contact.personId='per_another';
 await assert.rejects(x.flow().invite(x.reg,x.guardian,'admin-sub'),/Contact uniqueness guard/);
 assert.deepEqual(x.calls,['contact']);
});
test('existing guardian Cognito link is never invited',async()=>{
 const x=fixture();x.guardian.cognitoSub=sub;
 await assert.rejects(x.flow().invite(x.reg,x.guardian,'admin-sub'),/reconciliation/);
 assert.deepEqual(x.calls,[]);
});
test('reserved invitation is not retried after uncertain Cognito failure',async()=>{
 const x=fixture();x.ops.createUser=async()=>{x.calls.push('create');throw Object.assign(new Error('timeout'),{name:'NetworkError'});};
 await assert.rejects(x.flow().invite(x.reg,x.guardian,'admin-sub'),/administrator reconciliation/);
 assert(x.calls.includes('reserveInvite'));assert(!x.calls.includes('completeInvite'));
});
test('conditional reservation failure never reaches Cognito',async()=>{
 const x=fixture();x.ops.reserveInvite=async()=>{throw Object.assign(new Error('failed'),{name:'TransactionCanceledException'});};
 await assert.rejects(x.flow().invite(x.reg,x.guardian,'admin-sub'),e=>e.status===409);
 assert(!x.calls.some(v=>Array.isArray(v)&&v[0]==='create'));
});
test('creation receipt mismatch must not claim an invitation or link a guardian',async()=>{
 const x=fixture();x.ops.createUser=async()=>({Username:'unexpected',Attributes:[{Name:'sub',Value:sub}]});
 await assert.rejects(x.flow().invite(x.reg,x.guardian,'admin-sub'),/manual reconciliation/);
 assert(!x.calls.includes('completeInvite'));
});
test('resend verifies Cognito before reserving a bounded retry',async()=>{
 const x=fixture();x.reg.provisioningStatus='INVITATION_SENT';x.reg.parentAccountEmail=email;
 x.reg.parentAccountSub=sub;x.reg.parentAccountUsername=`parent-${id.slice(4,36)}`;
 const out=await x.flow().resend(x.reg,x.guardian,'admin-sub');
 assert.equal(out.status,'INVITATION_SENT');assert.equal(out.guardianAccessGranted,false);
 assert.deepEqual(x.calls,['contact','getUser','reserveResend','sendResend','completeResend']);
});
test('active Cognito user must not receive a temporary-password resend',async()=>{
 const x=fixture();x.reg.provisioningStatus='INVITATION_SENT';x.reg.parentAccountEmail=email;
 x.reg.parentAccountSub=sub;x.reg.parentAccountUsername=`parent-${id.slice(4,36)}`;
 x.ops.getUser=async()=>({Enabled:true,UserStatus:'CONFIRMED',UserAttributes:[{Name:'email',Value:email},{Name:'sub',Value:sub}]});
 await assert.rejects(x.flow().resend(x.reg,x.guardian,'admin-sub'),/do not resend/);
 assert(!x.calls.includes('reserveResend'));
});
test('cooldown conflict blocks Cognito resend',async()=>{
 const x=fixture();x.reg.provisioningStatus='INVITATION_SENT';x.reg.parentAccountEmail=email;
 x.reg.parentAccountSub=sub;x.reg.parentAccountUsername=`parent-${id.slice(4,36)}`;
 x.ops.reserveResend=async()=>{throw Object.assign(new Error('throttle'),{name:'TransactionCanceledException'});};
 await assert.rejects(x.flow().resend(x.reg,x.guardian,'admin-sub'),e=>e.status===429);
 assert(!x.calls.includes('sendResend'));
});
test('resend failure leaves durable attempt; no false success response',async()=>{
 const x=fixture();x.reg.provisioningStatus='INVITATION_SENT';x.reg.parentAccountEmail=email;
 x.reg.parentAccountSub=sub;x.reg.parentAccountUsername=`parent-${id.slice(4,36)}`;
 x.ops.sendResend=async()=>{x.calls.push('sendResend');throw Error('provider error');};
 await assert.rejects(x.flow().resend(x.reg,x.guardian,'admin-sub'),/provider error/);
 assert(x.calls.includes('reserveResend'));assert(!x.calls.includes('completeResend'));
});
test('new invitation must be explicitly requested via the existing parent route',async()=>{
 const x=fixture();const reader={
  registration:async()=>x.reg,family:async()=>({familyId:x.reg.familyId,primaryContactPersonId:x.guardian.personId,status:'active',institutionIds:['raaga']}),
  person:async p=>p===x.guardian.personId?x.guardian:({personId:p,familyId:x.reg.familyId,status:'active',personTypes:['student'],institutionIds:['raaga']}),
  link:async k=>({linkId:k,guardianPersonId:x.guardian.personId,studentId:x.reg.studentIds[0],familyId:x.reg.familyId,institutionId:'raaga',recordType:'guardian-access',accessStatus:'pending'}),
  inviteNewAccount:async (...args)=>x.flow().invite(...args),
  resendInvitation:async(...args)=>x.flow().resend(...args),
 };
 const claims={sub:'admin-sub'};
 const empty=await canonicalRaagaParentAction('provision-parent',ref,{},claims,reader);
 assert.equal(empty.disabled,true);assert.equal(x.calls.length,0);
 await assert.rejects(canonicalRaagaParentAction('provision-parent',ref,{sendInvitation:true},claims,reader),e=>e.status===400);
 const out=await canonicalRaagaParentAction('provision-parent',ref,{sendInvitation:true,confirmReference:ref},claims,reader);
 assert.equal(out.status,'INVITATION_SENT');assert.equal(out.guardianAccessGranted,false);
});
test('already-linked canonical parent stays idempotent with the new frontend request body',async()=>{
 const x=fixture();x.reg.provisioningStatus='EXISTING_ACCOUNT_LINKED';x.guardian.cognitoSub=sub;
 const reader={
  registration:async()=>x.reg,family:async()=>({familyId:x.reg.familyId,primaryContactPersonId:x.guardian.personId,status:'active',institutionIds:['raaga']}),
  person:async p=>p===x.guardian.personId?x.guardian:({personId:p,familyId:x.reg.familyId,status:'active',personTypes:['student'],institutionIds:['raaga']}),
  link:async k=>({linkId:k,guardianPersonId:x.guardian.personId,studentId:x.reg.studentIds[0],familyId:x.reg.familyId,institutionId:'raaga',recordType:'guardian-access',accessStatus:'approved',relationshipVerified:true}),
  subjectGuard:async()=>({personId:x.guardian.personId})
 };
 const out=await canonicalRaagaParentAction('provision-parent',ref,{confirmReference:ref,sendInvitation:true},{sub:'admin-sub'},reader);
 assert.equal(out.alreadyProcessed,true);assert.equal(out.guardianAccessGranted,false);
});
test('resend route requires exact confirmation and does not reveal Cognito identity',async()=>{
 const x=fixture();x.reg.provisioningStatus='INVITATION_SENT';x.reg.parentAccountEmail=email;
 x.reg.parentAccountSub=sub;x.reg.parentAccountUsername=`parent-${id.slice(4,36)}`;
 const reader={
  registration:async()=>x.reg,family:async()=>({familyId:x.reg.familyId,primaryContactPersonId:x.guardian.personId,status:'active',institutionIds:['raaga']}),
  person:async p=>p===x.guardian.personId?x.guardian:({personId:p,familyId:x.reg.familyId,status:'active',personTypes:['student'],institutionIds:['raaga']}),
  link:async k=>({linkId:k,guardianPersonId:x.guardian.personId,studentId:x.reg.studentIds[0],familyId:x.reg.familyId,institutionId:'raaga',recordType:'guardian-access',accessStatus:'pending'}),
  resendInvitation:async (...args)=>x.flow().resend(...args)
 };
 await assert.rejects(canonicalRaagaParentAction('resend-parent-invitation',ref,{confirmReference:'RS-OTHER'},{sub:'admin-sub'},reader),/exact registration/);
 const out=await canonicalRaagaParentAction('resend-parent-invitation',ref,{confirmReference:ref},{sub:'admin-sub'},reader);
 assert.equal(out.guardianAccessGranted,false);assert(!JSON.stringify(out).includes(email));assert(!JSON.stringify(out).includes(sub));
});
test('AWS adapter requires atomic reservation, conditional receipt, and no PK/SK reference',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../finalRaagaInvitations.ts',import.meta.url),'utf8');
 assert.match(source,/TransactWriteCommand/);
 assert.match(source, /identityConditions\(guardian,\s*reg\)/);
 assert.match(source,/parentAccountEmail=:email/);
 assert.match(source,/attribute_not_exists\(invitationOperationId\)/);
 assert.match(source,/parentInvitationAttemptAt < :threshold/);
 assert.match(source,/ConditionExpression:\s*'provisioningStatus=:creating AND invitationOperationId=:op/);
 assert.doesNotMatch(source,/SADHANA_TABLE_NAME|OPS#GLOBAL#WEB_IMPORT|makeRoutedClient/);
});
test('invited account can be linked only to the original Cognito subject after verification',async()=>{
 const x=fixture();x.reg.provisioningStatus='INVITATION_SENT';x.reg.parentAccountSub=sub;
 x.reg.parentAccountEmail=email;x.reg.parentAccountUsername=`parent-${id.slice(4,36)}`;
 const calls=[],reader={
  registration:async()=>x.reg,
  family:async()=>({familyId:x.reg.familyId,primaryContactPersonId:x.guardian.personId,status:'active',institutionIds:['raaga']}),
  person:async p=>p===x.guardian.personId?x.guardian:({personId:p,familyId:x.reg.familyId,status:'active',personTypes:['student'],institutionIds:['raaga']}),
  link:async k=>({linkId:k,guardianPersonId:x.guardian.personId,studentId:x.reg.studentIds[0],familyId:x.reg.familyId,institutionId:'raaga',recordType:'guardian-access',accessStatus:'pending'}),
  linkVerifiedAccount:async (...args)=>{calls.push(args);return {linked:true,alreadyLinked:false,guardianAccessGranted:false}}
 };
 await assert.rejects(canonicalRaagaParentAction('provision-parent',ref,{confirmReference:ref,expectedSubject:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'},{sub:'admin-sub'},reader),/Invitation identity differs/);
 assert.equal(calls.length,0);
 const res=await canonicalRaagaParentAction('provision-parent',ref,{confirmReference:ref,expectedSubject:sub},{sub:'admin-sub'},reader);
 assert.equal(res.status,'ACCOUNT_FOUND');assert.equal(res.guardianAccessGranted,false);
 assert.deepEqual(calls,[[id,'raaga',{sub:'admin-sub'},sub]]);
});

test('invitation contact guard hashes match the canonical website import algorithm',async()=>{
 const {createHash}=await import('node:crypto');
 const expected='CONTACT#raaga#'+createHash('sha256').update(JSON.stringify([email])).digest('hex');
 assert.equal(canonicalRaagaContactGuardId(email),expected);
});
