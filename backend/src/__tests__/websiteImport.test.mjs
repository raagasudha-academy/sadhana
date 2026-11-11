import test from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assertWebsiteContactGuardAvailable,contactGuardOwnerInstitution,prepareWebsiteImport,markerId,guardianLinkId} from '../websiteImportCore.mjs';
const base=()=>({registrationId:'RS-TEST-123',reviewStatus:'approved',registrationType:'children',primaryContactPersonId:'PARENT-1',people:[{personId:'PARENT-1',fullName:'Meera Sharma',email:'meera@example.org',phone:'+447000000001',roles:['guardian'],address:{town:'Newcastle'}},{personId:'CHILD-1',fullName:'Ananya Sharma',dateOfBirth:'2015-06-12',roles:['student']},{personId:'CHILD-2',fullName:'Aarav Sharma',dateOfBirth:'2017-07-12',roles:['student']}],students:[{personId:'CHILD-1',studentType:'child',foodAllergies:{status:'yes',allergens:['Peanuts']},contactPreferences:{emailSource:'guardian',phoneSource:'guardian',addressSource:'guardian',guardianPersonId:'PARENT-1'}},{personId:'CHILD-2',studentType:'child',foodAllergies:{status:'none',allergens:[]}}]});
test('two children receive stable ids, distinct roll numbers and inherited contact',()=>{const p=prepareWebsiteImport(base(),'raaga','admin-sub',{family:0,student:0});assert.equal(p.studentMappings.length,2);assert.equal(p.verifiedGuardianLinks,2);const people=p.items.filter(x=>x.table==='people').map(x=>x.item);assert.equal(people.length,3);const first=people.find(x=>x.personId===p.studentMappings[0].studentId);assert.equal(first.email,'meera@example.org');assert.equal(first.studentProfile.foodAllergies.allergens[0],'Peanuts');assert.equal(first.address.town,'Newcastle');assert.notEqual(p.studentMappings[0].rollNumber,p.studentMappings[1].rollNumber);});
test('approved web registration verifies its submitted parent-child links with audit evidence',()=>{const p=prepareWebsiteImport(base(),'raaga','admin-sub',{family:4,student:12});const links=p.items.filter(x=>x.table==='family-links').map(x=>x.item);assert.equal(links.length,2);assert(links.every(x=>x.accessStatus==='approved'&&x.relationshipVerified===true&&x.verificationSource==='approved-website-registration'&&x.evidenceReference==='website-registration:RS-TEST-123'&&x.reviewedBy==='admin-sub'));const reg=p.items.find(x=>x.table==='registrations').item;assert.equal(reg.identityResolutionStatus,'registration_relationships_verified');const audit=p.items.find(x=>x.table==='audit').item;assert.equal(audit.metadata.verifiedGuardianLinks,2);});
test('same input produces stable identifiers and unique source guard',()=>{const a=prepareWebsiteImport(base(),'raaga','admin',{family:0,student:0}),b=prepareWebsiteImport(base(),'raaga','admin',{family:0,student:0});assert.equal(a.familyId,b.familyId);assert.deepEqual(a.studentMappings,b.studentMappings);assert.equal(markerId('raaga','RS-TEST-123'),a.registrationId);assert.equal(guardianLinkId('raaga','g','s'),guardianLinkId('raaga','g','s'));});
test('unapproved applications refuse all records',()=>{const r=base();r.reviewStatus='pending';assert.throws(()=>prepareWebsiteImport(r,'raaga','admin',{family:0,student:0}),/approved/);});
test('duplicate student and duplicate identity blocked',()=>{const r=base();r.students[1].personId='CHILD-1';assert.throws(()=>prepareWebsiteImport(r,'raaga','admin',{family:0,student:0}),/duplicated/);});
test('allergy status is required',()=>{const r=base();delete r.students[0].foodAllergies;assert.throws(()=>prepareWebsiteImport(r,'raaga','admin',{family:0,student:0}),/allergy/);});
test('no unsupported Sruti website source can be imported',()=>{assert.throws(()=>prepareWebsiteImport(base(),'sruti','admin',{family:0,student:0}),/Sruti/);});
test('counter values and maximum student count fail closed',()=>{assert.throws(()=>prepareWebsiteImport(base(),'raaga','admin',{family:-1,student:0}),/Counter/);const r=base();r.students=Array.from({length:21},()=>r.students[0]);assert.throws(()=>prepareWebsiteImport(r,'raaga','admin',{family:0,student:0}),/size/);});

