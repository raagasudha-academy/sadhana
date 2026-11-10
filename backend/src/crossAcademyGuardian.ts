/** Cross-academy relationship evidence creates PENDING Sruti requests only. */
import {QueryCommand,GetCommand} from '@aws-sdk/lib-dynamodb';
import {makeRoutedClient} from './tableRouter.ts';
import {demandInstitution,httpError} from './model.ts';
import type {Claims} from './model.ts';
import {isAccountSubject,isStudentRecordId} from './accessRules.ts';
import {requestStudentAccess} from './familyAccess.ts';
const db=makeRoutedClient();
const table=()=>{if(!process.env.SADHANA_TABLE_NAME)throw Error('Missing table');return process.env.SADHANA_TABLE_NAME};
async function enrolledInSruti(id:string){
 let next:any;do{const r=await db.send(new QueryCommand({TableName:table(),KeyConditionExpression:'PK=:pk',ExpressionAttributeValues:{':pk':'OPS#sruti#ENROLMENT'},ExclusiveStartKey:next,Limit:100,ConsistentRead:true}));if((r.Items||[]).some(e=>e.studentId===id&&!e.archived))return true;next=r.LastEvaluatedKey;}while(next);
 return false;
}
export async function srutiGuardianCandidates(claims:Claims){
 demandInstitution(claims,'sruti');
 let next:any;const found:any[]=[];
 do{const r=await db.send(new QueryCommand({TableName:table(),IndexName:'GSI1',KeyConditionExpression:'GSI1PK=:pk',ExpressionAttributeValues:{':pk':'ACCESS_REQUEST#raaga'},ExclusiveStartKey:next,Limit:100}));
 for(const x of r.Items||[]){if(x.kind==='guardian'&&x.status==='approved'&&isAccountSubject(x.subject)&&isStudentRecordId(x.studentId)&&await enrolledInSruti(x.studentId))found.push({studentId:x.studentId,subject:x.subject});}
 next=r.LastEvaluatedKey;if(found.length>100)throw httpError(413,'Too many guardian candidates');
 }while(next);
 return {records:found};
}
export async function requestSrutiGuardianFromRaaga(claims:Claims,body:any){
 demandInstitution(claims,'sruti');
 if(!body||Object.keys(body).some(k=>!['studentId','subject'].includes(k))||!isStudentRecordId(body.studentId)||!isAccountSubject(body.subject))throw httpError(400,'Invalid student or guardian account');
 const prior=(await db.send(new GetCommand({TableName:table(),Key:{PK:`ACCESS#raaga#${body.subject}`,SK:`STUDENT#${body.studentId}`},ConsistentRead:true}))).Item;
 if(!prior||prior.status!=='approved'||prior.kind!=='guardian'||prior.institution!=='raaga'||prior.studentId!==body.studentId)throw httpError(403,'No approved Raagasudha guardian relationship for this exact account and student');
 if(!await enrolledInSruti(body.studentId))throw httpError(409,'Student has no Sruti enrollment');
 // Re-verify in the same authorized request; the Sruti approval is a separate review action.
 return requestStudentAccess('sruti',claims,{studentId:body.studentId,kind:'guardian',beneficiarySubject:body.subject});
}
