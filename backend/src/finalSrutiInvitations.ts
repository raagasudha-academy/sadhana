/** Final-table Sruti parent invitation and resend operations. */
import {randomUUID} from 'node:crypto';
import {CognitoIdentityProviderClient,AdminCreateUserCommand,AdminGetUserCommand,ListUsersCommand} from '@aws-sdk/client-cognito-identity-provider';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,TransactWriteCommand,UpdateCommand} from '@aws-sdk/lib-dynamodb';
import {entityTable} from './entityTables.mjs';
import {parentEmailRouteRecord} from './parentEmailRoute.mjs';
import {createCanonicalRaagaInvitationFlow,canonicalRaagaContactGuardId} from './finalRaagaInvitationFlow.mjs';
import {markerId} from './websiteImportCore.mjs';
import {cognitoSubjectGuardId,guardianInstitutionGuardId} from './guardianIdentityKey.mjs';

const table=(kind:string)=>entityTable(kind);
type DB={send:(command:any)=>Promise<any>};
type Cognito={send:(command:any)=>Promise<any>};

export function makeCanonicalSrutiInvitationReader(db:DB,cognito:Cognito,poolId:string){
 const pool=()=>{if(!poolId)throw Object.assign(new Error('Cognito user pool not configured.'),{status:503});return poolId;};
 const identityConditions=(guardian:any,reg:any,linkedSub?:string)=>[
  {ConditionCheck:{TableName:table('people'),Key:{personId:guardian.personId},
   ConditionExpression:'attribute_exists(personId) AND email=:email AND familyId=:family AND #status=:active AND contains(institutionIds,:inst) AND contains(personTypes,:guardian)'+(linkedSub?' AND cognitoSub=:linkedSub':' AND attribute_not_exists(cognitoSub)'),
   ExpressionAttributeNames:{'#status':'status'},ExpressionAttributeValues:{':email':guardian.email,':family':reg.familyId,':active':'active',':inst':'sruti',':guardian':'guardian',...(linkedSub?{':linkedSub':linkedSub}:{})}}},
  {ConditionCheck:{TableName:table('counters'),Key:{counterId:canonicalRaagaContactGuardId(guardian.email,'sruti')},
   ConditionExpression:'personId=:person AND familyId=:family AND institutionId=:inst',
   ExpressionAttributeValues:{':person':guardian.personId,':family':reg.familyId,':inst':'sruti'}}}
 ];
 const ops={
  contact:async(email:string)=>(await db.send(new GetCommand({TableName:table('counters'),Key:{counterId:canonicalRaagaContactGuardId(email,'sruti')},ConsistentRead:true}))).Item??null,
  listByEmail:async(email:string)=>{
   const res=await cognito.send(new ListUsersCommand({UserPoolId:pool(),Filter:`email = "${email}"`,Limit:20}));
   const users=(res.Users??[]).filter((user:any)=>String(user.Attributes?.find((a:any)=>a.Name==='email')?.Value||'').trim().toLowerCase()===email);
   return {count:users.length,paginated:Boolean(res.PaginationToken),users};
  },
  linkExistingAccount:async(reg:any,guardian:any,actor:string,user:any,email:string,ts:string)=>{
   const attrs=user?.Attributes??[];
   const sub=String(attrs.find((a:any)=>a.Name==='sub')?.Value||'');
   const verifiedEmail=String(attrs.find((a:any)=>a.Name==='email')?.Value||'').trim().toLowerCase();
   if(user?.Enabled!==true||user.UserStatus!=='CONFIRMED'||attrs.find((a:any)=>a.Name==='email_verified')?.Value!=='true'||
     verifiedEmail!==email||!user.Username||!/^[A-Za-z0-9-]{8,128}$/.test(sub)||!Number.isSafeInteger(guardian.version))return null;
   const identityGuardId=guardianInstitutionGuardId(sub,'sruti'),legacyGuardId=cognitoSubjectGuardId(sub);
   const [identityGuardResult,legacyGuardResult]=await Promise.all([
    db.send(new GetCommand({TableName:table('counters'),Key:{counterId:identityGuardId},ConsistentRead:true})),
    db.send(new GetCommand({TableName:table('counters'),Key:{counterId:legacyGuardId},ConsistentRead:true}))
   ]);
   const identityGuard=identityGuardResult.Item,legacyGuard=legacyGuardResult.Item;
   if(identityGuard&&identityGuard.personId!==guardian.personId)return null;
   if(legacyGuard&&legacyGuard.personId!==guardian.personId){
    const owner=(await db.send(new GetCommand({TableName:table('people'),Key:{personId:legacyGuard.personId},ConsistentRead:true}))).Item;
    if(!owner||owner.status!=='active'||!owner.personTypes?.includes('guardian')||
      String(owner.email||'').trim().toLowerCase()!==email||!Array.isArray(owner.institutionIds)||owner.institutionIds.includes('sruti'))return null;
   }
   const writes:any[]=[
    {Update:{TableName:table('registrations'),Key:{registrationId:reg.registrationId},
     UpdateExpression:'SET provisioningStatus=:linked,parentAccountSub=:sub,parentAccountUsername=:username,parentAccountEmail=:email,provisioningUpdatedAt=:now,updatedAt=:now',
     ConditionExpression:'provisioningStatus=:not AND familyId=:family AND institutionId=:inst AND importStatus=:imported AND attribute_not_exists(parentAccountSub)',
     ExpressionAttributeValues:{':linked':'EXISTING_ACCOUNT_LINKED',':not':'NOT_INVITED',':family':reg.familyId,':inst':'sruti',':imported':'imported',':sub':sub,':username':user.Username,':email':email,':now':ts}}},
    {Update:{TableName:table('people'),Key:{personId:guardian.personId},
     UpdateExpression:'SET cognitoSub=:sub,updatedAt=:now,#version=:next',
     ConditionExpression:'attribute_exists(personId) AND email=:email AND familyId=:family AND #status=:active AND contains(institutionIds,:inst) AND contains(personTypes,:guardian) AND attribute_not_exists(cognitoSub) AND #version=:previous',
     ExpressionAttributeNames:{'#status':'status','#version':'version'},
     ExpressionAttributeValues:{':sub':sub,':now':ts,':next':guardian.version+1,':email':email,':family':reg.familyId,':active':'active',':inst':'sruti',':guardian':'guardian',':previous':guardian.version}}},
    {Put:{TableName:table('counters'),Item:{counterId:identityGuardId,personId:guardian.personId,institutionId:'sruti',sequenceType:'COGNITO_SUB_GUARD',createdAt:ts},ConditionExpression:'attribute_not_exists(counterId)'}},
    {Put:{TableName:table('audit'),Item:{auditId:`parent_existing_${randomUUID()}`,institutionId:'sruti',actorCognitoSub:actor,
     action:'VERIFIED_EXISTING_PARENT_ACCOUNT_LINKED',resourceType:'person',resourceId:guardian.personId,result:'success',timestamp:ts,schemaVersion:1},ConditionExpression:'attribute_not_exists(auditId)'}}
   ];
   if(!legacyGuard)writes.splice(2,0,{Put:{TableName:table('counters'),Item:{counterId:legacyGuardId,personId:guardian.personId,institutionId:'sruti',sequenceType:'COGNITO_SUB_GUARD',createdAt:ts},ConditionExpression:'attribute_not_exists(counterId)'}});
   await db.send(new TransactWriteCommand({TransactItems:writes}));
   return {status:'EXISTING_ACCOUNT_LINKED',invitationSent:false,guardianAccessGranted:false,
    message:'The verified existing parent account is linked to the approved Sruti family. No invitation email was sent.'};
  },
  reserveInvite:(reg:any,guardian:any,actor:string,op:string,ts:string)=>db.send(new TransactWriteCommand({TransactItems:[
   {Update:{TableName:table('registrations'),Key:{registrationId:reg.registrationId},
    UpdateExpression:'SET provisioningStatus=:creating,invitationOperationId=:op,invitationRequestedAt=:now,updatedAt=:now',
    ConditionExpression:'provisioningStatus=:not AND familyId=:family AND institutionId=:institution AND importStatus=:imported AND attribute_not_exists(parentAccountSub) AND attribute_not_exists(invitationOperationId)',
    ExpressionAttributeValues:{':creating':'INVITATION_CREATING',':not':'NOT_INVITED',':op':op,':now':ts,':family':reg.familyId,':institution':'sruti',':imported':'imported'}}},
   {Put:{TableName:table('audit'),Item:{auditId:`parent_invite_${op}`,institutionId:'sruti',actorCognitoSub:actor,
    action:'PARENT_INVITATION_REQUESTED',resourceType:'registration',resourceId:reg.registrationId,result:'requested',timestamp:ts,schemaVersion:1},ConditionExpression:'attribute_not_exists(auditId)'}},
   {Put:{TableName:table('counters'),Item:parentEmailRouteRecord(reg,guardian,ts),ConditionExpression:'attribute_not_exists(counterId)'}},
    ...identityConditions(guardian,reg)
  ]})),
  createUser:(username:string,email:string,name:string)=>cognito.send(new AdminCreateUserCommand({UserPoolId:pool(),Username:username,
   UserAttributes:[{Name:'email',Value:email},{Name:'name',Value:name}],DesiredDeliveryMediums:['EMAIL']})).then((x:any)=>x.User),
  completeInvite:(reg:any,op:string,username:string,email:string,sub:string,ts:string)=>db.send(new UpdateCommand({TableName:table('registrations'),Key:{registrationId:reg.registrationId},
   UpdateExpression:'SET provisioningStatus=:sent,parentAccountSub=:sub,parentAccountUsername=:username,parentAccountEmail=:email,provisioningUpdatedAt=:now,parentInvitationLastSentAt=:now,updatedAt=:now',
   ConditionExpression:'provisioningStatus=:creating AND invitationOperationId=:op AND familyId=:family AND institutionId=:inst AND importStatus=:imported',
   ExpressionAttributeValues:{':sent':'INVITATION_SENT',':creating':'INVITATION_CREATING',':op':op,':sub':sub,':username':username,':email':email,':now':ts,':family':reg.familyId,':inst':'sruti',':imported':'imported'}})),
  getUser:(username:string)=>cognito.send(new AdminGetUserCommand({UserPoolId:pool(),Username:username})),
  reserveResend:(reg:any,guardian:any,actor:string,op:string,ts:string,threshold:string)=>db.send(new TransactWriteCommand({TransactItems:[
   {Update:{TableName:table('registrations'),Key:{registrationId:reg.registrationId},
    UpdateExpression:'SET parentInvitationAttemptAt=:now,parentInvitationOperationId=:op,parentInvitationAttemptBy=:actor',
    ConditionExpression:'provisioningStatus=:sent AND familyId=:family AND parentAccountSub=:sub AND parentAccountUsername=:username AND parentAccountEmail=:email AND (attribute_not_exists(parentInvitationAttemptAt) OR parentInvitationAttemptAt < :threshold)',
    ExpressionAttributeValues:{':sent':'INVITATION_SENT',':family':reg.familyId,':sub':reg.parentAccountSub,':username':reg.parentAccountUsername,':email':guardian.email,':now':ts,':threshold':threshold,':op':op,':actor':actor}}},
   {Put:{TableName:table('audit'),Item:{auditId:`parent_resend_${op}`,institutionId:'sruti',actorCognitoSub:actor,
    action:'PARENT_INVITATION_RESEND_REQUESTED',resourceType:'registration',resourceId:reg.registrationId,result:'requested',timestamp:ts,schemaVersion:1},ConditionExpression:'attribute_not_exists(auditId)'}},
   {
      Update: {
        TableName: table('counters'),
        Key: {
          counterId: parentEmailRouteRecord(reg, guardian, ts).counterId
        },
        UpdateExpression:
          'SET sequenceType=:type,institutionId=:inst,' +
          'registrationId=:reg,familyId=:family,' +
          'recipientEmail=:email,#status=:pending,' +
          'createdAt=if_not_exists(createdAt,:now)',
        ConditionExpression:
          'attribute_not_exists(counterId) OR ' +
          '(sequenceType=:type AND institutionId=:inst ' +
          'AND registrationId=:reg AND familyId=:family ' +
          'AND recipientEmail=:email AND #status=:pending)',
        ExpressionAttributeNames: {'#status': 'status'},
        ExpressionAttributeValues: {
          ':type': 'PARENT_EMAIL_ROUTE',
          ':inst': reg.institutionId,
          ':reg': reg.registrationId,
          ':family': reg.familyId,
          ':email': guardian.email.trim().toLowerCase(),
          ':pending': 'pending',
          ':now': ts
        }
      }
    },
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
