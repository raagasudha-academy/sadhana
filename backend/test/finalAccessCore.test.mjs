import test from 'node:test';
import assert from 'node:assert/strict';
import {matchingCognitoPerson,authorisedStudent,projectLearnerDashboard,buildReadinessReport} from '../src/finalAccessCore.mjs';
const student={personId:'per_student',personTypes:['student'],status:'active',institutionIds:['raaga'],displayName:'Example Student',studentProfile:{rollNumbers:{raaga:'001-001'}}};
const guardian={personId:'per_parent',personTypes:['guardian'],status:'active',institutionIds:['raaga'],cognitoSub:'verified-sub'};
const link={linkId:'link_1',guardianPersonId:'per_parent',studentId:'per_student',accessStatus:'approved',relationshipVerified:true,institutionId:'raaga'};
test('subject must resolve to exact active academy person',()=>{
 assert.equal(matchingCognitoPerson([guardian],'verified-sub','raaga').personId,'per_parent');
 assert.equal(matchingCognitoPerson([guardian],'unknown','raaga'),null);
 assert.equal(matchingCognitoPerson([guardian],'verified-sub','sruti'),null);
 assert.throws(()=>matchingCognitoPerson([guardian,guardian],'verified-sub','raaga'),/Ambiguous/);
});
test('pending, revoked and unverified links fail closed',()=>{
 assert.equal(authorisedStudent(guardian,student,[link],'raaga').kind,'guardian');
 for(const change of [{accessStatus:'pending'},{accessStatus:'revoked'},{relationshipVerified:false},{institutionId:'sruti'}])assert.throws(()=>authorisedStudent(guardian,student,[{...link,...change}],'raaga'),/verified guardian/);
 assert.throws(()=>authorisedStudent(guardian,student,[],'raaga'),/verified guardian/);
});
test('self access requires same active person with student role',()=>{
 assert.equal(authorisedStudent(student,student,[],'raaga').kind,'self');
 assert.throws(()=>authorisedStudent({...guardian,personId:'per_student'},student,[],'raaga'),/verified guardian/);
});
test('dashboard includes enrolled class only and hides unrelated sessions',()=>{
 const enrollments=[{studentId:student.personId,classId:'class1',status:'active',startDate:'2026-01-01',institutionId:'raaga'}];
 const classes=[{classId:'class1',name:'Class',institutionId:'raaga'}];
 const sessions=[{sessionId:'session1',classId:'class1',recordType:'class-session',date:'2026-11-05',startTime:'10:00'}, {sessionId:'other',classId:'other-class',recordType:'class-session',date:'2026-11-05'}];
 const r=projectLearnerDashboard(student,enrollments,classes,sessions,[],[],[],'2026-11-03');
 assert.equal(r.calendarSessions.length,1);assert.equal(r.nextSessions.length,1);assert.equal(r.student.rollNumber,'001-001');
});
test('cutover must fail closed when live integrations are not evidenced',()=>{
 const types=['institutions','people','families','family-links','classes','venues','enrolments','sessions','attendance','practice','homework','submissions','events','rsvps','registrations','notifications','audit','counters'];
 const names=types.map(x=>'sadhana-dev-m9-'+x);
 const result=buildReadinessReport({counts:{classes:22,sessions:423,events:6,venues:3,people:7,institutions:2},requiredTables:names,actualTables:names,checks:{cognitoInvitations:false,learnerWriteParity:false}});
 assert.equal(result.fullCutoverReady,false);assert.deepEqual(result.blockers,['UNVERIFIED_COGNITOINVITATIONS','UNVERIFIED_LEARNERWRITEPARITY']);
});
