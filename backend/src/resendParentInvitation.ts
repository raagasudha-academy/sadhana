/** Explicit admin-only invitation resend. Never creates or deletes a Cognito user. */
import {CognitoIdentityProviderClient,AdminGetUserCommand,AdminCreateUserCommand} from '@aws-sdk/client-cognito-identity-provider';
import {DynamoDBDocumentClient,GetCommand,UpdateCommand} from '@aws-sdk/lib-dynamodb';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {makeRoutedClient} from './tableRouter.ts';

const db=makeRoutedClient();
const cognito=new CognitoIdentityProviderClient({});
const table=()=>{const x=process.env.SADHANA_TABLE_NAME;if(!x)throw new Error('SADHANA_TABLE_NAME missing');return x;};
const pool=()=>{const x=process.env.SADHANA_COGNITO_USER_POOL_ID;if(!x)throw new Error('SADHANA_COGNITO_USER_POOL_ID missing');return x;};
const key=(id:string)=>({PK:'OPS#GLOBAL#WEB_IMPORT',SK:`ITEM#${id}`});
const fail=(status:number,message:string)=>Object.assign(new Error(message),{status});
const attr=(attrs:readonly {Name?:string;Value?:string}[]|undefined,name:string)=>attrs?.find(x=>x.Name===name)?.Value||'';
const COOLDOWN_MS=60_000;
/** Caller is checked for administrator role by the website-registration route in lambda.ts. */
export async function resendParentInvitation(registrationId:string,actorSub:string){
 if(!/^RS-[A-Za-z0-9_-]{1,110}$/.test(registrationId))throw fail(400,'Invalid registration ID');
 if(process.env.SADHANA_PARENT_PROVISIONING_ENABLED!=='true')throw fail(409,'Parent invitation processing is disabled');
 const initial=(await db.send(new GetCommand({TableName:table(),Key:key(registrationId),ConsistentRead:true}))).Item;
 if(!initial||initial.parentAccessStatus!=='INVITATION_SENT'||!initial.parentAccountUsername||!initial.parentAccountEmail||!initial.parentAccountSub)
   throw fail(409,'No pending parent invitation to resend. Use initial provisioning or administrator review.');
 // Never trust a client-supplied email or username. Revalidate Cognito identity and activation state.
 const user=await cognito.send(new AdminGetUserCommand({UserPoolId:pool(),Username:initial.parentAccountUsername}));
 if(user.UserStatus!=='FORCE_CHANGE_PASSWORD'||!user.Enabled)
   throw fail(409,'Parent account is already active or disabled; use account recovery or restore access instead.');
 if(attr(user.UserAttributes,'email').toLowerCase()!==String(initial.parentAccountEmail).toLowerCase()||
    attr(user.UserAttributes,'sub')!==initial.parentAccountSub)
   throw fail(409,'Cognito identity no longer matches the registration. Manual review required.');
 const now=Date.now(),timestamp=new Date(now).toISOString(),threshold=new Date(now-COOLDOWN_MS).toISOString();
 const operationId=`resend-${crypto.randomUUID()}`;
 try{
  await db.send(new UpdateCommand({TableName:table(),Key:key(registrationId),
   UpdateExpression:'SET parentInvitationAttemptAt=:now,parentInvitationOperationId=:op,parentInvitationAttemptBy=:actor',
   ConditionExpression:'parentAccessStatus=:invited AND parentAccountUsername=:username AND parentAccountSub=:sub AND (attribute_not_exists(parentInvitationAttemptAt) OR parentInvitationAttemptAt < :threshold)',
   ExpressionAttributeValues:{':now':timestamp,':op':operationId,':actor':actorSub,':invited':'INVITATION_SENT',':username':initial.parentAccountUsername,':sub':initial.parentAccountSub,':threshold':threshold}}));
 }catch(e:any){if(e?.name==='ConditionalCheckFailedException')throw fail(429,'Invitation was recently requested or account changed. Wait one minute and refresh.');throw e;}
 try{
  await cognito.send(new AdminCreateUserCommand({UserPoolId:pool(),Username:initial.parentAccountUsername,MessageAction:'RESEND',DesiredDeliveryMediums:['EMAIL']}));
  await db.send(new UpdateCommand({TableName:table(),Key:key(registrationId),
   UpdateExpression:'SET parentInvitationLastResentAt=:now,parentInvitationLastResentBy=:actor',
   ConditionExpression:'parentInvitationOperationId=:op',
   ExpressionAttributeValues:{':now':new Date().toISOString(),':actor':actorSub,':op':operationId}}));
  return {status:'INVITATION_SENT',message:'Cognito accepted the resend request. Email delivery is not guaranteed.',requestedAt:timestamp};
 }catch(e:any){
  // Release the attempt timestamp after an AWS failure so admins can retry; retain audit metadata.
  try{await db.send(new UpdateCommand({TableName:table(),Key:key(registrationId),
   UpdateExpression:'REMOVE parentInvitationAttemptAt SET parentInvitationLastError=:reason',
   ConditionExpression:'parentInvitationOperationId=:op',
   ExpressionAttributeValues:{':op':operationId,':reason':String(e?.name||'Unknown').slice(0,100)}}));}catch{ /* keep original error */ }
  throw e;
 }
}
