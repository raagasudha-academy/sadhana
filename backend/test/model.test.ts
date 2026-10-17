import test from 'node:test';
import assert from 'node:assert/strict';
import { permittedInstitutions, demandInstitution, validate, keyFor, directoryFor, isoDate, publicRecord } from '../src/model.ts';

const both={'sub':'staff-id','cognito:groups':'[raagasudha-admin, sruti-admin]'};
const srutiOnly={'sub':'giridhar-id','cognito:groups':['sruti-admin']};

test('roles are taken from verified authorizer claims, not UI persona',()=>{
  assert.deepEqual(permittedInstitutions(both),['raaga','sruti']);
  assert.deepEqual(permittedInstitutions(srutiOnly),['sruti']);
  assert.deepEqual(permittedInstitutions({'cognito:groups':'[unrelated-user]'}),[]);
  assert.throws(()=>demandInstitution(srutiOnly,'raaga'),{status:403});
  assert.equal(demandInstitution(srutiOnly,'sruti'),'sruti');
});
test('invalid dates and malformed ranges are refused',()=>{
  assert.equal(isoDate('2026-02-30'),false);
  assert.equal(isoDate('2026-10-15'),true);
  assert.throws(()=>validate('enrolments',{institution:'raaga',classId:'c',studentId:'s',startDate:'2026-12-01',endDate:'2026-11-30'}),{status:400});
});
test('student cannot be registered independently without adult confirmation',()=>{
  assert.throws(()=>validate('students',{name:'Ananya',phone:'+447700900456',familyId:'',createdIn:'raaga',registrationType:'independent',adultConfirmed:false}),{status:400});
  const adult=validate('students',{name:'Adult Learner',phone:'+447700900456',familyId:'',createdIn:'raaga',registrationType:'independent',adultConfirmed:true});
  assert.equal(adult.name,'Adult Learner');
});
test('class structure requires legal time, dates and venue for in-person lessons',()=>{
  const valid={institution:'raaga',name:'Carnatic Beginners',teacher:'Staff',teacherUserId:'',day:6,time:'10:00',duration:60,mode:'In Person',venueId:'V-1',startDate:'2026-10-15',endDate:''};
  assert.equal(validate('classes',valid).duration,60);
  assert.throws(()=>validate('classes',{...valid,venueId:''}),{status:400});
  assert.throws(()=>validate('classes',{...valid,time:'25:00'}),{status:400});
});
test('practice record has a unique student+institution+UK calendar day key',()=>{
  const key=keyFor('practice',{institution:'sruti',studentId:'STU-1',date:'2026-10-15'});
  assert.deepEqual(key,{PK:'PRACTICE#sruti#STU-1',SK:'DATE#2026-10-15'});
  const d=validate('practice',{institution:'sruti',studentId:'STU-1',date:'2026-10-15',didPractice:true,minutes:20,comments:'',reason:'Parent requested late entry'});
  assert.equal(d.minutes,20);
  assert.throws(()=>validate('practice',{...d,reason:''}),{status:400});
  assert.throws(()=>validate('practice',{...d,minutes:0}),{status:400});
});
test('keyed class and practice query indexes contain institution boundary',()=>{
  assert.equal(directoryFor('classes',{id:'class-a',institution:'raaga',name:'A'}).GSI1PK,'INST#raaga#CLASS');
  assert.equal(directoryFor('classes',{id:'class-b',institution:'sruti',name:'B'}).GSI1PK,'INST#sruti#CLASS');
  assert.equal(directoryFor('practice',{institution:'raaga',studentId:'STU-1',date:'2026-10-15'}).GSI1PK,'INST#raaga#PRACTICE');
});
test('DynamoDB primary and index keys are stripped from API responses',()=>{
  assert.deepEqual(publicRecord({PK:'secret',SK:'META',GSI1PK:'x',GSI1SK:'y',entityType:'STUDENT',name:'Demo'}),{name:'Demo'});
});

test('read-only Sruti viewer sees Sruti only and has no write permissions', async()=>{
  const {viewableInstitutions,demandViewInstitution,demandAnyAdmin}=await import('../src/model.ts');
  const amrutha={sub:'amrutha-id','cognito:groups':['sruti-viewer']};
  assert.deepEqual(viewableInstitutions(amrutha),['sruti']);
  assert.deepEqual(permittedInstitutions(amrutha),[]);
  assert.equal(demandViewInstitution(amrutha,'sruti'),'sruti');
  assert.throws(()=>demandViewInstitution(amrutha,'raaga'),{status:403});
  assert.throws(()=>demandInstitution(amrutha,'sruti'),{status:403});
  assert.throws(()=>demandAnyAdmin(amrutha),{status:403});
});

test('academy administrators see their own institutions but do not gain each other’s write rights', async()=>{
  const {viewableInstitutions}=await import('../src/model.ts');
  const giridhar={sub:'g','cognito:groups':['sruti-admin']};
  const praveena={sub:'p','cognito:groups':['raagasudha-admin']};
  assert.deepEqual(viewableInstitutions(giridhar),['sruti']);
  assert.deepEqual(viewableInstitutions(praveena),['raaga']);
  assert.throws(()=>demandInstitution(giridhar,'raaga'),{status:403});
  assert.throws(()=>demandInstitution(praveena,'sruti'),{status:403});
});
