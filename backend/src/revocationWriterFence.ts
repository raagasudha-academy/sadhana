/** Conditional read barrier for writes that add or edit student dependencies.
 * Versioned ConditionCheck shares the identity item with the revocation fence.
 * The coordinator must write the fence BEFORE its dependency scan.
 */
import {GetCommand} from '@aws-sdk/lib-dynamodb';
export const DEPENDENT_WRITER_KINDS=['enrolment','attendance','practice','feedback','rsvp'] as const;
export async function dependentStudentGuard(db:any,table:string,studentId:unknown){
 if(typeof studentId!=='string'||!/^STUDENT-[A-Za-z0-9-]{1,100}$/.test(studentId))
  throw Object.assign(new Error('Valid student ID required.'),{status:400});
 const Key={PK:'OPS#GLOBAL#STUDENT',SK:`ITEM#${studentId}`};
 const identity=(await db.send(new GetCommand({TableName:table,Key,ConsistentRead:true}))).Item;
 if(!identity||identity.id!==studentId||!Number.isSafeInteger(identity.version))
  throw Object.assign(new Error('Student identity is missing or unversioned.'),{status:409});
 if(identity.revocationState||identity.revocationOperationId)
  throw Object.assign(new Error('Student revocation in progress; dependent write blocked.'),{status:409});
 return {ConditionCheck:{TableName:table,Key,
  ConditionExpression:'attribute_exists(PK) AND #v=:v AND attribute_not_exists(revocationState) AND attribute_not_exists(revocationOperationId)',
  ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':v':identity.version}}};
}
