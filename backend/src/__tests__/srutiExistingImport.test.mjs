import test from 'node:test';
import assert from 'node:assert/strict';
import {srutiExistingIdentityImport} from '../srutiExistingImport.mjs';
import {guardianLinkId,markerId} from '../websiteImportCore.mjs';

const ref='SR-2026-4D6401';
const studentNames=['Tanisha Kanakam','Taniha Kanakam'];
const submission={institution:'sruti',registrationType:'child',guardian:{firstName:'Mohana',lastName:'Kamanooru',email:'mohana@example.net',phone:'+447901234567',relationship:'mother',address1:'1 Test Street',city:'York',postcode:'YO1 1AA',emergencyName:'Mohana Kamanooru',emergencyPhone:'+447901234567'},
 students:studentNames.map(name=>({firstName:name.split(' ')[0],lastName:'Kanakam',dateOfBirth:'2017-06-08',applicantType:'child',gender:'',school:'',interests:'',experience:'',allergies:'',medicalNotes:''})),consents:{registration:true,photography:false}};
const reg={registrationId:ref,institutionId:'sruti',source:'sruti-website',reviewStatus:'approved',importStatus:'pending',status:'approved',version:2,submittedAt:'2026-11-05T00:00:00.000Z',submission};
const family={familyId:'fam_existing',primaryContactPersonId:'per_guard',institutionIds:['raaga'],status:'active',version:1,familyNumber:'001'};
const guardian={personId:'per_guard',familyId:family.familyId,displayName:'Mohana Kamanooru',email:'mohana@example.net',personTypes:['guardian'],institutionIds:['raaga'],status:'active',version:3,cognitoSub:'test-sub'};
const children=studentNames.map((name,i)=>({personId:`per_child_${i+1}`,familyId:family.familyId,displayName:name,personTypes:['student'],institutionIds:['raaga'],status:'active',version:2,studentProfile:{dateOfBirth:'2017-06-08',rollNumber:`RS-00${i+1}`,rollNumbers:{raaga:`RS-00${i+1}`}}}));
const links=children.map(p=>({linkId:guardianLinkId('raaga',guardian.personId,p.personId),recordType:'guardian-access',institutionId:'raaga',familyId:family.familyId,guardianPersonId:guardian.personId,studentId:p.personId,accessStatus:'approved',relationshipVerified:true,version:2}));
const body={confirmReference:ref,guardianPersonId:guardian.personId,students:children.map((p,i)=>({sourcePersonId:`sruti-child-${i+1}`,personId:p.personId})),evidenceReference:'admin-reviewed:source-0001'};
class MockGetCommand {constructor(input){this.input=input;}}
class MockTransactWriteCommand {constructor(input){this.input=input;}}
const rows=()=>({
 'sadhana-dev-registrations':{[ref]:structuredClone(reg)},
 'sadhana-dev-people':Object.fromEntries([guardian,...children].map(p=>[p.personId,structuredClone(p)])),
 'sadhana-dev-families':{[family.familyId]:structuredClone(family)},
 'sadhana-dev-family-links':Object.fromEntries(links.map(l=>[l.linkId,structuredClone(l)])),
 'sadhana-dev-counters':{'sruti#FAMILY_NUMBER':{counterId:'sruti#FAMILY_NUMBER',lastAllocated:2},'sruti#STUDENT_ROLL':{counterId:'sruti#STUDENT_ROLL',lastAllocated:5}}
});
function mockDb(){
 const data=rows(),writes=[];
 return {data,writes,async send(cmd){
  if(cmd.constructor.name==='GetCommand'||cmd instanceof MockGetCommand){
   const input=cmd.input;const key=Object.values(input.Key)[0];return {Item:data[input.TableName]?.[key]};
  }
  if(cmd.constructor.name==='TransactWriteCommand'||cmd instanceof MockTransactWriteCommand){writes.push(cmd.input.TransactItems);return {};}
  throw Error('Unexpected DynamoDB command: '+cmd.constructor.name);
 }};
}
// The following tests run against real AWS SDK Command classes in the repo, but
// inject a mock send() method, so AWS never receives requests.
process.env.SADHANA_ENTITY_TABLE_SET='final';
process.env.SADHANA_ENTITY_FINAL_ACK='enabled';
process.env.SADHANA_DATA_MODE='final';
test('preview reuses guardian and both exact child IDs without writing',async()=>{
 const db=mockDb();const result=await srutiExistingIdentityImport(db,ref,'actor-123',body,false);
 assert.equal(result.readyForExecute,true);assert.equal(result.noNewPeople,true);assert.equal(result.studentCount,2);
 assert.deepEqual(result.studentMappings.map(s=>s.personId),children.map(s=>s.personId));
 assert.equal(db.writes.length,0);
});
test('execute atomically imports membership with verified relationships from the approved registration',async()=>{
 const db=mockDb();const result=await srutiExistingIdentityImport(db,ref,'actor-123',body,true);
 assert.equal(result.imported,true);assert.equal(result.verifiedGuardianLinks,2);
 assert.equal(db.writes.length,1);const tx=db.writes[0];
 assert.equal(tx.some(w=>w.Update?.Key?.counterId==='sruti#STUDENT_ROLL'),false);
 assert.equal(tx.some(w=>w.Put?.Item?.sequenceType==='ROLL_UNIQUE'),false);
 assert.deepEqual(result.studentRollNumbers,{'sruti-child-1':'RS-001','sruti-child-2':'RS-002'});
 assert.equal(tx.filter(w=>w.Put?.TableName==='sadhana-dev-people').length,3);
 const guardianMembership=tx.find(w=>w.Put?.TableName==='sadhana-dev-people'&&w.Put.Item.personId===guardian.personId);
 assert.deepEqual(guardianMembership.Put.Item.institutionIds,['raaga','sruti']);
 const createdLinks=tx.filter(w=>w.Put?.TableName==='sadhana-dev-family-links').map(w=>w.Put.Item);
 assert.equal(createdLinks.length,2);
 assert(createdLinks.every(x=>x.accessStatus==='approved'&&x.relationshipVerified===true&&x.verificationSource==='approved-website-registration'&&x.evidenceReference===body.evidenceReference&&x.reviewedBy==='actor-123'));
 assert.equal(tx.filter(w=>w.Put?.TableName==='sadhana-dev-registrations').length,1);
 assert.equal(tx.filter(w=>w.Update?.TableName==='sadhana-dev-registrations').length,1);
 assert.equal(tx.filter(w=>w.Put?.TableName==='sadhana-dev-audit-records').length,1);
 assert.ok(tx.every(w=>w.Put?.ConditionExpression||w.Update?.ConditionExpression));
});
test('wrong existing child mapping is blocked before any writes',async()=>{
 const db=mockDb();const bad={...body,students:[{...body.students[0],personId:body.students[1].personId},body.students[1]]};
 await assert.rejects(srutiExistingIdentityImport(db,ref,'actor-123',bad,true),/unique/i);
 assert.equal(db.writes.length,0);
});
test('unverified Raagasudha link cannot be treated as identity proof',async()=>{
 const db=mockDb();db.data['sadhana-dev-family-links'][links[0].linkId].relationshipVerified=false;
 await assert.rejects(srutiExistingIdentityImport(db,ref,'actor-123',body,true),/independently verified/i);
 assert.equal(db.writes.length,0);
});
test('duplicate Sruti membership is refused',async()=>{
 const db=mockDb();db.data['sadhana-dev-people'][children[0].personId].institutionIds.push('sruti');
 await assert.rejects(srutiExistingIdentityImport(db,ref,'actor-123',body,true),/identity\/academy/i);
 assert.equal(db.writes.length,0);
});
test('incorrect date of birth blocks cross-academy mapping',async()=>{
 const db=mockDb();db.data['sadhana-dev-people'][children[0].personId].studentProfile.dateOfBirth='2018-01-01';
 await assert.rejects(srutiExistingIdentityImport(db,ref,'actor-123',body,true),/date-of-birth/i);
 assert.equal(db.writes.length,0);
});
test('successful prior import is idempotent only with identical mapping',async()=>{
 const db=mockDb();db.data['sadhana-dev-registrations'][ref].importStatus='imported';
 db.data['sadhana-dev-registrations'][markerId('sruti',ref)]={registrationId:markerId('sruti',ref),institutionId:'sruti',externalRegistrationId:ref,importStatus:'imported',familyId:family.familyId,
 studentIds:children.map(p=>p.personId),sourceStudentIds:Object.fromEntries(body.students.map(s=>[s.sourcePersonId,s.personId]))};
 const r=await srutiExistingIdentityImport(db,ref,'actor-123',body,true);
 assert.equal(r.alreadyImported,true);assert.equal(db.writes.length,0);
 await assert.rejects(srutiExistingIdentityImport(db,ref,'actor-123',{...body,students:[{...body.students[0],personId:children[1].personId},{...body.students[1],personId:children[0].personId}]},true),/mapping differs/i);
});

test('an old-format roll requires migration rather than allocating a second number',async()=>{
 const db=mockDb();delete db.data['sadhana-dev-people'][children[0].personId].studentProfile.rollNumber;
 db.data['sadhana-dev-people'][children[0].personId].studentProfile.rollNumbers={raaga:'001-001'};
 await assert.rejects(srutiExistingIdentityImport(db,ref,'actor-123',body,true),/permanent roll number must be reconciled/i);
 assert.equal(db.writes.length,0);
});