test('different registrations may contain learners with identical names and birth dates',()=>{
 const first=base(),second=base();
 second.registrationId='RS-TEST-OTHER';second.people[0].email='other@example.org';
 const a=prepareWebsiteImport(first,'raaga','admin',{family:0,student:0});
 const b=prepareWebsiteImport(second,'raaga','admin',{family:1,student:2});
 const guards=p=>p.items.filter(x=>x.item.sequenceType==='IDENTITY_GUARD').map(x=>x.item.counterId);
 assert.equal(guards(a).some(id=>guards(b).includes(id)),false);
 assert.notEqual(a.contactGuardId,b.contactGuardId);
 second.people[0].email=first.people[0].email.toUpperCase();
 assert.equal(prepareWebsiteImport(second,'raaga','admin',{family:1,student:2}).contactGuardId,a.contactGuardId);
});
test('distinct source learners with the same name and birth date remain distinct',()=>{
 const r=base();r.people[2].fullName=r.people[1].fullName;r.people[2].dateOfBirth=r.people[1].dateOfBirth;
 const plan=prepareWebsiteImport(r,'raaga','admin',{family:0,student:0});
 assert.equal(new Set(plan.studentMappings.map(s=>s.studentId)).size,2);
});

test('same verified parent email is available for a separate academy family',()=>{
 const registration=base();
 const raagaPlan=prepareWebsiteImport(registration,'raaga','admin',{family:1,student:2});
 const srutiLegacyGuard=`CONTACT#sruti#${createHash('sha256').update(JSON.stringify(['meera@example.org'])).digest('hex')}`;
 assert.notEqual(raagaPlan.contactGuardId,srutiLegacyGuard);
 assert.doesNotThrow(()=>assertWebsiteContactGuardAvailable('raaga',raagaPlan.contactGuardId,[
  {counterId:srutiLegacyGuard,item:{familyId:'FAMILY-SRUTI-1'},ownerInstitution:'sruti'},
  {counterId:'CONTACT#legacy-global',item:{institutionId:'sruti'},ownerInstitution:'sruti'},
 ]));
});

test('parent contact duplicate remains blocked within the same academy and for an ambiguous owner',()=>{
 assert.throws(()=>assertWebsiteContactGuardAvailable('raaga','CONTACT#raaga#same-email',[
  {counterId:'CONTACT#raaga#same-email',item:{institutionId:'raaga'},ownerInstitution:'raaga'},
 ]),/in this institution/);
 assert.throws(()=>assertWebsiteContactGuardAvailable('raaga','CONTACT#raaga#new-family-guard',[
  {counterId:'CONTACT#legacy-global',item:{familyId:'FAMILY-UNKNOWN'},ownerInstitution:undefined},
 ]),/manual institution review/);
});

test('contact guard owner comes from its referenced family, not a stale institution label',()=>{
 const guard={counterId:'CONTACT#legacy',institutionId:'raaga',familyId:'FAMILY-SRUTI-1'};
 const family={familyId:'FAMILY-SRUTI-1',institutionIds:['sruti']};
 const ownerInstitution=contactGuardOwnerInstitution(guard,family);
 assert.equal(ownerInstitution,'sruti');
 assert.doesNotThrow(()=>assertWebsiteContactGuardAvailable('raaga','CONTACT#raaga#new-email',[
  {counterId:guard.counterId,item:guard,ownerInstitution},
 ]));
 assert.equal(contactGuardOwnerInstitution(guard,undefined),undefined,'missing referenced family must fail closed');
 assert.equal(contactGuardOwnerInstitution(guard,{...family,institutionIds:['raaga','sruti']}),undefined,'ambiguous multi-academy family needs review');
});
