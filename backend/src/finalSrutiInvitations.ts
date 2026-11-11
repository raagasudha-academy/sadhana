/** Final-table Sruti parent invitation and resend operations. */
import {randomUUID} from 'node:crypto';
import {CognitoIdentityProviderClient,AdminCreateUserCommand,AdminGetUserCommand,ListUsersCommand} from '@aws-sdk/client-cognito-identity-provider';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,TransactWriteCommand,UpdateCommand} from '@aws-sdk/lib-dynamodb';
import {entityTable} from './entityTables.mjs';
import {createCanonicalRaagaInvitationFlow,canonicalRaagaContactGuardId} from './finalRaagaInvitationFlow.mjs';
import {markerId} from './websiteImportCore.mjs';

const table=(kind:string)=>entityTable(kind);
type DB={send:(command:any)=>Promise<any>};
type Cognito={send:(command:any)=>Promise<any>};

export function makeCanonicalSrutiInvitationReader(db:DB,cognito:Cognito,poolId:string){
 const pool=()=>{if(!poolId)throw Object.assign(new Error('Cognito user pool not configured.'),{status:503});return poolId;};
 const identityConditions=(guardian:any,reg:any)=>[
  {ConditionCheck:{TableName:table('people'),Key:{personId:guardian.personId},
   ConditionExpression:'attribute_exists(personId) AND email=:email AND familyId=:family AND #status=:active AND contains(institutionIds,:inst) AND contains(personTypes,:guardian) AND attribute_not_exists(cognitoSub)',
   ExpressionAttributeNames:{'#status':'status'},ExpressionAttributeValues:{':email':guardian.email,':family':reg.familyId,':active':'active',':inst':'sruti',':guardian':'guardian'}}},
  {ConditionCheck:{TableName:table('counters'),Key:{counterId:canonicalRaagaContactGuardId(guardian.email,'sruti')},
   ConditionExpression:'personId=:person AND familyId=:family AND institutionId=:inst',
   ExpressionAttributeValues:{':person':guardian.personId,':family':reg.familyId,':inst':'sruti'}}}
 ];
 const ops={
  contact:async(email:string)=>(await db.send(new GetCommand({TableName:table('counters'),Key:{counterId:canonicalRaagaContactGuardId(email,'sruti')},ConsistentRead:true}))).Item??null,
  listByEmail:async(email:string)=>{
   const res=await cognito.send(new ListUsersCommand({UserPoolId:pool(),Filter:`email = "${email}"`,Limit:20}));
   return {count:(res.Users??[]).length,paginated:Boolean(res.PaginationToken)};
  },
  reserveInvite:(reg:any,guardian:any,actor:string,op:string,ts:string)=>db.send(new TransactWriteCommand({TransactItems:[
   {Update:{TableName:table('registrations'),Key:{registrationId:reg.registrationId},
    UpdateExpression:'SET provisioningStatus=:creating,invitationOperationId=:op,invitationRequestedAt=:now,updatedAt=:now',
    ConditionExpression:'provisioningStatus=:not AND familyId=:family AND institutionId=:institution AND importStatus=:imported AND attribute_not_exists(parentAccountSub) AND attribute_not_exists(invitationOperationId)',
    ExpressionAttributeValues:{':creating':'INVITATION_CREATING',':not':'NOT_INVITED',':op':op,':now':ts,':family':reg.familyId,':institution':'sruti',':imported':'imported'}}},
   {Put:{TableName:table('audit'),Item:{auditId:`parent_invite_${op}`,institutionId:'sruti',actorCognitoSub:actor,
    action:'PARENT_INVITATION_REQUESTED',resourceType:'registration',resourceId:reg.registrationId,result:'requested',timestamp:ts,schemaVersion:1},ConditionExpression:'attribute_not_exists(auditId)'}},
   ...identityConditions(guardian,reg)
  ]})),
  createUser:(username:string,email:string,name:string)=>cognito.send(new AdminCreateUserCommand({UserPoolId:pool(),Username:username,
   UserAttributes:[{Name:'email',Value:email},{Name:'name',Value:name}],DesiredDeliveryMediums:['EMAIL']})).then((x:any)=>x.User),
  completeInvite:(reg:any,op:string,username:string,email:string,sub:string,ts:string)=>db.send(new UpdateCommand({TableName:table('registrations'),Key:{registrationId:reg.registrationId},
   UpdateExpression:'SET provisioningStatus=:sent,parentAccountSub=:sub,parentAccountUsername=:username,parentAccountEmail=:email,provisioningUpdatedAt=:now,parentInvitationLastSentAt=:now,updatedAt=:now',
   ConditionExpression:'provisioningStatus=:creating AND invitationOperationId=:op AND familyId=:family',
   ExpressionAttributeValues:{':sent':'INVITATION_SENT',':creating':'INVITATION_CREATING',':op':op,':sub':sub,':username':username,':email':email,':now':ts,':family':reg.familyId}})),
  getUser:(username:string)=>cognito.send(new AdminGetUserCommand({UserPoolId:pool(),Username:username})),
  reserveResend:(reg:any,guardian:any,actor:string,op:string,ts:string,threshold:string)=>db.send(new TransactWriteCommand({TransactItems:[
   {Update:{TableName:table('registrations'),Key:{registrationId:reg.registrationId},
    UpdateExpression:'SET parentInvitationAttemptAt=:now,parentInvitationOperationId=:op,parentInvitationAttemptBy=:actor',
    ConditionExpression:'provisioningStatus=:sent AND familyId=:family AND parentAccountSub=:sub AND parentAccountUsername=:username AND parentAccountEmail=:email AND (attribute_not_exists(parentInvitationAttemptAt) OR parentInvitationAttemptAt < :threshold)',
    ExpressionAttributeValues:{':sent':'INVITATION_SENT',':family':reg.familyId,':sub':reg.parentAccountSub,':username':reg.parentAccountUsername,':email':guardian.email,':now':ts,':threshold':threshold,':op':op,':actor':actor}}},
   {Put:{TableName:table('audit'),Item:{auditId:`parent_resend_${op}`,institutionId:'sruti',actorCognitoSub:actor,
    action:'PARENT_INVITATION_RESEND_REQUESTED',resourceType:'registration',resourceId:reg.registrationId,result:'requested',timestamp:ts,schemaVersion:1},ConditionExpression:'attribute_not_exists(auditId)'}},
   ...identityConditions(guardian,reg)
  ]})),
  sendResend:(username:string)=>cognito.send(new AdminCreateUserCommand({UserPoolId:pool(),Username:username,MessageAction:'RESEND',DesiredDeliveryMediums:['EMAIL']})),
  completeResend:(reg:any,actor:string,op:string,ts:string)=>db.send(new UpdateCommand({TableName:table('registrations'),Key:{registrationId:reg.registrationId},
   UpdateExpression:'SET parentInvitationLastResentAt=:now,parentInvitationLastResentBy=:actor',ConditionExpression:'parentInvitationOperationId=:op AND provisioningStatus=:sent',
   ExpressionAttributeValues:{':now':ts,':actor':actor,':op':op,':sent':'INVITATION_SENT'}})),
 };
 return createCanonicalRaagaInvitationFlow(ops,process.env,()=>new Date().toISOString(),randomUUID,'sruti');
}
let singleton:ReturnType<typeof makeCanonicalSrutiInvitationReader>|undefined;
export function m10FinalSrutiInvitations(){
 return singleton??=makeCanonicalSrutiInvitationReader(
  DynamoDBDocumentClient.from(new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'}),{marshallOptions:{removeUndefinedValues:true}}),
  new CognitoIdentityProviderClient({region:process.env.AWS_REGION||'us-east-1'}),process.env.SADHANA_COGNITO_USER_POOL_ID||'');
}
const extId=(value:string)=>typeof value==='string'&&/^SR-[A-Za-z0-9-]{1,110}$/.test(value);
const canonical=DynamoDBDocumentClient.from(new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'}),{marshallOptions:{removeUndefinedValues:true}});
async function importedParent(externalId:string){
 if(!extId(externalId))throw Object.assign(new Error('Invalid Sruti registration reference.'),{status:400});
 const registrationId=markerId('sruti',externalId);
 const registration=(await canonical.send(new GetCommand({TableName:table('registrations'),Key:{registrationId},ConsistentRead:true}))).Item;
 if(!registration||registration.registrationId!==registrationId||registration.institutionId!=='sruti'||registration.externalRegistrationId!==externalId||registration.source!=='website'||registration.importStatus!=='imported'||!registration.familyId)
  throw Object.assign(new Error('Imported Sruti family requires administrator reconciliation.'),{status:409});
 const family=(await canonical.send(new GetCommand({TableName:table('families'),Key:{familyId:registration.familyId},ConsistentRead:true}))).Item;
 if(!family||family.familyId!==registration.familyId||family.status!=='active'||!family.institutionIds?.includes('sruti')||!family.primaryContactPersonId)
  throw Object.assign(new Error('Imported Sruti family requires administrator reconciliation.'),{status:409});
 const guardian=(await canonical.send(new GetCommand({TableName:table('people'),Key:{personId:family.primaryContactPersonId},ConsistentRead:true}))).Item;
 if(!guardian||guardian.personId!==family.primaryContactPersonId||guardian.familyId!==family.familyId||guardian.status!=='active'||!guardian.institutionIds?.includes('sruti')||!guardian.personTypes?.includes('guardian'))
  throw Object.assign(new Error('Imported Sruti parent requires administrator reconciliation.'),{status:409});
 return {registration,family,guardian};
}
export async function finalSrutiParentStatus(externalId:string){
 const {registration,guardian}=await importedParent(externalId);
 return {registrationId:externalId,imported:true,status:registration.provisioningStatus||'NOT_INVITED',updatedAt:registration.provisioningUpdatedAt||registration.updatedAt||null,email:guardian.email||''};
}
export async function finalSrutiParentAction(action:'provision-parent'|'resend-parent-invitation',externalId:string,actorSub:string,confirmReference:string){
 if(confirmReference!==externalId)throw Object.assign(new Error('Confirm the exact registration reference.'),{status:400});
 const {registration,guardian}=await importedParent(externalId),service=m10FinalSrutiInvitations();
 if(action==='provision-parent')return service.invite(registration,guardian,actorSub);
 return service.resend(registration,guardian,actorSub);
}
