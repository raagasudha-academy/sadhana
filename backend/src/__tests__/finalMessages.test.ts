import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {GetCommand,QueryCommand,ScanCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {makeFinalMessages} from '../finalMessages.ts';

const envKeys=['SADHANA_ENTITY_STAGE','SADHANA_ENTITY_TABLE_SET','SADHANA_DATA_MODE','SADHANA_ENTITY_FINAL_ACK'] as const;
let previous:string[];
before(()=>{previous=envKeys.map(key=>process.env[key]??'\0');process.env.SADHANA_ENTITY_STAGE='test';process.env.SADHANA_ENTITY_TABLE_SET='m9';delete process.env.SADHANA_DATA_MODE;delete process.env.SADHANA_ENTITY_FINAL_ACK;});
after(()=>envKeys.forEach((key,index)=>previous[index]==='\0'?delete process.env[key]:process.env[key]=previous[index]));

const teacher={personId:'PERSON-TEACHER',cognitoSub:'11111111-1111-4111-8111-111111111111',teacherId:'TEACHER-REGISTRY-1',staffProfile:{teacherId:'TEACHER-REGISTRY-1'},firstName:'Tara',lastName:'Teacher',personTypes:['teacher'],institutionIds:['sruti'],status:'active'};
const student={personId:'PERSON-STUDENT',cognitoSub:'22222222-2222-4222-8222-222222222222',firstName:'Sam',lastName:'Student',familyId:'FAMILY-1',studentProfile:{rollNumbers:{sruti:'SV-001'}},personTypes:['student'],institutionIds:['sruti'],status:'active'};
const unassignedStudent={personId:'PERSON-STUDENT-UNASSIGNED',cognitoSub:'unassigned-sub',firstName:'Uma',lastName:'Unassigned',personTypes:['student'],institutionIds:['sruti'],status:'active'};
const unlinkedStudent={personId:'PERSON-STUDENT-PENDING',firstName:'Pia',lastName:'Pending',personTypes:['student'],institutionIds:['sruti'],status:'active'};
const guardian={personId:'PERSON-GUARDIAN',cognitoSub:'guardian-sub',firstName:'Gita',lastName:'Guardian',familyId:'FAMILY-1',personTypes:['guardian'],institutionIds:['raaga'],status:'active'};
const guardianLink={linkId:'LINK-GUARDIAN-STUDENT-SRUTI',familyId:'FAMILY-1',institutionId:'sruti',guardianPersonId:guardian.personId,studentId:student.personId,accessStatus:'approved',relationshipVerified:true};
const adminId=`ADMIN-${createHash('sha256').update('admin-sub').digest('hex')}`;
// Calendar/class records use the teacher registry ID; messaging identities use personId.
const cls={classId:'CLASS-SRUTI',institutionId:'sruti',name:'Carnatic music',status:'active',teacherPersonIds:[teacher.teacherId]};
const enrolment={enrolmentId:'ENROLMENT-1',institutionId:'sruti',studentId:student.personId,classId:cls.classId,status:'active'};
const unlinkedEnrolment={enrolmentId:'ENROLMENT-PENDING',institutionId:'sruti',studentId:unlinkedStudent.personId,classId:cls.classId,status:'active'};
function fixture(admins:{sub:string;displayName:string;photoUrl?:string}[]=[],photoForSub:((sub:string)=>Promise<string>)=async()=> '',includeUnlinked=false){
 const calls:any[]=[];const notificationRows:any[]=[];
 const db={send:async(command:any)=>{
  calls.push(command);const input=command.input;
   if(command instanceof QueryCommand){
   if(input.IndexName==='CognitoIdentityIndex'){const p=input.ExpressionAttributeValues[':value']==='11111111-1111-4111-8111-111111111111'?teacher:input.ExpressionAttributeValues[':value']==='22222222-2222-4222-8222-222222222222'?student:input.ExpressionAttributeValues[':value']==='unassigned-sub'?unassignedStudent:input.ExpressionAttributeValues[':value']==='guardian-sub'?guardian:null;return {Items:p?[p]:[]};}
   if(input.IndexName==='InstitutionClassesIndex')return {Items:[cls]};
   if(input.IndexName==='PersonTypeIndex')return {Items:input.ExpressionAttributeValues[':value']==='teacher'?[teacher]:input.ExpressionAttributeValues[':value']==='student'?[student,unassignedStudent]:[]};
   if(input.IndexName==='ClassEnrolmentsIndex')return {Items:includeUnlinked?[enrolment,unlinkedEnrolment]:[enrolment]};
   if(input.IndexName==='StudentEnrolmentsIndex')return {Items:input.ExpressionAttributeValues[':value']===unlinkedStudent.personId?[unlinkedEnrolment]:[enrolment]};
   if(input.IndexName==='StudentGuardiansIndex')return {Items:[]};
   if(input.IndexName==='GuardianAccessIndex')return {Items:input.ExpressionAttributeValues[':value']===guardian.personId?[guardianLink]:[]};
   if(input.IndexName==='RecipientNotificationsIndex')return {Items:notificationRows.filter(row=>row.recipientPersonId===input.ExpressionAttributeValues[':value'])};
  }
  if(command instanceof ScanCommand)return {Items:[teacher,student,unassignedStudent,unlinkedStudent,guardian]};
  if(command instanceof GetCommand){const key=input.Key;if(input.TableName.endsWith('-people'))return {Item:key.personId===teacher.personId?teacher:key.personId===student.personId?student:key.personId===unassignedStudent.personId?unassignedStudent:key.personId===unlinkedStudent.personId?unlinkedStudent:key.personId===guardian.personId?guardian:undefined};if(input.TableName.endsWith('-family-links'))return {Item:key.linkId===guardianLink.linkId?guardianLink:undefined};if(input.TableName.endsWith('-classes'))return {Item:key.classId===cls.classId?cls:undefined};if(input.TableName.endsWith('-enrolments'))return {Item:key.enrolmentId===unlinkedEnrolment.enrolmentId?unlinkedEnrolment:key.enrolmentId===enrolment.enrolmentId?enrolment:undefined};}
  if(command instanceof TransactWriteCommand){const actions=input.TransactItems;for(const action of actions){if(action.Put?.TableName.endsWith('-notifications'))notificationRows.push(action.Put.Item);}return {};}
  throw new Error(`Unexpected command ${command.constructor.name}`);
 }};
 return {service:makeFinalMessages(db,async()=>admins,photoForSub),calls,notificationRows};
}

test('teacher contact list includes only students enrolled in the teacher’s assigned class',async()=>{
 const {service}=fixture();
 const result=await service.contacts('sruti',{sub:'11111111-1111-4111-8111-111111111111'});
 assert.deepEqual(result.records.map(row=>[row.peerId,row.peerName,row.peerRole,row.classId]),[[student.personId,'Sam Student','student',cls.classId]]);
 await assert.rejects(service.contacts('raaga',{sub:'11111111-1111-4111-8111-111111111111'}),{status:403});
});

test('teacher contacts and can queue messages to an active enrolled student without a linked login',async()=>{
 const {service}=fixture([],async()=>'',true);
 const contacts=await service.contacts('sruti',{sub:'11111111-1111-4111-8111-111111111111'});
 assert.ok(contacts.records.some(row=>row.peerId===unlinkedStudent.personId&&row.peerRole==='student'));
 const sent=await service.send('sruti',{sub:'11111111-1111-4111-8111-111111111111'},unlinkedStudent.personId,cls.classId,undefined,{text:'Welcome to the class'});
 assert.ok(sent.record.threadId);
});

test('student contact list resolves the assigned teacher registry ID to the verified teacher account',async()=>{
 const {service}=fixture();
 const result=await service.contacts('sruti',{sub:'22222222-2222-4222-8222-222222222222'});
 assert.ok(result.records.some(row=>row.peerId===teacher.personId&&row.peerRole==='teacher'&&row.classId===cls.classId));
 const sent=await service.send('sruti',{sub:'22222222-2222-4222-8222-222222222222'},teacher.personId,cls.classId,undefined,{text:'Hello teacher'});
 assert.ok(sent.record.threadId);
});

test('contact and recent-thread records include only the authorized person photo URL',async()=>{
 const {service}=fixture([{sub:'admin-sub',displayName:'Academy Admin',photoUrl:'https://photos.example/admin'}],async sub=>sub==='11111111-1111-4111-8111-111111111111'?'https://photos.example/teacher':sub==='22222222-2222-4222-8222-222222222222'?'https://photos.example/student':'');
 const studentContacts=await service.contacts('sruti',{sub:'22222222-2222-4222-8222-222222222222'});
 assert.equal(studentContacts.records.find(row=>row.peerRole==='teacher')?.photoUrl,'https://photos.example/teacher');
 assert.equal(studentContacts.records.find(row=>row.peerRole==='admin')?.photoUrl,'https://photos.example/admin');
 await service.send('sruti',{sub:'22222222-2222-4222-8222-222222222222'},teacher.personId,cls.classId,undefined,{text:'Photo thread'});
 const recent=await service.threads('sruti',{sub:'11111111-1111-4111-8111-111111111111'});
 assert.equal(recent.records[0].photoUrl,'https://photos.example/student');
});

test('guardian accounts cannot start student or teacher chats on a linked child’s behalf',async()=>{
 const {service,calls}=fixture();
 await assert.rejects(service.contacts('sruti',{sub:'guardian-sub'}),{status:403});
 await assert.rejects(service.send('sruti',{sub:'guardian-sub'},student.personId,cls.classId,undefined,{text:'Hello'}),{status:403});
 assert.equal(calls.some(command=>command instanceof TransactWriteCommand),false);
});

test('guardian View As uses the selected child identity through an approved link in that academy',async()=>{
 const {service,calls,notificationRows}=fixture([{sub:'admin-sub',displayName:'Academy Admin'}]);
 const actorSub='guardian-sub',actingStudentId=student.personId;
 const contacts=await service.contacts('sruti',{sub:actorSub},[],actingStudentId);
 assert.deepEqual(contacts.records.map(row=>row.peerRole).sort(),['admin','teacher']);
 const sent=await service.send('sruti',{sub:actorSub},teacher.personId,cls.classId,undefined,{text:'Message from student view'},[],actingStudentId);
 assert.equal(sent.record.senderId,student.personId);
 assert.equal(notificationRows.find(row=>row.recipientPersonId===teacher.personId)?.senderPersonId,student.personId);
 const audit=calls.find(command=>command instanceof TransactWriteCommand).input.TransactItems.find((action:any)=>action.Put?.TableName.endsWith('-audit')).Put.Item;
 assert.equal(audit.actorPersonId,guardian.personId);assert.equal(audit.representedStudentId,student.personId);
 await assert.rejects(service.contacts('raaga',{sub:actorSub},[],actingStudentId),{status:403});
});

test('teacher and student can send within an assigned class and both inbox copies are private',async()=>{
 const {service,calls,notificationRows}=fixture();
 const sent=await service.send('sruti',{sub:'11111111-1111-4111-8111-111111111111'},student.personId,cls.classId,undefined,{text:'  Practice lesson 2  '});
 assert.equal(sent.record.text,'Practice lesson 2');
 assert.equal(notificationRows.length,2);
 const own=notificationRows.find(row=>row.recipientPersonId===teacher.personId);
 const theirs=notificationRows.find(row=>row.recipientPersonId===student.personId);
 assert.equal(own.read,true);assert.equal(theirs.read,false);
 assert.equal(own.threadId,theirs.threadId);assert.equal(own.messageText,'Practice lesson 2');
 const write=calls.find(command=>command instanceof TransactWriteCommand).input.TransactItems;
 assert.equal(write.length,7);
 assert.ok(write.some(action=>action.Put?.TableName.endsWith('-audit')&&action.Put.Item.action==='directMessageSent'));
 assert.equal(JSON.stringify(write.find(action=>action.Put?.TableName.endsWith('-audit')).Put.Item).includes('Practice lesson 2'),false);
 const studentContacts=await service.contacts('sruti',{sub:'22222222-2222-4222-8222-222222222222'});
 assert.equal(studentContacts.records[0].peerId,teacher.personId);
});

test('cannot send across academy or into a class without a current enrollment',async()=>{
 const {service,calls}=fixture();
 await assert.rejects(service.send('raaga',{sub:'11111111-1111-4111-8111-111111111111'},student.personId,cls.classId,undefined,{text:'Hello'}),{status:403});
 await assert.rejects(service.send('sruti',{sub:'11111111-1111-4111-8111-111111111111'},student.personId,'CLASS-OTHER',undefined,{text:'Hello'}),{status:404});
 assert.equal(calls.some(command=>command instanceof TransactWriteCommand),false);
});

test('academy administrators can message institution members, and members can reply inside that conversation',async()=>{
 const {service,notificationRows}=fixture([{sub:'admin-sub',displayName:'Academy Admin'}]);
 const adminInstitutions=['sruti'] as any;
 const directory=await service.contacts('sruti',{sub:'admin-sub'},adminInstitutions);
 assert.deepEqual(directory.records.map(row=>row.peerId).sort(),[student.personId,teacher.personId,unassignedStudent.personId,unlinkedStudent.personId].sort());
 const started=await service.send('sruti',{sub:'admin-sub'},unassignedStudent.personId,'ACADEMY-SRUTI',undefined,{text:'Hello from the academy'},adminInstitutions);
 assert.equal(started.record.senderId,adminId);
 assert.equal(notificationRows.find(row=>row.recipientPersonId===unassignedStudent.personId)?.adminActor,true);
 const conversation=await service.thread('sruti',{sub:'unassigned-sub'},adminId,'ACADEMY-SRUTI',started.record.threadId);
 assert.equal(conversation.records[0].text,'Hello from the academy');
 await service.send('sruti',{sub:'unassigned-sub'},adminId,'ACADEMY-SRUTI',started.record.threadId,{text:'Thanks'},[]);
 const replies=notificationRows.filter(row=>row.threadId===started.record.threadId);
 assert.equal(replies.length,4);
 assert.equal(replies.some(row=>row.recipientPersonId===adminId&&row.messageText==='Thanks'),true);
 await assert.rejects(service.send('raaga',{sub:'admin-sub'},student.personId,cls.classId,undefined,{text:'Cross academy'},adminInstitutions),{status:403});
});

test('teachers and students can start class-scoped chats with assigned contacts and institution admins',async()=>{
 const {service}=fixture([{sub:'admin-sub',displayName:'Academy Admin'}]);
 const adminContactId=adminId;
 const teacherContacts=await service.contacts('sruti',{sub:'11111111-1111-4111-8111-111111111111'});
 assert.deepEqual(teacherContacts.records.map(row=>row.peerRole).sort(),['admin','student']);
 const teacherAdmin=teacherContacts.records.find(row=>row.peerRole==='admin')!;
 const teacherStarted=await service.send('sruti',{sub:'11111111-1111-4111-8111-111111111111'},adminContactId,'ACADEMY-SRUTI',undefined,{text:'Teacher to admin'});
 const adminInbox=await service.threads('sruti',{sub:'admin-sub'},['sruti'] as any);
 const teacherThread=adminInbox.records.find(row=>row.peerId===teacher.personId)!;
 assert.ok(teacherThread);
 await service.send('sruti',{sub:'admin-sub'},teacher.personId,'ACADEMY-SRUTI',teacherThread.threadId,{text:'Admin reply'},['sruti'] as any);
 const teacherHistory=await service.thread('sruti',{sub:'11111111-1111-4111-8111-111111111111'},adminContactId,'ACADEMY-SRUTI',teacherStarted.record.threadId);
 assert.deepEqual(teacherHistory.records.map(row=>row.text),['Teacher to admin','Admin reply']);

 const studentContacts=await service.contacts('sruti',{sub:'22222222-2222-4222-8222-222222222222'});
 assert.deepEqual(studentContacts.records.map(row=>row.peerRole).sort(),['admin','teacher']);
 const studentAdmin=studentContacts.records.find(row=>row.peerRole==='admin')!;
 const studentStarted=await service.send('sruti',{sub:'22222222-2222-4222-8222-222222222222'},studentAdmin.peerId,'ACADEMY-SRUTI',undefined,{text:'Student to admin'});
 const nextInbox=await service.threads('sruti',{sub:'admin-sub'},['sruti'] as any);
 const studentThread=nextInbox.records.find(row=>row.peerId===student.personId)!;
 assert.ok(studentThread);
 await service.send('sruti',{sub:'admin-sub'},student.personId,'ACADEMY-SRUTI',studentThread.threadId,{text:'Admin reply'},['sruti'] as any);
 const studentHistory=await service.thread('sruti',{sub:'22222222-2222-4222-8222-222222222222'},studentAdmin.peerId,'ACADEMY-SRUTI',studentStarted.record.threadId);
 assert.deepEqual(studentHistory.records.map(row=>row.text),['Student to admin','Admin reply']);
});

test('messages accept up to 200 characters and reject oversized, empty and unsupported payloads before writing',async()=>{
 const {service,calls}=fixture();
 await service.send('sruti',{sub:'11111111-1111-4111-8111-111111111111'},student.personId,cls.classId,undefined,{text:'x'.repeat(200)});
 const transactionCount=calls.filter(command=>command instanceof TransactWriteCommand).length;
 for(const text of ['', ' '.repeat(2), 'x'.repeat(201)])await assert.rejects(service.send('sruti',{sub:'11111111-1111-4111-8111-111111111111'},student.personId,cls.classId,undefined,{text}),{status:400});
 assert.equal(calls.filter(command=>command instanceof TransactWriteCommand).length,transactionCount);
});
