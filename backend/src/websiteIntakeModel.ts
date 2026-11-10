/** Sadhana website intake v1: pure validation and normalisation. No DB writes or access grants. */
export type IntakeMode = 'self'|'children'|'both';
export type AllergyStatus = 'no'|'yes'|'unknown';
export interface FoodAllergy {
  status: AllergyStatus;
  allergens: string[];
  otherAllergens?: string;
  reactionDetails?: string;
  emergencyInstructions?: string;
  carriesEmergencyMedication?: boolean;
}
export interface ContactSources {emailSource:'guardian'|'student';phoneSource:'guardian'|'student';addressSource:'guardian'|'student';guardianPersonId?:string}
export interface IntakePerson {
  personId:string; fullName:string; dateOfBirth?:string|null; email?:string; phone?:string;
  address?:{line1?:string;line2?:string;town?:string;county?:string;postcode?:string;country?:string};
  gender?:string; roles:('guardian'|'student')[];
}
export interface IntakeLearner {
  personId:string; studentType:'adult'|'child'; foodAllergies:FoodAllergy;
  contactPreferences?:ContactSources; preferredLocationId?:string; preferredClassId?:string|null;
  proposedStartDate?:string|null; photoStorageKey?:string|null; notes?:string;
}
export interface IntakeSubmission {
  schemaVersion:2; registrationId:string; source:'raagasudha-website'; institution:'raaga';
  registrationType:IntakeMode; status:'pending'|'under_review'|'approved'|'discarded';
  submittedAt:string; primaryContactPersonId:string; people:IntakePerson[]; students:IntakeLearner[];
  relationships?:{guardianPersonId:string;studentPersonId:string;relationship:'parent'|'guardian';verificationStatus:'unverified'}[];
  privacyAcknowledgement:{accepted:boolean;noticeVersion:string;recordedAt:string};
  mediaConsent?:{granted:boolean;recordedAt:string};
}
const emailOK=(v:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const phoneOK=(v:string)=>/^\+[1-9]\d{7,14}$/.test(v);
const dateOK=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const obj=(v:unknown):v is Record<string,any>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const allowedAllergens=new Set(['Peanuts','Tree nuts','Milk','Eggs','Wheat','Soy','Fish','Shellfish','Sesame','Other']);
const trimmed=(v:unknown,max=240)=>typeof v==='string'?v.trim().slice(0,max):'';
/** Fail closed: incoming content must be individually validated before privileged display/import. */
export function validateWebsiteIntake(input:unknown):IntakeSubmission {
  if(!obj(input))throw new Error('Invalid registration payload');
  if(input.schemaVersion!==2||input.source!=='raagasudha-website'||input.institution!=='raaga')throw new Error('Unsupported source/schema');
  if(!['self','children','both'].includes(input.registrationType))throw new Error('Invalid registration type');
  // Website clients may submit pending applications ONLY. Admin transitions belong to private endpoints.
  if(input.status!=='pending')throw new Error('Website submissions must be pending');
  if(!/^REG-[A-Za-z0-9-]{6,100}$/.test(input.registrationId||''))throw new Error('Invalid registration ID');
  if(!Array.isArray(input.people)||!Array.isArray(input.students)||input.people.length<1||input.people.length>25||input.students.length<1||input.students.length>20)throw new Error('Invalid person/student count');
  if(!input.privacyAcknowledgement?.accepted||!trimmed(input.privacyAcknowledgement.noticeVersion)||!Number.isFinite(Date.parse(input.privacyAcknowledgement.recordedAt)))throw new Error('Privacy acknowledgement required');
  if(!Number.isFinite(Date.parse(input.submittedAt)))throw new Error('Invalid submission timestamp');
  const personIds=new Set<string>();
  const people:IntakePerson[]=input.people.map((p:unknown)=>{
    if(!obj(p)||!/^PERSON-[A-Za-z0-9-]{6,100}$/.test(p.personId||'')||personIds.has(p.personId))throw new Error('Duplicate/invalid person ID');
    personIds.add(p.personId);
    if(!trimmed(p.fullName,90)||!Array.isArray(p.roles)||!p.roles.length||p.roles.some((r:unknown)=>r!=='guardian'&&r!=='student'))throw new Error('Invalid person');
    const email=trimmed(p.email,180).toLowerCase(),phone=trimmed(p.phone,30);
    if(email&&!emailOK(email)||phone&&!phoneOK(phone))throw new Error('Invalid contact details');
    if(p.dateOfBirth!=null&&p.dateOfBirth!==''&&(!dateOK(p.dateOfBirth)||p.dateOfBirth>new Date().toISOString().slice(0,10)))throw new Error('Invalid birth date');
    if(p.address!==undefined&&!obj(p.address))throw new Error('Invalid address');
    return {personId:p.personId,fullName:trimmed(p.fullName,90),dateOfBirth:p.dateOfBirth||undefined,email,phone,roles:[...new Set(p.roles)],gender:trimmed(p.gender,60)||undefined,address:p.address?{line1:trimmed(p.address.line1),line2:trimmed(p.address.line2),town:trimmed(p.address.town),county:trimmed(p.address.county),postcode:trimmed(p.address.postcode,20),country:trimmed(p.address.country,2)}:undefined};
  });
  const primary=people.find(p=>p.personId===input.primaryContactPersonId);
  if(!primary||!primary.email||!primary.phone)throw new Error('Primary contact email and phone required');
  const students:IntakeLearner[]=input.students.map((s:unknown)=>{
    if(!obj(s)||!personIds.has(s.personId)||!['adult','child'].includes(s.studentType)||!people.find(p=>p.personId===s.personId)?.roles.includes('student'))throw new Error('Invalid student association');
    if(!obj(s.foodAllergies)||!['yes','no','unknown'].includes(s.foodAllergies.status))throw new Error('Explicit allergy status required');
    const a=s.foodAllergies;
    if(!Array.isArray(a.allergens)||a.allergens.length>12||a.allergens.some((x:unknown)=>typeof x!=='string'||!allowedAllergens.has(x)))throw new Error('Invalid allergens');
    const other=trimmed(a.otherAllergens,500),reaction=trimmed(a.reactionDetails,1500),emergency=trimmed(a.emergencyInstructions,1500);
    if(a.status==='yes'&&!a.allergens.length&&!other)throw new Error('Specify an allergen');
    if(a.status!=='yes'&&(a.allergens.length||other||reaction||emergency||a.carriesEmergencyMedication===true))throw new Error('Conflicting allergy details');
    const person=people.find(p=>p.personId===s.personId)!;
    if(s.studentType==='adult'&&(!person.email||!person.phone||!person.dateOfBirth))throw new Error('Adult student contact and DOB required');
    if(s.studentType==='child'&&!person.dateOfBirth)throw new Error('Child DOB required');
    if(s.contactPreferences){const c=s.contactPreferences;if(!obj(c)||!['guardian','student'].includes(c.emailSource)||!['guardian','student'].includes(c.phoneSource)||!['guardian','student'].includes(c.addressSource))throw new Error('Invalid inheritance flags');if([c.emailSource,c.phoneSource,c.addressSource].includes('guardian')&&(!c.guardianPersonId||!people.some(p=>p.personId===c.guardianPersonId&&p.roles.includes('guardian'))))throw new Error('Invalid referenced guardian');}
    return {personId:s.personId,studentType:s.studentType,foodAllergies:{status:a.status,allergens:[...new Set(a.allergens)],otherAllergens:other,reactionDetails:reaction,emergencyInstructions:emergency,carriesEmergencyMedication:a.carriesEmergencyMedication===true},contactPreferences:s.contactPreferences,preferredLocationId:trimmed(s.preferredLocationId,100)||undefined,preferredClassId:trimmed(s.preferredClassId,100)||null,proposedStartDate:s.proposedStartDate||null,photoStorageKey:trimmed(s.photoStorageKey,500)||null,notes:trimmed(s.notes,1500)};
  });
  if(new Set(students.map(s=>s.personId)).size!==students.length)throw new Error('Duplicate student');
  if(input.registrationType==='self'&&(students.length!==1||students[0].studentType!=='adult'))throw new Error('Self registration mismatch');
  if(input.registrationType==='children'&&(students.some(s=>s.studentType!=='child')||!primary.roles.includes('guardian')))throw new Error('Child registration mismatch');
  if(input.registrationType==='both'&&(!students.some(s=>s.studentType==='adult')||!students.some(s=>s.studentType==='child')))throw new Error('Family registration mismatch');
  const relationships=Array.isArray(input.relationships)?input.relationships:[];
  if(students.some(s=>s.studentType==='child'&&!relationships.some((r:any)=>r.studentPersonId===s.personId&&personIds.has(r.guardianPersonId))))throw new Error('Child requires guardian relationship');
  if(relationships.some((r:any)=>!personIds.has(r.guardianPersonId)||!personIds.has(r.studentPersonId)||!['parent','guardian'].includes(r.relationship)||r.verificationStatus!=='unverified'))throw new Error('Invalid family relationships');
  return {schemaVersion:2,registrationId:input.registrationId,source:'raagasudha-website',institution:'raaga',registrationType:input.registrationType,status:'pending',submittedAt:input.submittedAt,primaryContactPersonId:primary.personId,people,students,relationships,privacyAcknowledgement:{accepted:true,noticeVersion:trimmed(input.privacyAcknowledgement.noticeVersion,100),recordedAt:input.privacyAcknowledgement.recordedAt},mediaConsent:input.mediaConsent&&typeof input.mediaConsent.granted==='boolean'?{granted:input.mediaConsent.granted,recordedAt:input.mediaConsent.recordedAt}:undefined};
}
