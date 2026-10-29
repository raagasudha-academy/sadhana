/** v11 durable post-import parent access handoff. Does not grant access on email alone. */
import {GetCommand,UpdateCommand} from '@aws-sdk/lib-dynamodb';
import {makeRoutedClient} from './tableRouter.ts';
const db=makeRoutedClient();
const table=()=>{if(!process.env.SADHANA_TABLE_NAME)throw Error('SADHANA_TABLE_NAME missing');return process.env.SADHANA_TABLE_NAME;};
const key=(id:string)=>({PK:'OPS#GLOBAL#WEB_IMPORT',SK:`ITEM#${id}`});
export async function queueParentAccess(registrationId:string){
 const now=new Date().toISOString();
 try{
  await db.send(new UpdateCommand({TableName:table(),Key:key(registrationId),
   UpdateExpression:'SET parentAccessStatus=:queued, parentAccessUpdatedAt=:now',
   ConditionExpression:'attribute_exists(PK) AND attribute_not_exists(parentAccessStatus)',
   ExpressionAttributeValues:{':queued':'NOT_INVITED',':now':now}}));
 }catch(e:any){if(e?.name!=='ConditionalCheckFailedException')throw e;}
}
export async function getParentAccessStatus(registrationId:string){
 if(!/^RS-[A-Za-z0-9_-]{1,110}$/.test(registrationId))throw Object.assign(new Error('Invalid registration ID'),{status:400});
 const marker=(await db.send(new GetCommand({TableName:table(),Key:key(registrationId),ConsistentRead:true}))).Item;
 return {registrationId,imported:Boolean(marker),status:marker?.parentAccessStatus||'NOT_INVITED',updatedAt:marker?.parentAccessUpdatedAt||null};
}
