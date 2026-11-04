/** Optional M9 learner dashboard read adapter. Never reads the legacy PK/SK tables.
 * No writes are offered; all access is resolved from verified Cognito subject IDs
 * and independently approved, strongly re-checked family links.
 */
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,QueryCommand} from '@aws-sdk/lib-dynamodb';
import {httpError} from './model.ts';
import type {Claims,InstitutionId} from './model.ts';
import {matchingCognitoPerson,authorisedStudent,projectLearnerDashboard} from './m9FinalAccessCore.mjs';

export interface M9FinalDb {send(command:any):Promise<any>}
const table=(entity:string)=>`sadhana-dev-m9-${entity}`;
const MAX_ITEMS=2000;
const ukToday=()=>{
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const get=(name:string)=>parts.find(p=>p.type===name)?.value||'';
 return `${get('year')}-${get('month')}-${get('day')}`;
};
export function makeM9FinalLearner(db:M9FinalDb){
 async function query(entity:string,index:string,key:string,value:string){
  const items:Record<string,any>[]=[];let cursor:Record<string,any>|undefined;
  do{
   const r=await db.send(new QueryCommand({TableName:table(entity),IndexName:index,KeyConditionExpression:'#pk = :value',ExpressionAttributeNames:{'#pk':key},ExpressionAttributeValues:{':value':value},Limit:100,ExclusiveStartKey:cursor}));
   items.push(...(r.Items??[]));cursor=r.LastEvaluatedKey;
   if(items.length>MAX_ITEMS)throw httpError(413,'Too many learning records.');
  }while(cursor);
  return items;
 }
 const get=async(entity:string,key:string,value:string)=>(await db.send(new GetCommand({TableName:table(entity),Key:{[key]:value},ConsistentRead:true}))).Item??null;
 return {
  async dashboard(institution:InstitutionId,claims:Claims,studentId:string){
   if(process.env.M9_FINAL_LEARNER_READS!=='enabled')throw httpError(404,'M9 learner integration disabled.');
   if(!['raaga','sruti'].includes(institution)||!claims.sub||typeof studentId!=='string'||!/^[-_a-zA-Z0-9]{4,150}$/.test(studentId))throw httpError(403,'Approved student access required.');
   const identities=await query('people','CognitoIdentityIndex','cognitoSub',claims.sub);
   const actor=matchingCognitoPerson(identities,claims.sub,institution);
   if(!actor)throw httpError(403,'A verified portal identity is required.');
   // Use strong base reads so a revoked link cannot survive a stale GSI projection.
   const activeActor=await get('people','personId',actor.personId);
   if(!activeActor||activeActor.cognitoSub!==claims.sub||activeActor.status!=='active'||!activeActor.institutionIds?.includes(institution))throw httpError(403,'A verified portal identity is required.');
   const student=await get('people','personId',studentId);
   let links:Record<string,any>[]=[];
   if(activeActor.personId!==studentId){
    const candidates=await query('family-links','GuardianAccessIndex','guardianPersonId',activeActor.personId);
    links=await Promise.all(candidates.filter(x=>x.studentId===studentId&&x.institutionId===institution).map(x=>get('family-links','linkId',x.linkId)));
    links=links.filter(Boolean);
   }
   authorisedStudent(activeActor,student,links,institution);
   const enrollments=(await query('enrolments','StudentEnrolmentsIndex','studentId',studentId)).filter(x=>x.institutionId===institution&&x.status==='active');
   const classIds=[...new Set(enrollments.map(x=>x.classId).filter(Boolean))];
   if(classIds.length>100)throw httpError(413,'Too many class enrolments.');
   const classes=(await Promise.all(classIds.map(id=>get('classes','classId',id)))).filter((x):x is Record<string,any>=>!!x&&x.institutionId===institution);
   const allowedClassIds=new Set(classes.map(x=>x.classId));
   const validEnrollment=enrollments.filter(x=>allowedClassIds.has(x.classId));
   const sessionRows=(await Promise.all(classIds.filter(id=>allowedClassIds.has(id)).map(id=>query('sessions','ClassSessionsIndex','classId',id)))).flat();
   const sessions=sessionRows.filter(x=>x.institutionId===institution&&x.recordType==='class-session').map(s=>({
    ...s,date:s.localDate||s.legacyPayload?.date,startTime:s.localStartTime||s.legacyPayload?.startTime,
    status:s.legacyPayload?.status||s.status,additionalSession:s.legacyPayload?.additionalSession===true
   }));
   const [practice,attendance,rsvps]=await Promise.all([
    query('practice','StudentPracticeIndex','studentId',studentId),
    query('attendance','StudentAttendanceIndex','studentId',studentId),
    query('rsvps','StudentResponsesIndex','studentId',studentId)
   ]);
   return projectLearnerDashboard(student,validEnrollment,classes,sessions,
    practice.filter(x=>x.institutionId===institution),attendance.filter(x=>x.institutionId===institution),
    rsvps.filter(x=>x.institutionId===institution),ukToday(),institution);
  }
 };
}
let instance:ReturnType<typeof makeM9FinalLearner>|undefined;
export function m9FinalLearner(){return instance??=makeM9FinalLearner(DynamoDBDocumentClient.from(new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'}),{marshallOptions:{removeUndefinedValues:true}}));}
