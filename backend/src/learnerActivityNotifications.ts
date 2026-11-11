/** Persist learner-facing activity notifications in the existing notifications entity. */
import {randomUUID} from 'node:crypto';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,QueryCommand,PutCommand} from '@aws-sdk/lib-dynamodb';
import {entityTable} from './entityTables.mjs';
import type {InstitutionId} from './model.ts';

type DB={send:(command:any)=>Promise<any>};
type Activity={institution:InstitutionId;classIds?:string[];title:string;detail:string;category:'Homework'|'Schedule'|'Resources';resourceId:string};

export function makeLearnerActivityNotifications(db:DB){
 const table=()=>entityTable('notifications');
 async function notify(activity:Activity){
  const ids=new Set<string>();
  for(const classId of [...new Set(activity.classIds||[])]){
   let cursor:any;
   do{
    const page=await db.send(new QueryCommand({TableName:entityTable('enrolments'),IndexName:'ClassEnrolmentsIndex',KeyConditionExpression:'classId=:classId',ExpressionAttributeValues:{':classId':classId},Limit:100,ExclusiveStartKey:cursor}));
    for(const enrolment of page.Items||[])if(enrolment.institutionId===activity.institution&&enrolment.status==='active'&&enrolment.archived!==true&&typeof enrolment.studentId==='string')ids.add(enrolment.studentId);
    cursor=page.LastEvaluatedKey;
   }while(cursor);
  }
  const now=new Date().toISOString();
  for(const recipientPersonId of ids){
   const item={notificationId:`NOTIFICATION-${randomUUID()}`,recordType:'learner-activity',institutionId:activity.institution,recipientPersonId,
    title:activity.title.slice(0,120),detail:activity.detail.slice(0,300),category:activity.category,resourceId:activity.resourceId,
    createdAt:now,read:false};
   await db.send(new PutCommand({TableName:table(),Item:item,ConditionExpression:'attribute_not_exists(notificationId)'}));
  }
  return {recipients:ids.size};
 }
 return {notify};
}
let singleton:ReturnType<typeof makeLearnerActivityNotifications>|undefined;
export function learnerActivityNotifications(){return singleton??=makeLearnerActivityNotifications(DynamoDBDocumentClient.from(new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'}),{marshallOptions:{removeUndefinedValues:true}}));}
