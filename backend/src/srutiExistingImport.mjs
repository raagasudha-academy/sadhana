/** Guarded Sruti onboarding of EXISTING, independently verified Sadhana identities.
 * Never creates people, families or Cognito accounts. All academy membership,
 * source registration status, idempotency marker and audit changes are atomic.
 */
import {createHash,randomUUID} from 'node:crypto';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {entityTable} from './entityTables.mjs';
import {permanentRoll} from './academyRoll.mjs';
import {validateSrutiSubmission} from './srutiIntakeCore.mjs';
import {guardianLinkId,markerId} from './websiteImportCore.mjs';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{4,180}$/.test(v);
const ext=v=>typeof v==='string'&&/^SR-[A-Za-z0-9-]{1,110}$/.test(v);
const norm=v=>typeof v==='string'?v.trim().replace(/\s+/g,' ').normalize('NFKC').toLocaleLowerCase('en-GB'):'';
const unique=xs=>new Set(xs).size===xs.length;
const table=name=>entityTable(name);
const sourceId=i=>`sruti-child-${i+1}`;
const hash=(...parts)=>createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const now=()=>new Date().toISOString();
const get=async(db,domain,key,value)=>(await db.send(new GetCommand({TableName:table(domain),Key:{[key]:value},ConsistentRead:true}))).Item;
const inRaaga=p=>p?.status==='active'&&Array.isArray(p.institutionIds)&&p.institutionIds.includes('raaga');
const inSruti=p=>p?.institutionIds?.includes('sruti');
const version=p=>Number.isSafeInteger(p?.version)&&p.version>=1;
const personName=p=>norm(p?.displayName||[p?.firstName,p?.lastName].filter(Boolean).join(' '));
const conditionalUpdate=(domain,key,keyValue,old,patch)=>({Put:{TableName:table(domain),Item:{...old,...patch},ConditionExpression:'#v=:old',ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':old':old.version}}});
const newPut=(domain,key,item)=>({Put:{TableName:table(domain),Item:item,ConditionExpression:'attribute_not_exists(#k)',ExpressionAttributeNames:{'#k':key}}});

