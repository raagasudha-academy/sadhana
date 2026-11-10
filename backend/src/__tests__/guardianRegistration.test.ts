import test from 'node:test';
import assert from 'node:assert/strict';
import {makeM95GuardianService,m95Table} from '../guardianRegistration.ts';
import {guardianLinkId} from '../websiteImportCore.mjs';

const admin={'sub':'admin-sub','cognito:groups':['raagasudha-admin']};
const parent={sub:'parent-sub'};
const validGuardian={personId:'guardian1',cognitoSub:'parent-sub',status:'active',familyId:'family1',institutionIds:['raaga'],personTypes:['guardian']};
const student={personId:'student1',personTypes:['student'],familyId:'family1',institutionIds:['raaga'],status:'active'};
const family={familyId:'family1',institutionIds:['raaga'],status:'active'};
function fakeDb(opts:{student?:any,guardian?:any,current?:any}={}){
 const cmds:any[]=[];
 const send=async(c:any)=>{cmds.push(c);const name=c.constructor.name; const x=c.input;
  if(name==='QueryCommand')return {Items:opts.guardian===null?[]:[opts.guardian??validGuardian]};
  if(name==='GetCommand'){
   if(x.TableName.endsWith('-people'))return {Item:x.Key.personId==='student1'?(opts.student===undefined?student:opts.student):opts.guardian??validGuardian};
   if(x.TableName.endsWith('-families'))return {Item:x.Key.familyId==='family2'?{...family,familyId:'family2'}:family};
   if(x.TableName.endsWith('-family-links'))return {Item:opts.current};
  }
  return {};
 };
 return {cmds,db:{send}};
}
test('M9 table naming never collides with legacy tables',()=>{
 assert.equal(m95Table('family-links'),'sadhana-dev-m9-family-links');
 assert.throws(()=>m95Table('people','prod' as any),/environment/);
});
test('self-service request creates pending only and binds Cognito sub to resolved person',async()=>{
 const f=fakeDb();const res=await makeM95GuardianService(f.db).request('raaga',parent,{studentId:'student1'});
 assert.deepEqual(res,{status:'pending',submitted:true});
 const put=f.cmds.find(x=>x.constructor.name==='PutCommand')!.input;
 assert.equal(put.Item.accessStatus,'pending');assert.equal(put.Item.guardianPersonId,'guardian1');
 assert.equal(put.Item.guardianFamilyId,'family1');
 assert.equal(put.Item.linkId,guardianLinkId('raaga','guardian1','student1'));
 assert.equal(put.Item.institutionId,'raaga');assert.equal(put.Item.relationship,'unverified');
 assert.equal(put.ConditionExpression,'attribute_not_exists(linkId)');
});
test('account with no unique mapped Cognito person cannot request guardian access',async()=>{
 const f=fakeDb({guardian:null});await assert.rejects(makeM95GuardianService(f.db).request('raaga',parent,{studentId:'student1'}),/identity requires/);
 assert.equal(f.cmds.some(x=>x.constructor.name==='PutCommand'),false);
});
test('student in another institution cannot receive request',async()=>{
 const f=fakeDb({student:{...student,institutionIds:['sruti']}});
 await assert.rejects(makeM95GuardianService(f.db).request('raaga',parent,{studentId:'student1'}),/Unable to request/);
 assert.equal(f.cmds.some(x=>x.constructor.name==='PutCommand'),false);
});
test('guardian request rejects user-supplied beneficiary account and status',async()=>{
 const f=fakeDb();await assert.rejects(makeM95GuardianService(f.db).request('raaga',parent,{studentId:'student1',accessStatus:'approved'}),/studentId/);
});
test('administrator approval requires independent evidence',async()=>{
 const f=fakeDb();await assert.rejects(makeM95GuardianService(f.db).decide('raaga',admin,{guardianPersonId:'guardian1',studentId:'student1',decision:'approved',expectedVersion:1,relationshipVerified:true}),/evidence/);
 assert.equal(f.cmds.some(x=>x.constructor.name==='TransactWriteCommand'),false);
});
test('administrator approval uses conditional transaction and separate audit',async()=>{
 const current={linkId:guardianLinkId('raaga','guardian1','student1'),guardianPersonId:'guardian1',studentId:'student1',institutionId:'raaga',familyId:'family1',accessStatus:'pending',version:1};
 const f=fakeDb({current});
 const evidenceNote='Reviewed registration and called contact on file (9 Nov 2026)';
 const res=await makeM95GuardianService(f.db).decide('raaga',admin,{guardianPersonId:'guardian1',studentId:'student1',decision:'approved',expectedVersion:1,relationshipVerified:true,evidenceReference:evidenceNote});
 assert.equal(res.status,'approved');assert.equal(res.version,2);
 const tx=f.cmds.find(x=>x.constructor.name==='TransactWriteCommand')!.input;
 assert.equal(tx.TransactItems.length,2);
 assert.match(tx.TransactItems[0].Update.ConditionExpression,/#v=:old/);
 assert.equal(tx.TransactItems[0].Update.ExpressionAttributeValues[':evidence'],evidenceNote);
 assert.equal(tx.TransactItems[1].Put.TableName,'sadhana-dev-m9-audit');
 assert.equal(tx.TransactItems[1].Put.Item.metadata.evidenceNote,evidenceNote);
});
test('parent request across existing family records remains pending and can be separately verified',async()=>{
 const otherGuardian={...validGuardian,familyId:'family2'};
 const f=fakeDb({guardian:otherGuardian});
 const service=makeM95GuardianService(f.db);
 await service.request('raaga',parent,{studentId:'student1'});
 const put=f.cmds.find(x=>x.constructor.name==='PutCommand')!.input;
 assert.equal(put.Item.familyId,'family1');assert.equal(put.Item.guardianFamilyId,'family2');
 const current={...put.Item,accessStatus:'pending',version:1};
 const reviewed=fakeDb({guardian:otherGuardian,current});
 const result=await makeM95GuardianService(reviewed.db).decide('raaga',admin,{guardianPersonId:'guardian1',studentId:'student1',decision:'approved',expectedVersion:1,relationshipVerified:true,evidenceReference:'verification123'});
 assert.equal(result.status,'approved');
 const update=reviewed.cmds.find(x=>x.constructor.name==='TransactWriteCommand')!.input.TransactItems[0].Update;
 assert.match(update.ConditionExpression,/#guardianFamily/);
});
test('self-approval fails closed',async()=>{
 const f=fakeDb({current:{}});
 await assert.rejects(makeM95GuardianService(f.db).decide('raaga',{...admin,sub:'parent-sub'},{guardianPersonId:'guardian1',studentId:'student1',decision:'approved',expectedVersion:1,relationshipVerified:true,evidenceReference:'proof'}),/Self-approval/);
});
test('cross-institution decision denied before database access',async()=>{
 const f=fakeDb();await assert.rejects(makeM95GuardianService(f.db).decide('sruti',admin,{guardianPersonId:'guardian1',studentId:'student1',decision:'approved',expectedVersion:1,relationshipVerified:true,evidenceReference:'proof'}),/administrator/);
 assert.equal(f.cmds.length,0);
});

test('approval refuses a guardian without linked Cognito identity',async()=>{
 const current={linkId:guardianLinkId('raaga','guardian1','student1'),guardianPersonId:'guardian1',studentId:'student1',institutionId:'raaga',familyId:'family1',accessStatus:'pending',version:1};
 const f=fakeDb({guardian:{...validGuardian,cognitoSub:undefined},current});
 await assert.rejects(makeM95GuardianService(f.db).decide('raaga',admin,{guardianPersonId:'guardian1',studentId:'student1',decision:'approved',expectedVersion:1,relationshipVerified:true,evidenceReference:'verification123'}),/Only pending requests/);
 assert.equal(f.cmds.some(x=>x.constructor.name==='TransactWriteCommand'),false);
});
