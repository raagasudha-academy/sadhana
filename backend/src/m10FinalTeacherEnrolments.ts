/** Read-only canonical enrolment compatibility. Teacher sees only assigned classes. */
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,ScanCommand} from '@aws-sdk/lib-dynamodb';
import {entityTable} from './m10EntityTables.mjs';
import {projectM10Directory} from './m10CoreDirectoryProjection.mjs';
import type {InstitutionId} from './model.ts';

type Item=Record<string,unknown>;
type Client={send:(command:any)=>Promise<any>};
export function makeM10FinalTeacherEnrolments(client:Client){
 return async(inst:InstitutionId,assignedClassIds:ReadonlySet<string>):Promise<{records:Item[]}>=>{
  if(inst!=='raaga'&&inst!=='sruti')throw Error('M10_INVALID_INSTITUTION');
  if(!assignedClassIds.size)return {records:[]};
  const rows:Item[]=[];
  let cursor:Record<string,unknown>|undefined;
  do {
   const page=await client.send(new ScanCommand({TableName:entityTable('enrolments'),ConsistentRead:true,Limit:200,ExclusiveStartKey:cursor}));
   rows.push(...(page.Items??[]));cursor=page.LastEvaluatedKey;
   if(rows.length>3000)throw Error('M10_TEACHER_ENROLMENT_READ_LIMIT');
  }while(cursor);
  const projected=projectM10Directory('enrolments',rows,inst).records;
  return {records:projected.filter((row:any)=>assignedClassIds.has(row.classId)).map((row:any)=>({
   id:row.id,studentId:row.studentId,classId:row.classId,startDate:row.startDate,
   endDate:row.endDate??'',archived:row.archived===true
  }))};
 };
}
let cached:ReturnType<typeof makeM10FinalTeacherEnrolments>|undefined;
export function finalTeacherEnrolments(){
 if(!cached)cached=makeM10FinalTeacherEnrolments(DynamoDBDocumentClient.from(new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'})));
 return cached;
}
