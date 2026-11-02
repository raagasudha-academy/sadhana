/** Queue guardian reviews; approve only strictly verified adult self-access. */
import {GetCommand,PutCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {CognitoIdentityProviderClient,ListUsersCommand} from '@aws-sdk/client-cognito-identity-provider';
import {randomUUID} from 'node:crypto';
import {makeRoutedClient} from './tableRouter.ts';
import {fetchWebsiteRegistration} from './websiteRegistrationGateway.ts';
import {isAccountSubject,isStudentRecordId} from './accessRules.ts';
const db=makeRoutedClient();
const cognito=new CognitoIdentityProviderClient({});
/** Legacy records may not carry import IDs. Verify the exact website-to-student
 * ID mapping, the family, legal name, birth date, and verified account email.
 * No names-only inference; absence or conflict fails closed. */
const norm=(x:unknown)=>typeof x==='string'?x.trim().replace(/\s+/g,' ').toLowerCase():'';
export function isVerifiedSelfCandidate(student:any, website:any, accountEmail:string|null, evidence?:{
 registrationId:string;studentId:string;familyId:string;personId:string;mappedStudentId:string
}):boolean {
 const primaryId=website?.primaryContactPersonId;
 const contact=(website?.people||[]).find((p:any)=>p?.personId===primaryId);
 const studentMember=(website?.students||[]).find((p:any)=>p?.personId===primaryId);
 const legacy=!!(evidence && evidence.personId===primaryId &&
   evidence.mappedStudentId===evidence.studentId && student?.id===evidence.studentId &&
   student?.familyId===evidence.familyId && website?.registrationId===evidence.registrationId &&
   (!student?.sourceWebsiteRegistrationId || student.sourceWebsiteRegistrationId===evidence.registrationId) &&
   (!student?.sourcePersonId || student.sourcePersonId===primaryId) &&
   !!norm(student?.name) && norm(student.name)===norm(contact?.fullName) &&
   !!contact?.dateOfBirth && (!student?.dateOfBirth || student.dateOfBirth===contact.dateOfBirth) &&
   studentMember?.studentType==='adult' &&
   (website?.applicantPersonIds||[]).includes(primaryId));
 const direct=student?.sourcePersonId===primaryId &&
   (!evidence || student?.sourceWebsiteRegistrationId===evidence.registrationId);
 return Boolean(accountEmail && primaryId && contact && student?.adultConfirmed===true &&
   ['self','parent_guardian','adult_student'].includes(student.relationship) &&
   (typeof student.email!=='string' || !student.email.trim() || student.email.trim().toLowerCase()===accountEmail) &&
   typeof contact.email==='string' && contact.email.trim().toLowerCase()===accountEmail &&
   (direct || legacy));
}
/** A legacy registration must match a mapped student and the source person exactly.
 * This guard is used before any queued access mutation, including for children. */
export function matchesImportedPerson(student:any, website:any, registrationId:string, familyId:string, personId:string, studentId:string, verifiedEmail:string|null):boolean {
 const person=(website?.people||[]).find((p:any)=>p?.personId===personId);
 const member=(website?.students||[]).find((p:any)=>p?.personId===personId);
 const verifiedLegacyAdult=Boolean(verifiedEmail && personId===website?.primaryContactPersonId &&
   student?.relationship==='self' && student?.adultConfirmed===true &&
   member?.studentType==='adult' && (website?.applicantPersonIds||[]).includes(personId) &&
   typeof person?.email==='string' && person.email.trim().toLowerCase()===verifiedEmail &&
   !!person?.dateOfBirth && (!student?.dateOfBirth || student.dateOfBirth===person.dateOfBirth) &&
   (typeof student?.email!=='string' || !student.email.trim() || student.email.trim().toLowerCase()===verifiedEmail));
 return Boolean(person && member && student?.id===studentId && student?.familyId===familyId &&
   !student?.archived && (!student.sourceWebsiteRegistrationId || student.sourceWebsiteRegistrationId===registrationId) &&
   (!student.sourcePersonId || student.sourcePersonId===personId) &&
   !!norm(student.name) && norm(student.name)===norm(person.fullName) &&
   ((!!student.dateOfBirth && student.dateOfBirth===person.dateOfBirth) || verifiedLegacyAdult));
}
async function verifiedAccountEmail(sub:string):Promise<string|null>{
 const pool=process.env.SADHANA_COGNITO_USER_POOL_ID;
 if(!pool)return null;
 const response=await cognito.send(new ListUsersCommand({UserPoolId:pool,Filter:`sub = "${sub}"`,Limit:2}));
 const users=(response.Users||[]).filter(u=>u.Attributes?.some(a=>a.Name==='sub'&&a.Value===sub));
 if(users.length!==1||users[0].Enabled===false)return null;
 const attr=(name:string)=>users[0].Attributes?.find(a=>a.Name===name)?.Value;
 const email=attr('email')?.trim().toLowerCase()||'';
 return attr('email_verified')==='true' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:null;
}

const table=()=>{if(!process.env.SADHANA_TABLE_NAME)throw Error('Sadhana table not configured');return process.env.SADHANA_TABLE_NAME;};
const unwrap=(x:any)=>x?.registration??x?.record??x?.item??x?.data??x;
export async function enqueueImportedGuardianReviews(registrationId:string,legacyAdminRequester?:string){
 if(!/^RS-[A-Za-z0-9_-]{1,110}$/.test(registrationId))throw Error('Invalid registration ID');
 const marker=(await db.send(new GetCommand({TableName:table(),Key:{PK:'OPS#GLOBAL#WEB_IMPORT',SK:`ITEM#${registrationId}`},ConsistentRead:true}))).Item;
 if(!marker||!isAccountSubject(marker.parentAccountSub)||!['INVITATION_SENT','ACCOUNT_FOUND','ACTIVE'].includes(marker.parentAccessStatus))throw Error('Parent account is not ready for guardian review');
 const website=unwrap(await fetchWebsiteRegistration(registrationId));
 const entries=Object.entries(marker.studentIds||{});
 if(website?.registrationId!==registrationId||website.reviewStatus!=='approved'||website.sadhanaImport?.status!=='imported'||website.sadhanaImport.familyId!==marker.familyId||JSON.stringify(Object.entries(website.sadhanaImport.studentIds||{}).sort())!==JSON.stringify([...entries].sort()))throw Error('Website import mapping differs; no guardian requests queued');
 const studentIds=[...new Set(entries.map(([,id])=>id))];
 const personByStudentId=new Map(entries.map(([personId,id])=>[id,personId]));
 if(!studentIds.length||studentIds.length>20||studentIds.length!==entries.length||!studentIds.every(isStudentRecordId))throw Error('Invalid website student mapping');
 // Verify every student is still owned by this exact import before any review is queued.
 const verifiedEmail=await verifiedAccountEmail(marker.parentAccountSub);
 const studentRecords=new Map<string,any>();
 for(const studentId of studentIds){
  const student=(await db.send(new GetCommand({TableName:table(),Key:{PK:'OPS#GLOBAL#STUDENT',SK:`ITEM#${studentId}`},ConsistentRead:true}))).Item;
  if(!matchesImportedPerson(student,website,registrationId,marker.familyId,personByStudentId.get(studentId) as string,studentId,verifiedEmail))throw Error('Student identity or ownership mismatch; guardian requests not queued');
  studentRecords.set(studentId,student);
 }
 let queued=0,alreadyExists=0,selfApproved=0;
 const diagnostics:{studentId:string;result:string}[]=[];
 for(const studentId of studentIds){
  const now=new Date().toISOString();
  const key={PK:`ACCESS#raaga#${marker.parentAccountSub}`,SK:`STUDENT#${studentId}`};
  const isSelf=isVerifiedSelfCandidate(studentRecords.get(studentId),website,verifiedEmail,{registrationId,studentId,familyId:marker.familyId,personId:personByStudentId.get(studentId) as string,mappedStudentId:website.sadhanaImport.studentIds[personByStudentId.get(studentId) as string]});
  if(isSelf){
   const audit={PK:'AUDIT#raaga',SK:`ACCESS#${now}#${randomUUID()}`,entityType:'audit',action:'verifiedSelfStudentAccess',subject:marker.parentAccountSub,studentId,registrationId,identityProof:'verified-email+primary-contact+imported-adult',at:now};
   const item={...key,institution:'raaga',studentId,subject:marker.parentAccountSub,requestedBy:'system:website-import',kind:'student',status:'approved',version:1,createdAt:now,updatedAt:now,sourceWebsiteRegistrationId:registrationId,GSI1PK:'ACCESS_REQUEST#raaga',GSI1SK:`${now}#${marker.parentAccountSub}#${studentId}`};
   const prior=(await db.send(new GetCommand({TableName:table(),Key:key,ConsistentRead:true}))).Item;
   if(prior?.status==='approved'){alreadyExists++;diagnostics.push({studentId,result:prior.kind==='student'?'already-approved-self':'already-approved-other'});continue;}
   // Upgrade only the exact pending auto-queued guardian record. Never overwrite
   // a manually created link or a revoked/rejected administrator decision.
   if(prior && !(prior.status==='pending'&&prior.kind==='guardian'&&(!prior.sourceWebsiteRegistrationId||prior.sourceWebsiteRegistrationId===registrationId)&&(prior.requestedBy==='system:website-import'||(!!legacyAdminRequester&&isAccountSubject(prior.requestedBy)&&prior.requestedBy!==marker.parentAccountSub)))){
    alreadyExists++;diagnostics.push({studentId,result:'existing-request-protected'});continue;
   }
   const change=prior?{Update:{TableName:table(),Key:key,
      ConditionExpression:'#v=:v AND #s=:pending AND #kind=:guardian AND (requestedBy=:system OR (requestedBy <> :beneficiary AND attribute_exists(requestedBy))) AND (attribute_not_exists(sourceWebsiteRegistrationId) OR sourceWebsiteRegistrationId=:id)',
      UpdateExpression:'SET #s=:approved,#kind=:student,#v=:next,updatedAt=:now,reviewedBy=:system,sourceWebsiteRegistrationId=:id',
      ExpressionAttributeNames:{'#v':'version','#s':'status','#kind':'kind'},
      ExpressionAttributeValues:{':v':prior.version,':pending':'pending',':guardian':'guardian',':id':registrationId,':system':'system:website-import',':beneficiary':marker.parentAccountSub,':approved':'approved',':student':'student',':next':prior.version+1,':now':now}}}:
     {Put:{TableName:table(),Item:item,ConditionExpression:'attribute_not_exists(PK)'}};
   try{await db.send(new TransactWriteCommand({TransactItems:[change,{Put:{TableName:table(),Item:audit,ConditionExpression:'attribute_not_exists(PK)'}}]}));selfApproved++;diagnostics.push({studentId,result:'self-approved'});}
   catch(error:any){if(['TransactionCanceledException','ConditionalCheckFailedException'].includes(error?.name)){alreadyExists++;diagnostics.push({studentId,result:'conditional-conflict'});continue;}throw error;}
   continue;
  }
  diagnostics.push({studentId,result:studentRecords.get(studentId)?.relationship==='self'?'self-identity-not-verified':'guardian-awaiting-admin-review'});
  try{
   await db.send(new PutCommand({TableName:table(),Item:{...key,institution:'raaga',studentId,subject:marker.parentAccountSub,requestedBy:'system:website-import',kind:'guardian',status:'pending',version:1,createdAt:now,updatedAt:now,sourceWebsiteRegistrationId:registrationId,GSI1PK:'ACCESS_REQUEST#raaga',GSI1SK:`${now}#${marker.parentAccountSub}#${studentId}`},ConditionExpression:'attribute_not_exists(PK)'}));queued++;
  }catch(error:any){if(error?.name==='ConditionalCheckFailedException'){alreadyExists++;continue;}throw error;}
 }
 return {registrationId,queued,selfApproved,alreadyExists,diagnostics,status:'AWAITING_RELATIONSHIP_VERIFICATION'};
}
