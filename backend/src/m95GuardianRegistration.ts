import {entityTable} from './m10EntityTables.mjs';
/** M9.5 guardian workflow foundation. No website import or automatic approval.
 * Requires explicit M95_ONBOARDING_MODE=enabled; does not replace legacy family access.
 */
import {createHash,randomUUID} from 'node:crypto';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,QueryCommand,PutCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {httpError,demandInstitution} from './model.ts';
import {guardianLinkId} from './m95WebsiteImportCore.mjs';
import type {Claims,InstitutionId} from './model.ts';

export interface M95OnboardingDb {send(command:any):Promise<any>}
const environments=new Set(['dev','test']);
export const m95Table=(entity:'people'|'families'|'family-links'|'audit'|'registrations', env='dev')=>{
 if(!environments.has(env))throw Error('Unsupported environment');
 return entityTable(entity,{stage:env});
};
const validId=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=180&&/^[A-Za-z0-9_#.:\-]+$/.test(v);
const validInst=(v:unknown):v is InstitutionId=>v==='raaga'||v==='sruti';
const secretKey=guardianLinkId;
const approvedScope=(x:any,inst:InstitutionId)=>Array.isArray(x?.institutionIds)&&x.institutionIds.includes(inst) || x?.institutionId===inst;
const client=()=>DynamoDBDocumentClient.from(new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'}),{marshallOptions:{removeUndefinedValues:true}});

export function makeM95GuardianService(db:M95OnboardingDb,env:'dev'|'test'='dev'){
 const table=(e:Parameters<typeof m95Table>[0])=>m95Table(e,env);
 async function personForSubject(subject:string){
   if(!validId(subject))throw httpError(401,'Verified account required.');
   const r=await db.send(new QueryCommand({TableName:table('people'),IndexName:'CognitoIdentityIndex',KeyConditionExpression:'#sub = :sub',ExpressionAttributeNames:{'#sub':'cognitoSub'},ExpressionAttributeValues:{':sub':subject},Limit:2}));
   const people=r.Items??[];
   if(people.length!==1 || !validId(people[0].personId) || people[0].status==='archived')throw httpError(409,'Account identity requires administrator verification.');
   return people[0];
 }
 return {
  /** A self-service request creates PENDING evidence only. Never grants access. */
  async request(inst:InstitutionId,claims:Claims,body:Record<string,unknown>){
   if(!validInst(inst))throw httpError(400,'Invalid institution.');
   if(!claims.sub)throw httpError(401,'Sign in required.');
   if(!body||Object.keys(body).some(x=>x!=='studentId')||!validId(body.studentId))throw httpError(400,'A valid studentId is required.');
   const guardian=await personForSubject(claims.sub);
   const student=(await db.send(new GetCommand({TableName:table('people'),Key:{personId:body.studentId},ConsistentRead:true}))).Item;
   // Identical public response for absent, archived and wrong-institution students.
   if(!student||!approvedScope(student,inst)||student.status==='archived'||!validId(student.familyId))throw httpError(400,'Unable to request access. Contact the academy.');
   const family=(await db.send(new GetCommand({TableName:table('families'),Key:{familyId:student.familyId},ConsistentRead:true}))).Item;
   if(!family||family.status==='archived')throw httpError(400,'Unable to request access. Contact the academy.');
   const linkId=secretKey(inst,guardian.personId,student.personId);
   const now=new Date().toISOString();
   const item={linkId,recordType:'guardian-access',familyId:student.familyId,personId:guardian.personId,guardianPersonId:guardian.personId,studentId:student.personId,institutionId:inst,relationship:'unverified',accessStatus:'pending',requestedAt:now,createdAt:now,updatedAt:now,version:1};
   try{await db.send(new PutCommand({TableName:table('family-links'),Item:item,ConditionExpression:'attribute_not_exists(linkId)'}));}
   catch(e:any){
    if(e?.name!=='ConditionalCheckFailedException')throw e;
    const current=(await db.send(new GetCommand({TableName:table('family-links'),Key:{linkId},ConsistentRead:true}))).Item;
    if(current?.guardianPersonId!==guardian.personId||current?.studentId!==student.personId||current?.institutionId!==inst)throw httpError(409,'Access request conflict.');
    if(current.accessStatus==='pending'||current.accessStatus==='approved')return {status:current.accessStatus,submitted:false};
    throw httpError(409,'A previous decision requires administrator review before resubmission.');
   }
   return {status:'pending',submitted:true};
  },
  /** Approval requires an independent evidence decision by a distinct administrator. */
  async decide(inst:InstitutionId,claims:Claims,body:Record<string,unknown>){
   demandInstitution(claims,inst);
   if(!claims.sub||!body||Object.keys(body).some(x=>!['guardianPersonId','studentId','decision','expectedVersion','relationshipVerified','evidenceReference'].includes(x)))throw httpError(400,'Invalid decision.');
   const {guardianPersonId,studentId,decision,expectedVersion,relationshipVerified,evidenceReference}=body;
   if(!validId(guardianPersonId)||!validId(studentId)||!['approved','rejected','revoked'].includes(String(decision))||!Number.isSafeInteger(expectedVersion)||Number(expectedVersion)<1)throw httpError(400,'Invalid decision.');
   if(decision==='approved'&&(relationshipVerified!==true||!validId(evidenceReference)))throw httpError(400,'Independent relationship verification and evidence are required.');
   const guardian=(await db.send(new GetCommand({TableName:table('people'),Key:{personId:guardianPersonId},ConsistentRead:true}))).Item;
   const student=(await db.send(new GetCommand({TableName:table('people'),Key:{personId:studentId},ConsistentRead:true}))).Item;
   if(!guardian||!student||guardian.status!=='active'||!guardian.personTypes?.includes('guardian')||!approvedScope(guardian,inst)||guardian.familyId!==student.familyId||!approvedScope(student,inst)||student.status==='archived'||!validId(student.familyId))throw httpError(409,'Identity or academy mismatch.');
   if(guardian.cognitoSub===claims.sub)throw httpError(403,'Self-approval is not permitted.');
   const linkId=secretKey(inst,String(guardianPersonId),String(studentId));
   const current=(await db.send(new GetCommand({TableName:table('family-links'),Key:{linkId},ConsistentRead:true}))).Item;
   if(!current||current.institutionId!==inst||current.studentId!==studentId||current.guardianPersonId!==guardianPersonId||current.familyId!==student.familyId)throw httpError(409,'Access request mismatch.');
   if(current.version!==expectedVersion)throw httpError(409,'Access request changed. Refresh and retry.');
   if(decision==='approved'&&(!validId(guardian.cognitoSub)||current.accessStatus!=='pending'))throw httpError(409,'Only pending requests may be approved.');
   if(decision==='rejected'&&current.accessStatus!=='pending')throw httpError(409,'Only pending requests may be rejected.');
   if(decision==='revoked'&&current.accessStatus!=='approved')throw httpError(409,'Only approved links may be revoked.');
   const now=new Date().toISOString(), auditId=`aud_${randomUUID()}`;
   const names={'#v':'version','#status':'accessStatus','#inst':'institutionId','#guardian':'guardianPersonId','#student':'studentId'};
   await db.send(new TransactWriteCommand({TransactItems:[
    {Update:{TableName:table('family-links'),Key:{linkId},UpdateExpression:'SET #status=:status, #v=:next, reviewedBy=:actor, reviewedAt=:now, updatedAt=:now, relationshipVerified=:verified'+(decision==='approved'?', evidenceReference=:evidence':''),ConditionExpression:'#v=:old AND #status=:previous AND #inst=:inst AND #guardian=:guardian AND #student=:student',ExpressionAttributeNames:names,ExpressionAttributeValues:{':status':decision,':next':Number(expectedVersion)+1,':actor':claims.sub,':now':now,':verified':relationshipVerified===true,':old':expectedVersion,':previous':current.accessStatus,':inst':inst,':guardian':guardianPersonId,':student':studentId,...(decision==='approved'?{':evidence':evidenceReference}:{})}}},
    {Put:{TableName:table('audit'),Item:{auditId,institutionId:inst,actorCognitoSub:claims.sub,action:'GUARDIAN_ACCESS_DECISION',resourceType:'family-link',resourceId:linkId,result:'success',timestamp:now,metadata:{decision},schemaVersion:1},ConditionExpression:'attribute_not_exists(auditId)'}}
   ]}));
   return {status:decision,version:Number(expectedVersion)+1};
  }
 };
}
let singleton:ReturnType<typeof makeM95GuardianService>|undefined;
export const m95GuardianService=()=>singleton??=(makeM95GuardianService(client()));
