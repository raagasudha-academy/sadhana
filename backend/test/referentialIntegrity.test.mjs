import test from 'node:test';
import assert from 'node:assert/strict';
import {validateM9References} from '../scripts/referentialIntegrity.mjs';
const at=(suffix,item)=>({tableName:`sadhana-dev-${suffix}`,item});
const fixture=()=>[
 at('people',{personId:'T1',cognitoSub:'sub-1'}),
 at('venues',{venueId:'V1'}),
 at('classes',{classId:'C1',institutionId:'raaga',teacherPersonIds:['T1'],defaultVenueId:'V1'}),
 at('sessions',{sessionId:'S1',institutionId:'raaga',classId:'C1',recordType:'class-session',venueId:'V1',timeResolution:'converted'}),
 at('sessions',{sessionId:'SC1',institutionId:'raaga',classId:'C1',recordType:'series-change',effectiveFrom:'2026-01-01'}),
 at('sessions',{sessionId:'H1',institutionId:'shared',recordType:'holiday',allDay:true,timeResolution:'all-day'}),
 at('events',{eventId:'E1',institutionId:'raaga',venueId:'V1',timeResolution:'converted'}),
 at('audit',{auditId:'A1',institutionId:'raaga',studentId:'STUDENT-DELETED'})
];
test('valid transformed references accept historic audit references and holidays without class',()=>{
 const r=validateM9References(fixture());assert.equal(r.blockerCount,0);assert.equal(r.warningCodes.INSTITUTIONS_NOT_SEEDED,1);assert.equal(r.readyForIntegrationReview,true);
});
test('missing class reference is a blocker',()=>{
 const f=fixture();f[3].item.classId='absent';const r=validateM9References(f);assert.equal(r.blockerCodes.MISSING_CLASSES,1);
});
test('class and session institution mismatch blocks',()=>{
 const f=fixture();f[3].item.institutionId='sruti';const r=validateM9References(f);assert.equal(r.blockerCodes.CROSS_INSTITUTION_CLASS,1);
});
test('unknown venue is a blocker',()=>{
 const f=fixture();f[2].item.defaultVenueId='V404';const r=validateM9References(f);assert.equal(r.blockerCodes.MISSING_VENUES,1);
});
test('missing teacher is a blocker',()=>{
 const f=fixture();f[2].item.teacherPersonIds=['T404'];const r=validateM9References(f);assert.equal(r.blockerCodes.MISSING_PEOPLE,1);
});
test('duplicate teacher Cognito identity blocks',()=>{
 const f=fixture();f.push(at('people',{personId:'T2',cognitoSub:'sub-1'}));const r=validateM9References(f);assert.equal(r.blockerCodes.DUPLICATE_COGNITO_SUB,1);
});
test('duplicate destination key blocks',()=>{
 const f=fixture();f.push(at('venues',{venueId:'V1'}));const r=validateM9References(f);assert.equal(r.blockerCodes.DUPLICATE_PK,1);
});
test('invalid session time blocks',()=>{
 const f=fixture();f[3].item.timeResolution='ambiguous';const r=validateM9References(f);assert.equal(r.blockerCodes.UNRESOLVED_SESSION_TIME,1);
});
test('require institution rows is an explicit stronger pre-cutover mode',()=>{
 const r=validateM9References(fixture(),{requireInstitutionRows:true});assert.equal(r.blockerCodes.MISSING_INSTITUTIONS>0,true);
});
