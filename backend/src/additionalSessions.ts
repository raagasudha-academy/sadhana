/** Additional sessions for an existing master class. Never edits recurrence rules. */
import {randomUUID} from 'node:crypto';
import {GetCommand,QueryCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {makeRoutedClient} from './tableRouter.ts';
import {httpError,permittedInstitutions,demandViewInstitution} from './model.ts';
import type {Claims,InstitutionId} from './model.ts';
import {myTeacherIdentity} from './teacherDirectory.ts';
import {schedulePK,scheduleSK} from './scheduleModel.ts';
const db=makeRoutedClient();
const table=()=>{if(!process.env.SADHANA_TABLE_NAME)throw Error('Missing DynamoDB table');return process.env.SADHANA_TABLE_NAME;};
const dateRe=/^\d{4}-\d{2}-\d{2}$/;
const timeRe=/^([01]\d|2[0-3]):[0-5]\d$/;
const dateValid=(value:unknown):value is string=>typeof value==='string'&&dateRe.test(value)&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const timeValid=(s:unknown):s is string=>typeof s==='string'&&timeRe.test(s);
export function validateAdditionalSessionRows(input:unknown){
 if(!Array.isArray(input)||input.length<1||input.length>20)throw httpError(400,'Choose 1 to 20 additional sessions.');
 const keys=new Set<string>();
 return input.map((r:any)=>{
  if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).some(k=>!['date','startTime','endTime'].includes(k)))throw httpError(400,'Invalid additional session fields.');
  if(!dateValid(r.date)||!timeValid(r.startTime)||!timeValid(r.endTime)||r.startTime>=r.endTime)throw httpError(400,'Each session needs a valid date and same-day time range.');
  const key=`${r.date}|${r.startTime}|${r.endTime}`;
  if(keys.has(key))throw httpError(409,'The proposed sessions contain a duplicate.');keys.add(key);
  return {date:r.date as string,startTime:r.startTime as string,endTime:r.endTime as string};
 });
}
export async function createAdditionalSessions(inst:InstitutionId,claims:Claims,body:Record<string,unknown>){
 demandViewInstitution(claims,inst);
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['classId','sessions'].includes(k)))throw httpError(400,'Unexpected additional session fields.');
 if(typeof body.classId!=='string'||!/^CLASS-[-a-zA-Z0-9]{4,85}$/.test(body.classId))throw httpError(400,'Choose an existing master class.');
 const entries=validateAdditionalSessionRows(body.sessions);
 const admin=permittedInstitutions(claims).includes(inst);
 const identity=admin?null:await myTeacherIdentity(inst,claims);
 if(!admin&&(!identity?.linked||!identity.teacherId))throw httpError(403,'Verified teacher identity required.');
 const masterKey={PK:schedulePK(inst),SK:scheduleSK(body.classId)};
 const master=(await db.send(new GetCommand({TableName:table(),Key:masterKey,ConsistentRead:true}))).Item;
 if(!master||master.recordType!=='class'||master.institution!==inst)throw httpError(404,'Master class not found in this academy.');
 if(master.lifecycleStatus==='archived'||master.status==='cancelled')throw httpError(409,'This master class is not active.');
 if(!master.teacherId)throw httpError(409,'Link the master class to a registered teacher first.');
 if(!admin&&master.teacherId!==identity!.teacherId)throw httpError(403,'You may add sessions only to your assigned master classes.');
 const existing:any[]=[];let cursor:Record<string,unknown>|undefined;
 do{const result=await db.send(new QueryCommand({TableName:table(),KeyConditionExpression:'PK=:pk',ExpressionAttributeValues:{':pk':schedulePK(inst)},ExclusiveStartKey:cursor,Limit:250,ConsistentRead:true}));existing.push(...(result.Items||[]));cursor=result.LastEvaluatedKey;if(existing.length>5000)throw httpError(413,'Too many calendar records.');}while(cursor);
 const duplicate=entries.some(row=>existing.some(s=>s.recordType==='class-session'&&s.classId===master.id&&s.status!=='cancelled'&&s.date===row.date&&s.startTime===row.startTime&&s.endTime===row.endTime));
 if(duplicate)throw httpError(409,'An existing session already has the same date and time for this class. Refresh the calendar.');
 const now=new Date().toISOString();
 const sessions=entries.map(row=>({id:`EVT-${randomUUID()}`,recordType:'class-session',classId:master.id,institution:inst,name:master.name,programme:master.programme,teacher:master.teacher,teacherId:master.teacherId,mode:master.mode,location:master.location,venueId:master.venueId||'',...row,endDate:row.date,allDay:false,timezone:'Europe/London',status:'confirmed',additionalSession:true,version:1,createdAt:now,updatedAt:now,createdBy:String(claims.sub)}));
 try{await db.send(new TransactWriteCommand({TransactItems:[{ConditionCheck:{TableName:table(),Key:masterKey,ConditionExpression:'#v=:version AND #type=:class AND teacherId=:teacher',ExpressionAttributeNames:{'#v':'version','#type':'recordType'},ExpressionAttributeValues:{':version':master.version,':class':'class',':teacher':master.teacherId}}},...sessions.map(session=>({Put:{TableName:table(),Item:{PK:schedulePK(inst),SK:scheduleSK(session.id),entityType:'schedule',...session},ConditionExpression:'attribute_not_exists(PK)'}}))]}));}
 catch(e){if((e as Error).name==='TransactionCanceledException')throw httpError(409,'Class changed while adding sessions. Nothing was created. Refresh and retry.');throw e;}
 return {records:sessions,count:sessions.length};
}
