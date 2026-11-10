/** Pure, side-effect-free website-import planner. No AWS or Cognito calls. */
import {createHash} from 'node:crypto';
import {academyRoll} from './academyRoll.mjs';
const fail=(message)=>{throw Object.assign(new Error(message),{status:409});};
const obj=(x)=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
const string=(x)=>typeof x==='string'?x.trim():'';
const hash=(...parts)=>createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const nameParts=(value)=>{const s=string(value).replace(/\s+/g,' ');const parts=s.split(' ');return {firstName:parts[0],lastName:parts.slice(1).join(' '),displayName:s};};
const identity=(person)=>hash(nameParts(person.fullName).displayName.normalize('NFKC').toLocaleLowerCase('en-GB'),person.dateOfBirth);
export const markerId=(inst,registrationId)=>`web_${hash(inst,registrationId)}`;
export const guardianLinkId=(inst,guardianId,studentId)=>'link_'+hash(inst,guardianId,studentId);
export function prepareWebsiteImport(registration, institution, actorSub, counters, now='2026-11-03T00:00:00.000Z'){
 const r=obj(registration);const id=string(r.registrationId);
 if(institution!=='raaga'&&institution!=='sruti')fail('Unsupported institution.');
 if(!id||!/^[A-Za-z0-9_-]{1,120}$/.test(id)||r.reviewStatus!=='approved')fail('Website registration must be administrator-approved.');
 if(r.sadhanaImport?.status==='imported')fail('Website reports a prior import; investigate identity mapping.');
 if(institution==='raaga'&&!['raaga',undefined].includes(r.institution))fail('Registration institution mismatch.');
 if(institution==='sruti'&&r.institution!=='sruti')fail('Sruti requires a verified Sruti intake source.');
 if(!actorSub||typeof actorSub!=='string')fail('Verified administrator required.');
 const people=Array.isArray(r.people)?r.people:[],students=Array.isArray(r.students)?r.students:[];
 if(students.length<1||students.length>20||people.length<1||people.length>25)fail('Unsupported registration size.');
 const personMap=new Map();
 for(const p of people){if(!string(p?.personId)||personMap.has(p.personId))fail('Invalid or duplicate source person ID.');personMap.set(p.personId,p);}
 const primary=personMap.get(r.primaryContactPersonId);
 if(!primary||!string(primary.fullName)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(string(primary.email))||!/^\+[1-9]\d{7,14}$/.test(string(primary.phone)))fail('Primary contact is incomplete.');
 if(!Number.isSafeInteger(counters?.family)||counters.family<0||!Number.isSafeInteger(counters?.student)||counters.student<0)fail('Counter values not verified.');
 const familyId=`fam_${hash(institution,id)}`,guardianId=`per_${hash(institution,id,'person',primary.personId)}`;
 const contactGuardId=`CONTACT#${institution}#${hash(string(primary.email).toLowerCase())}`;
 const familyNumber=String(counters.family+1).padStart(3,'0');
 const seen=new Set(),seenIdentity=new Set(),records=[],guards=[],links=[];
 const peopleItems=[{personId:guardianId,...nameParts(primary.fullName),personTypes:Array.isArray(primary.roles)&&primary.roles.includes('student')?['guardian','student']:['guardian'],email:string(primary.email).toLowerCase(),phone:string(primary.phone),institutionIds:[institution],familyId,status:'active',createdAt:now,updatedAt:now,version:1,sourceWebsiteRegistrationId:id}];
 for(const [i,s] of students.entries()){
   const sourceId=string(s?.personId),p=personMap.get(sourceId);
   if(!sourceId||seen.has(sourceId)||!p||!string(p.fullName)||!/^\d{4}-\d\d-\d\d$/.test(string(p.dateOfBirth)))fail('Invalid or duplicated student.');
   seen.add(sourceId);
   const allergies=obj(s.foodAllergies);
   if(!['yes','none','no','unknown'].includes(allergies.status))fail('Student allergy response required.');
   const identityHash=identity(p);
   if(seenIdentity.has(identityHash))fail('Repeated student identity.');seenIdentity.add(identityHash);
   const studentId=sourceId===primary.personId?guardianId:`per_${hash(institution,id,'person',sourceId)}`;
   const contact=obj(s.contactPreferences);
   for(const type of ['email','phone','address'])if(contact[`${type}Source`]==='guardian'&&contact.guardianPersonId&&contact.guardianPersonId!==primary.personId)fail('Additional guardian inheritance requires identity review.');
   const use=(type)=>contact[`${type}Source`]==='guardian';
   const address=use('address')?obj(primary.address):obj(p.address);
   const adult=s.studentType==='adult'||sourceId===primary.personId;
   const email=use('email')?string(primary.email):string(p.email);
   const phone=use('phone')?string(primary.phone):string(p.phone);
   if(adult&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^\+[1-9]\d{7,14}$/.test(phone)))fail('Adult learner needs valid contact details.');
   const number=String(counters.student+i+1).padStart(3,'0');
   const person={personId:studentId,...nameParts(p.fullName),personTypes:sourceId===primary.personId?['guardian','student']:['student'],institutionIds:[institution],familyId,email:email.toLowerCase(),phone,address,status:'active',studentProfile:{dateOfBirth:p.dateOfBirth,foodAllergies:allergies,...(institution==='sruti'&&s.srutiLearning?{srutiLearning:s.srutiLearning}:{}),rollNumber:academyRoll(institution,counters.student+i+1),rollNumbers:{[institution]:academyRoll(institution,counters.student+i+1)},preferredLocationId:string(s.preferredLocationId||r.preferredLocationId)||undefined,contactPreferences:contact,photoSource:s.photo?{registrationId:id,personId:sourceId}:undefined},createdAt:now,updatedAt:now,version:1,sourceWebsiteRegistrationId:id};
   if(sourceId===primary.personId)Object.assign(peopleItems[0],person);else peopleItems.push(person);
   records.push({sourcePersonId:sourceId,studentId,rollNumber:person.studentProfile.rollNumbers[institution]});
   guards.push({counterId:`IDENTITY#${institution}#${identityHash}`,institutionId:institution,sequenceType:'IDENTITY_GUARD',personId:studentId,registrationId:id,createdAt:now});
   guards.push({counterId:`ROLL_GLOBAL#${person.studentProfile.rollNumber}`,institutionId:institution,sequenceType:'ROLL_UNIQUE',personId:studentId,registrationId:id,createdAt:now});
   if(sourceId!==primary.personId){
    const linkId=guardianLinkId(institution,guardianId,studentId);
    const submittedRelationship=(Array.isArray(r.relationships)?r.relationships:[])
     .find(x=>x?.guardianPersonId===primary.personId&&x?.studentPersonId===sourceId)?.relationship;
    const relationship=submittedRelationship==='parent'?'parent':'guardian';
    links.push({linkId,recordType:'guardian-access',institutionId:institution,familyId,personId:guardianId,guardianPersonId:guardianId,studentId,relationship,accessStatus:'approved',relationshipVerified:true,verificationSource:'approved-website-registration',evidenceReference:`website-registration:${id}`,reviewedBy:actorSub,reviewedAt:now,sourceWebsiteRegistrationId:id,createdAt:now,updatedAt:now,version:1});
   }
 }
 const family={familyId,familyNumber,primaryContactPersonId:guardianId,institutionIds:[institution],address:obj(primary.address),status:'active',createdAt:now,updatedAt:now,version:1,sourceWebsiteRegistrationId:id};
 const registrationId=markerId(institution,id);
 const reg={registrationId,institutionId:institution,source:'website',externalRegistrationId:id,externalRegistrationKey:`${institution}#website#${id}`,registrationType:r.registrationType||'website',status:'imported',reviewStatus:'approved',importStatus:'imported',identityResolutionStatus:'registration_relationships_verified',familyId,studentIds:records.map(s=>s.studentId),sourceStudentIds:Object.fromEntries(records.map(s=>[s.sourcePersonId,s.studentId])),websiteSyncStatus:institution==='sruti'?'not-required':'pending',provisioningStatus:'NOT_INVITED',submittedAt:r.submittedAt||now,importedAt:now,updatedAt:now,version:1,createdAt:now};
 const audit={auditId:`aud_${hash(institution,id,'import')}`,institutionId:institution,actorCognitoSub:actorSub,action:'WEBSITE_REGISTRATION_IMPORTED',resourceType:'registration',resourceId:registrationId,result:'success',timestamp:now,metadata:{studentCount:records.length,verifiedGuardianLinks:links.length,relationshipEvidence:'approved-website-registration'},schemaVersion:1};
 const items=[{table:'families',item:family},...peopleItems.map(item=>({table:'people',item})),...links.map(item=>({table:'family-links',item})),{table:'counters',item:{counterId:contactGuardId,institutionId:institution,sequenceType:'CONTACT_GUARD',personId:guardianId,familyId,registrationId:id,createdAt:now}},...guards.map(item=>({table:'counters',item})),{table:'registrations',item:reg},{table:'audit',item:audit}];
 // 20 students + guards + links + family + audit + registration + guardian + counters <= 100
 if(items.length+2>100)fail('Registration exceeds DynamoDB transaction limit.');
 return {institution,registrationId,externalRegistrationId:id,familyId,familyNumber,contactGuardId,studentMappings:records,items,counters:{family:{current:counters.family,next:counters.family+1},student:{current:counters.student,next:counters.student+students.length}},verifiedGuardianLinks:links.length,externalSyncPending:true};
}