export async function srutiExistingIdentityImport(db,registrationId,actorSub,body,execute=false){
 if(!ext(registrationId)||!id(actorSub))fail(400,'Invalid Sruti registration or administrator.');
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['confirmReference','guardianPersonId','students','evidenceReference'].includes(k))||body.confirmReference!==registrationId)
  fail(400,'Confirm the exact Sruti reference and existing identities.');
 if(!id(body.guardianPersonId)||!Array.isArray(body.students)||!id(body.evidenceReference)||body.evidenceReference.length>180)
  fail(400,'Administrator-confirmed canonical identity IDs and evidence are required.');
 const src=await get(db,'registrations','registrationId',registrationId);
 if(!src||src.institutionId!=='sruti'||src.source!=='sruti-website'||src.reviewStatus!=='approved')fail(409,'Approved Sruti registration not found.');
 const marker=markerId('sruti',registrationId),prior=await get(db,'registrations','registrationId',marker);
 if(prior){
  if(prior.institutionId!=='sruti'||prior.externalRegistrationId!==registrationId||prior.importStatus!=='imported')fail(409,'Import marker identity conflict.');
  if(prior.familyId!==body.familyId&&body.familyId!==undefined)fail(409,'Imported family mismatch.');
  if(!Array.isArray(prior.studentIds)||prior.studentIds.length!==body.students.length||
    !unique(body.students.map(s=>s.personId))||!body.students.every(s=>prior.sourceStudentIds?.[s.sourcePersonId]===s.personId))fail(409,'Import identity mapping differs from the committed registration.');
  if(src.importStatus!=='imported')fail(409,'Registration and marker disagree; reconcile before retry.');
  return {alreadyImported:true,registrationId:marker,familyId:prior.familyId,studentIds:prior.studentIds};
 }
 if(src.importStatus!=='pending'||!version(src))fail(409,'Registration is no longer pending import.');
 const submission=validateSrutiSubmission(src.submission);
 if(submission.registrationType!=='child'||submission.students.some(s=>s.applicantType!=='child'))fail(409,'Existing-family link currently supports child-only registrations.');
 if(body.students.length!==submission.students.length||body.students.length<1||body.students.length>11||
   !body.students.every((s,i)=>s&&Object.keys(s).length===2&&s.sourcePersonId===sourceId(i)&&id(s.personId))||
   !unique(body.students.map(s=>s.personId)))fail(400,'Every registered child needs one unique, position-matched existing person ID.');
 const guardian=await get(db,'people','personId',body.guardianPersonId);
 if(!inRaaga(guardian)||!version(guardian)||!guardian.personTypes?.includes('guardian')||!id(guardian.familyId)||
    norm(guardian.email)!==norm(submission.guardian.email)||
    personName(guardian)!==norm(submission.guardian.firstName+' '+submission.guardian.lastName))
   fail(409,'Existing guardian identity mismatch; administrator reconciliation required.');
 if(inSruti(guardian))fail(409,'Guardian already has a Sruti membership; review existing membership.');
 const family=await get(db,'families','familyId',guardian.familyId);
 if(!family||!version(family)||family.status!=='active'||!family.institutionIds?.includes('raaga')||
    family.primaryContactPersonId!==guardian.personId||inSruti(family))fail(409,'Existing family identity is not eligible for cross-academy link.');
 const students=[];
 for(let i=0;i<body.students.length;i++){
  const supplied=body.students[i],submitted=submission.students[i];
  const p=await get(db,'people','personId',supplied.personId);
  if(!inRaaga(p)||inSruti(p)||!version(p)||!p.personTypes?.includes('student')||p.familyId!==family.familyId||
     personName(p)!==norm(submitted.fullName)||
     p.studentProfile?.dateOfBirth!==submitted.dateOfBirth)
    fail(409,'Student identity/academy/date-of-birth mismatch; do not create a duplicate.');
  // The approved Sruti registration and explicit canonical identity mapping
  // establish the submitted relationship for the new academy membership.
  const existing=await get(db,'family-links','linkId',guardianLinkId('raaga',guardian.personId,p.personId));
  if(!existing||existing.familyId!==family.familyId||existing.guardianPersonId!==guardian.personId||
     existing.studentId!==p.personId||existing.institutionId!=='raaga'||
     existing.accessStatus!=='approved'||existing.relationshipVerified!==true||!version(existing))
    fail(409,'Existing guardian-child relationship is not independently verified.');
  const srutiLink=await get(db,'family-links','linkId',guardianLinkId('sruti',guardian.personId,p.personId));
  if(srutiLink)fail(409,'Sruti relationship already exists; review before importing.');
  students.push(p);
 }
 const t=now(),currentNumber=await get(db,'counters','counterId','sruti#FAMILY_NUMBER');

 const fn=Number(currentNumber?.lastAllocated??0);
 if(!Number.isSafeInteger(fn)||fn<0||!version(guardian)||!version(family))fail(409,'Sruti counters require reconciliation.');
 const familyNumber=String(fn+1).padStart(3,'0');
 const mapping=body.students.map((row,i)=>({sourcePersonId:row.sourcePersonId,personId:row.personId,rollNumber:permanentRoll(students[i].studentProfile, students[i].institutionIds)}));
 if(mapping.some(row=>!row.rollNumber))fail(409,'Student permanent roll number must be reconciled before cross-academy linking.');
 if(!execute)return {preview:true,readyForExecute:true,registrationId:marker,studentCount:students.length,
  existingFamilyId:family.familyId,studentMappings:mapping,
  guardianLinksToCreate:'verified-from-approved-registration',noNewPeople:true,noNewCognitoUsers:true};
 const tx=[];
 const counterAction=(name,existing,next)=>({Update:{TableName:table('counters'),Key:{counterId:`sruti#${name}`},
  UpdateExpression:'SET lastAllocated=:next, institutionId=:inst, sequenceType=:kind, updatedAt=:now',
  ConditionExpression:existing?'lastAllocated=:old':'attribute_not_exists(counterId)',
  ExpressionAttributeValues:{':next':next,':old':Number(existing?.lastAllocated??0),':inst':'sruti',':kind':name,':now':t}}});
 tx.push(counterAction('FAMILY_NUMBER',currentNumber,fn+1));
 tx.push(conditionalUpdate('families','familyId',family.familyId,family,{institutionIds:[...family.institutionIds,'sruti'],familyNumbers:{...(family.familyNumbers||{}),sruti:familyNumber},version:family.version+1,updatedAt:t}));
 tx.push(conditionalUpdate('people','personId',guardian.personId,guardian,{institutionIds:[...guardian.institutionIds,'sruti'],version:guardian.version+1,updatedAt:t}));
 for(let i=0;i<students.length;i++){
  const p=students[i],s=submission.students[i];
  const rollNumbers={...(p.studentProfile?.rollNumbers||{}),sruti:mapping[i].rollNumber};
  const studentProfile={...p.studentProfile,rollNumber:mapping[i].rollNumber,rollNumbers,srutiLearning:{gender:s.gender,school:s.school,interests:s.interests,experience:s.experience,medicalNotes:s.medicalNotes,allergies:s.allergies}};
  tx.push(conditionalUpdate('people','personId',p.personId,p,{institutionIds:[...p.institutionIds,'sruti'],studentProfile,version:p.version+1,updatedAt:t}));
  const link={linkId:guardianLinkId('sruti',guardian.personId,p.personId),recordType:'guardian-access',institutionId:'sruti',familyId:family.familyId,personId:guardian.personId,
   guardianPersonId:guardian.personId,studentId:p.personId,relationship:'parent',accessStatus:'approved',relationshipVerified:true,
   verificationSource:'approved-website-registration',evidenceReference:body.evidenceReference,reviewedBy:actorSub,reviewedAt:t,
   sourceWebsiteRegistrationId:registrationId,createdAt:t,updatedAt:t,version:1};
  tx.push(newPut('family-links','linkId',link));
 }
 const reg={registrationId:marker,institutionId:'sruti',source:'website',externalRegistrationId:registrationId,
  externalRegistrationKey:`sruti#website#${registrationId}`,registrationType:'child',status:'imported',reviewStatus:'approved',importStatus:'imported',
  identityResolutionStatus:'registration_relationships_verified',familyId:family.familyId,studentIds:students.map(p=>p.personId),
  sourceStudentIds:Object.fromEntries(mapping.map(m=>[m.sourcePersonId,m.personId])),websiteSyncStatus:'not-required',
  provisioningStatus:'EXISTING_ACCOUNT_LINKED',submittedAt:src.submittedAt,importedAt:t,updatedAt:t,createdAt:t,version:1};
 tx.push(newPut('registrations','registrationId',reg));
 tx.push({Update:{TableName:table('registrations'),Key:{registrationId},
  UpdateExpression:'SET importStatus=:imported, updatedAt=:now, #v=:next, familyId=:family, studentIds=:students',
  ConditionExpression:'institutionId=:inst AND #source=:source AND reviewStatus=:approved AND importStatus=:pending AND #v=:old',
  ExpressionAttributeNames:{'#source':'source','#v':'version'},
  ExpressionAttributeValues:{':imported':'imported',':now':t,':next':src.version+1,':old':src.version,':family':family.familyId,':students':students.map(p=>p.personId),':inst':'sruti',':source':'sruti-website',':approved':'approved',':pending':'pending'}}});
 const audit={auditId:`aud_${randomUUID()}`,institutionId:'sruti',actorCognitoSub:actorSub,action:'EXISTING_STUDENTS_SRUTI_IMPORTED',resourceType:'registration',resourceId:marker,
  result:'success',timestamp:t,metadata:{studentCount:students.length,evidenceHash:hash(body.evidenceReference)},schemaVersion:1};
 tx.push(newPut('audit','auditId',audit));
 if(tx.length>100)fail(409,'Registration exceeds transaction limit.');
 try{await db.send(new TransactWriteCommand({TransactItems:tx}));}
 catch(e){if(['TransactionCanceledException','ConditionalCheckFailedException'].includes(e?.name))fail(409,'Records changed or Sruti membership already exists; refresh the preview.');throw e;}
 return {imported:true,registrationId:marker,familyId:family.familyId,studentIds:students.map(p=>p.personId),studentRollNumbers:Object.fromEntries(mapping.map(m=>[m.sourcePersonId,m.rollNumber])),
  verifiedGuardianLinks:students.length,noNewPeople:true,noNewCognitoUsers:true};
}
let instance;
export function finalSrutiExistingImporter(){
 return async(registrationId,actorSub,body,execute)=>{
  instance??=DynamoDBDocumentClient.from(new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'}),{marshallOptions:{removeUndefinedValues:true}});
  return srutiExistingIdentityImport(instance,registrationId,actorSub,body,execute);
 };
}
