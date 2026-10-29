/** Durable, conditional identity fence for website-import revocation.
 * This is independently testable and deliberately does not execute deletion.
 */
import {TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
export type FenceStudent={id:string;version:number;sourceWebsiteRegistrationId:string;familyId:string};
export const identityKey=(id:string)=>({PK:'OPS#GLOBAL#STUDENT',SK:`ITEM#${id}`});
export const journalKey=(id:string)=>({PK:'OPS#GLOBAL#WEB_IMPORT',SK:`REVOKE#${id}`});
const failure=(message:string)=>Object.assign(new Error(message),{status:409});
export function assertFenceStudents(registrationId:string,familyId:string,students:FenceStudent[]){
 if(!/^RS-[A-Za-z0-9_-]{1,110}$/.test(registrationId)||!familyId||!students.length||students.length>20)throw failure('Invalid revocation fence scope');
 if(new Set(students.map(s=>s.id)).size!==students.length)throw failure('Duplicate student identity');
 for(const s of students){if(!/^STUDENT-[A-Za-z0-9-]{1,100}$/.test(s.id)||s.sourceWebsiteRegistrationId!==registrationId||s.familyId!==familyId||!Number.isSafeInteger(s.version)||s.version<1)throw failure('Unverified student identity or version');}
}
export function acquireFenceTransaction(table:string,registrationId:string,familyId:string,students:FenceStudent[],operationId:string,actorSub:string,now:string,previousReleasedOperationId?:string){
 assertFenceStudents(registrationId,familyId,students);
 if(!operationId||!actorSub)throw failure('Missing revocation operation identity');
 return new TransactWriteCommand({ClientRequestToken:operationId.slice(0,36),TransactItems:[
  {Put:{TableName:table,Item:{...journalKey(registrationId),registrationId,operationId,actorSub,status:'fenced',familyId,studentVersions:Object.fromEntries(students.map(s=>[s.id,s.version])),createdAt:now},
   ...(previousReleasedOperationId?{ConditionExpression:'#st=:released AND operationId=:previous',ExpressionAttributeNames:{'#st':'status'},ExpressionAttributeValues:{':released':'released',':previous':previousReleasedOperationId}}:{ConditionExpression:'attribute_not_exists(PK)'})}},
  ...(previousReleasedOperationId?[{Put:{TableName:table,Item:{PK:'AUDIT#raaga',SK:`AT#${now}#${operationId}#RETRY`,entityType:'AUDIT',type:'WEBSITE_IMPORT_REVOKE_RETRY',registrationId,previousReleasedOperationId,operationId,actorSub,at:now},ConditionExpression:'attribute_not_exists(PK)'}}]:[]),
  ...students.map(s=>({Update:{TableName:table,Key:identityKey(s.id),UpdateExpression:'SET revocationState=:state, revocationOperationId=:op, #v=:next',ConditionExpression:'sourceWebsiteRegistrationId=:source AND familyId=:fam AND #v=:previous AND attribute_not_exists(revocationState) AND attribute_not_exists(revocationOperationId)',ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':state':'fenced',':op':operationId,':next':s.version+1,':source':registrationId,':fam':familyId,':previous':s.version}}}))
 ]});
}
export function releaseFenceTransaction(table:string,registrationId:string,students:FenceStudent[],operationId:string){
 return new TransactWriteCommand({TransactItems:[
  ...students.map(s=>({Update:{TableName:table,Key:identityKey(s.id),UpdateExpression:'SET #v=:next REMOVE revocationState, revocationOperationId',ConditionExpression:'revocationState=:state AND revocationOperationId=:op AND #v=:previous',ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':state':'fenced',':op':operationId,':previous':s.version+1,':next':s.version+2}}})),
  {Update:{TableName:table,Key:journalKey(registrationId),UpdateExpression:'SET #status=:released',ConditionExpression:'operationId=:op AND #status=:fenced',ExpressionAttributeNames:{'#status':'status'},ExpressionAttributeValues:{':released':'released',':fenced':'fenced',':op':operationId}}}
 ]});
}
