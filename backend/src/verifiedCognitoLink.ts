import {entityTable} from './entityTables.mjs';
import {markerId} from './websiteImportCore.mjs';
/** Link an EXISTING verified Cognito user to an imported guardian profile.
 * Does not create accounts or send invitations. Relationship approval comes from
 * the approved web registration; this operation verifies only the account identity.
 */
import {createHash,randomUUID} from 'node:crypto';
import {CognitoIdentityProviderClient,ListUsersCommand} from '@aws-sdk/client-cognito-identity-provider';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,QueryCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {demandInstitution,httpError} from './model.ts';
import type {Claims,InstitutionId} from './model.ts';
export interface M9IdentityDb {send(command:any):Promise<any>}
export interface M9IdentityProvider {send(command:any):Promise<any>}
const idPattern=/^web_[a-f0-9]{64}$/;
const validEmail=(s:string)=>/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(s)&&s.length<=254;
const attr=(attrs:Array<{Name?:string,Value?:string}>|undefined,key:string)=>attrs?.find(x=>x.Name===key)?.Value||'';
const table=(entity:string)=>entityTable(entity);
export function makeM9VerifiedCognitoLink(db:M9IdentityDb,cognito:M9IdentityProvider,poolId:string){
 return async function link(registrationId:string,institution:InstitutionId,claims:Claims,execute=false,expectedSubject=''){
  demandInstitution(claims,institution);
  const finalMode=process.env.SADHANA_ENTITY_TABLE_SET==='final';
  const finalAllowed=finalMode && institution==='raaga' &&
   process.env.SADHANA_ENTITY_FINAL_ACK==='enabled' && process.env.SADHANA_DATA_MODE!=='split';
  if(finalMode&&!finalAllowed)throw httpError(503,'Canonical identity linking is not authorised.');
  if(!finalMode&&process.env.M95_ONBOARDING_MODE!=='enabled')throw httpError(404,'M9 onboarding disabled.');
  if(execute&&(finalMode
   ? process.env.SADHANA_FINAL_RAAGA_PARENT_LINK_WRITES!=='enabled'
   : process.env.M9_VERIFIED_IDENTITY_LINK_WRITES!=='enabled'))
   throw httpError(403,'Verified identity linking is disabled.');
  if(!idPattern.test(registrationId))throw httpError(400,'Invalid M9 registration identifier.');
  if(!poolId)throw httpError(503,'Cognito identity provider not configured.');
  // Explicit administrator-selected Cognito subject; email matching alone is insufficient.
  if(!/^[a-zA-Z0-9-]{8,128}$/.test(expectedSubject))throw httpError(400,'A verified Cognito subject must be supplied by the administrator.');
  const reg=(await db.send(new GetCommand({TableName:table('registrations'),Key:{registrationId},ConsistentRead:true}))).Item;
  if(!reg||reg.institutionId!==institution||reg.importStatus!=='imported'||!reg.familyId||
     (finalMode&&(reg.source!=='website'||!/^RS-[A-Za-z0-9_-]{1,110}$/.test(reg.externalRegistrationId||'')||
       reg.registrationId!==markerId('raaga',reg.externalRegistrationId))))throw httpError(409,'Imported registration not found for this academy.');
  const family=(await db.send(new GetCommand({TableName:table('families'),Key:{familyId:reg.familyId},ConsistentRead:true}))).Item;
  if(!family||!family.primaryContactPersonId||!family.institutionIds?.includes(institution))throw httpError(409,'Family identity requires review.');
  const person=(await db.send(new GetCommand({TableName:table('people'),Key:{personId:family.primaryContactPersonId},ConsistentRead:true}))).Item;
  const email=String(person?.email||'').trim().toLowerCase();
  if(!person||person.status!=='active'||!person.personTypes?.includes('guardian')||!person.institutionIds?.includes(institution)||person.familyId!==family.familyId||!validEmail(email))throw httpError(409,'Primary contact identity requires administrator review.');
  const list=await cognito.send(new ListUsersCommand({UserPoolId:poolId,Filter:`email = "${email}"`,Limit:20}));
  const matchingEmail=(list.Users??[]).filter((u:any)=>String(attr(u.Attributes,'email')).toLowerCase()===email);
  if(list.PaginationToken||matchingEmail.length!==1)throw httpError(409,'Cognito email identity is ambiguous; administrator review required.');
  const exact=matchingEmail.filter((u:any)=>attr(u.Attributes,'email_verified')==='true' && !!attr(u.Attributes,'sub') && u.Enabled===true && u.UserStatus==='CONFIRMED' && attr(u.Attributes,'sub')===expectedSubject);
  if(exact.length!==1)throw httpError(409,'One verified Cognito identity is required. Do not create duplicate accounts.');
  const subject=attr(exact[0].Attributes,'sub');
  if(subject!==expectedSubject||subject.length>128)throw httpError(409,'Unexpected Cognito identity.');
  if(person.cognitoSub && person.cognitoSub!==subject)throw httpError(409,'Primary contact already uses another Cognito identity.');
  // Guard the identity association with a transaction, not a non-unique GSI.
  const guardKey=`COGNITO_SUB#${createHash('sha256').update(subject).digest('hex')}`;
  const [guardResult,usingSubject]=await Promise.all([
   db.send(new GetCommand({TableName:table('counters'),Key:{counterId:guardKey},ConsistentRead:true})),
   db.send(new QueryCommand({TableName:table('people'),IndexName:'CognitoIdentityIndex',KeyConditionExpression:'cognitoSub = :sub',ExpressionAttributeValues:{':sub':subject},Limit:20}))
  ]);
  const guard=guardResult.Item;
  if(usingSubject.LastEvaluatedKey||(guard&&guard.personId!==person.personId)||(usingSubject.Items??[]).some((p:any)=>p.personId!==person.personId))throw httpError(409,'Cognito account is already linked to another person.');
  if(person.cognitoSub===subject && guard?.personId===person.personId)return {registrationId,linked:true,alreadyLinked:true,guardianAccessGranted:false};
  if(person.cognitoSub===subject && !guard)throw httpError(409,'Existing identity link lacks a uniqueness guard; administrator repair required.');
  if(!execute)return {registrationId,readyToLink:true,verifiedExistingAccount:true,guardianAccessGranted:false,invitationSent:false};
  if(finalMode&&reg.provisioningStatus==='INVITATION_SENT'&&reg.parentAccountSub!==subject)
   throw httpError(409,'Invitation belongs to a different Cognito identity; administrator review required.');
  if(finalMode&&!['NOT_INVITED','NEEDS_VERIFICATION','INVITATION_SENT'].includes(reg.provisioningStatus))
   throw httpError(409,'Account provisioning state changed; administrator review required.');
  const now=new Date().toISOString();
  try{
   await db.send(new TransactWriteCommand({TransactItems:[
    {Update:{TableName:table('people'),Key:{personId:person.personId},UpdateExpression:'SET cognitoSub=:sub,updatedAt=:now,version=:next',ConditionExpression:'attribute_exists(personId) AND institutionIds = :insts AND familyId=:family AND #status=:active AND (attribute_not_exists(cognitoSub) OR cognitoSub=:sub) AND version=:previous',ExpressionAttributeNames:{'#status':'status'},ExpressionAttributeValues:{':sub':subject,':now':now,':next':Number(person.version)+1,':insts':person.institutionIds,':family':reg.familyId,':active':'active',':previous':Number(person.version)}}},
    {Put:{TableName:table('counters'),Item:{counterId:guardKey,personId:person.personId,institutionId:institution,sequenceType:'COGNITO_SUB_GUARD',createdAt:now},ConditionExpression:'attribute_not_exists(counterId)'}},
    {Update:{TableName:table('registrations'),Key:{registrationId},UpdateExpression:'SET provisioningStatus=:linked,updatedAt=:now',ConditionExpression:'institutionId=:inst AND importStatus=:imported AND familyId=:family'+(finalMode?' AND provisioningStatus=:previous':'')+(finalMode&&reg.provisioningStatus==='INVITATION_SENT'?' AND parentAccountSub=:invitedSubject':''),ExpressionAttributeValues:{':linked':'EXISTING_ACCOUNT_LINKED',':now':now,':inst':institution,':imported':'imported',':family':reg.familyId,...(finalMode?{':previous':reg.provisioningStatus,...(reg.provisioningStatus==='INVITATION_SENT'?{':invitedSubject':subject}:{})}:{})}}},
    {Put:{TableName:table('audit'),Item:{auditId:`m9identity_${randomUUID()}`,institutionId:institution,actorCognitoSub:claims.sub,action:'VERIFIED_EXISTING_COGNITO_LINK',resourceType:'person',resourceId:person.personId,result:'success',timestamp:now,schemaVersion:1},ConditionExpression:'attribute_not_exists(auditId)'}}
   ]}));
  }catch(e:any){if(['TransactionCanceledException','ConditionalCheckFailedException'].includes(e?.name))throw httpError(409,'Identity link changed; refresh and review.');throw e;}
  return {registrationId,linked:true,alreadyLinked:false,guardianAccessGranted:false,invitationSent:false};
 };
}
let singleton:ReturnType<typeof makeM9VerifiedCognitoLink>|undefined;
export function m9VerifiedCognitoLink(){
 const pool=process.env.SADHANA_COGNITO_USER_POOL_ID||'';
 return singleton??=makeM9VerifiedCognitoLink(
  DynamoDBDocumentClient.from(new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'}),{marshallOptions:{removeUndefinedValues:true}}),
  new CognitoIdentityProviderClient({region:process.env.AWS_REGION||'us-east-1'}),pool);
}
