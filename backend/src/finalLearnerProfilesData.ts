/** Canonical DynamoDB/Cognito adapter for the existing learner extras/profile/
 * academy-directory endpoints. It never uses the PK/SK routed client.
 */
import {randomUUID,createHash} from 'node:crypto';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,QueryCommand,ScanCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {CognitoIdentityProviderClient,ListUsersInGroupCommand} from '@aws-sdk/client-cognito-identity-provider';
import {adminPhotoUrl,ownProfilePhoto} from './profilePhotos.ts';
import {entityTable} from './entityTables.mjs';
import {httpError} from './model.ts';
import {makeM10FinalLearnerProfiles} from './finalLearnerProfiles.mjs';

const validId=(id:unknown)=>typeof id==='string'&&/^[A-Za-z0-9_-]{4,150}$/.test(id);
const name=(p:any)=>String(p.displayName||p.legacyPayload?.displayName||p.legacyPayload?.name||[p.firstName,p.lastName].filter(Boolean).join(' ')).trim();
const adminGroup={raaga:'raagasudha-admin',sruti:'sruti-admin'};
export function makeM10FinalLearnerProfilesData(db:{send:(cmd:any)=>Promise<any>},cognito:{send:(cmd:any)=>Promise<any>},photos={adminPhotoUrl,ownProfilePhoto}){
 const get=async(entity:string,key:string,id:string)=>
  (await db.send(new GetCommand({TableName:entityTable(entity),Key:{[key]:id},ConsistentRead:true}))).Item??null;
 const query=async(entity:string,index:string,key:string,value:string)=>{
  const rows:any[]=[];let cursor:any;
  do{
   const r=await db.send(new QueryCommand({TableName:entityTable(entity),IndexName:index,
    KeyConditionExpression:'#key=:value',ExpressionAttributeNames:{'#key':key},ExpressionAttributeValues:{':value':value},Limit:100,ExclusiveStartKey:cursor}));
   rows.push(...(r.Items||[]));cursor=r.LastEvaluatedKey;
   if(rows.length>300)throw httpError(413,'Too many identity or enrolment records.');
  }while(cursor);
  return rows;
 };
 const scan=async(entity:'people'|'venues',max:number)=>{
  const rows:any[]=[];let cursor:any;
  do{
   const r=await db.send(new ScanCommand({TableName:entityTable(entity),ConsistentRead:true,Limit:200,ExclusiveStartKey:cursor}));
   rows.push(...(r.Items||[]));cursor=r.LastEvaluatedKey;
   if(rows.length>max)throw httpError(413,'Academy directory is too large.');
  }while(cursor);
  return rows;
 };
 const publicDirectory=async(inst:'raaga'|'sruti')=>{
  const [people,venues]=await Promise.all([scan('people',1500),scan('venues',500)]);
  const teachers=await Promise.all(people.filter(x=>x.status==='active'&&x.institutionIds?.includes(inst)&&x.personTypes?.includes('teacher')).map(async p=>{
   const publicId=/^TEACHER-[a-f0-9-]{36}$/i.test(p.legacyPayload?.id||'')?p.legacyPayload.id:undefined;
   const sub=typeof p.cognitoSub==='string'&&/^[0-9a-f-]{36}$/i.test(p.cognitoSub)?p.cognitoSub:'';
   return {name:name(p),subjects:(Array.isArray(p.legacyPayload?.subjects)?p.legacyPayload.subjects:[]).filter((s:unknown)=>typeof s==='string').slice(0,20),
    publicId,photoUrl:publicId&&sub?await photos.ownProfilePhoto(sub):''};
  }));
  const publishedVenues=venues.filter(v=>!['inactive','archived','deleted'].includes(v.status)&&v.legacyPayload?.active!==false).map(v=>({
   name:String(v.name||v.legacyPayload?.name||'').trim(),address:String(v.address||v.legacyPayload?.address||'').trim(),
   location:String(v.location||v.legacyPayload?.location||'').trim()
  })).filter(v=>v.name);
  const administrators:any[]=[];
  if(!process.env.SADHANA_COGNITO_USER_POOL_ID)throw httpError(503,'Administrator directory not configured.');
  let token:string|undefined;
  do{
   const r=await cognito.send(new ListUsersInGroupCommand({UserPoolId:process.env.SADHANA_COGNITO_USER_POOL_ID,
    GroupName:adminGroup[inst],Limit:60,...(token?{NextToken:token}:{})}));
   for(const user of r.Users||[]){
    if(user.Enabled===false)continue;
    const attr=(key:string)=>user.Attributes?.find((v:any)=>v.Name===key)?.Value?.trim()||'';
    const display=attr('name')||[attr('given_name'),attr('family_name')].filter(Boolean).join(' ');
    if(!display)continue;
    const sub=attr('sub'),validSub=/^[a-f0-9-]{36}$/i.test(sub);
    const publicId=validSub?`admin-${createHash('sha256').update(sub).digest('hex').slice(0,32)}`:undefined;
    administrators.push({name:display,publicId,photoUrl:validSub?await photos.adminPhotoUrl(sub,attr('picture')):''});
   }
   token=r.NextToken;
   if(administrators.length>500)throw httpError(413,'Administrator directory too large.');
  }while(token);
  const sorted=(a:any,b:any)=>a.name.localeCompare(b.name);
  return {institution:inst,administrators:administrators.sort(sorted),teachers:teachers.filter(t=>t.name).sort(sorted),venues:publishedVenues.sort(sorted)};
 };
 const io={
  identities:(subject:string)=>query('people','CognitoIdentityIndex','cognitoSub',subject),
  person:(id:string)=>get('people','personId',id),
  guardianCandidates:(id:string)=>query('family-links','GuardianAccessIndex','guardianPersonId',id),
  link:(id:string)=>get('family-links','linkId',id),
  enrolments:(id:string)=>query('enrolments','StudentEnrolmentsIndex','studentId',id),
  enrolment:(id:string)=>get('enrolments','enrolmentId',id),
  class:(id:string)=>get('classes','classId',id),
  venue:(id:string)=>get('venues','venueId',id),
  publicDirectory,
  async writePreferences({inst,subject,actor,student,link,preferences,expectedVersion}:any){
   const now=new Date().toISOString();
   // Guard against a race with student edits and two profile saves. Do not
   // replace any unrelated person fields, family links or studentProfile.
   const previous=student.learnerPreferences?.version||0;
   if(previous!==expectedVersion)throw httpError(409,'Preferences changed. Refresh before saving.');
   const checkValues:any={':personVersion':student.version,':active':'active',':inst':inst,':student':'student'};
   let studentCondition='#version=:personVersion AND #status=:active AND contains(institutionIds,:inst) AND contains(personTypes,:student)';
   if(actor.personId===student.personId){
    studentCondition+=' AND cognitoSub=:subject';checkValues[':subject']=subject;
   }
   const actions:any[]=[];
   if(actor.personId!==student.personId){
    if(!link||!validId(link.linkId)||link.familyId!==student.familyId||link.familyId!==actor.familyId)throw httpError(403,'Approved guardian link required.');
    studentCondition+=' AND familyId=:family';checkValues[':family']=link.familyId;
    actions.push({ConditionCheck:{TableName:entityTable('people'),Key:{personId:actor.personId},
     ConditionExpression:'#status=:active AND cognitoSub=:subject AND familyId=:family AND contains(institutionIds,:inst) AND contains(personTypes,:guardian)',
     ExpressionAttributeNames:{'#status':'status'},ExpressionAttributeValues:{':active':'active',':subject':subject,':inst':inst,':guardian':'guardian',':family':link.familyId}}});
    actions.push({ConditionCheck:{TableName:entityTable('family-links'),Key:{linkId:link.linkId},
     ConditionExpression:'guardianPersonId=:guardian AND studentId=:student AND institutionId=:inst AND accessStatus=:approved AND relationshipVerified=:verified AND familyId=:family',
     ExpressionAttributeValues:{':guardian':actor.personId,':student':student.personId,':inst':inst,':approved':'approved',':verified':true,':family':link.familyId}}});
   }
   actions.push({Put:{TableName:entityTable('people'),Item:{...student,learnerPreferences:preferences,version:student.version+1,updatedAt:now},
    ConditionExpression:studentCondition,ExpressionAttributeNames:{'#version':'version','#status':'status'},ExpressionAttributeValues:checkValues}});
   actions.push({Put:{TableName:entityTable('audit'),Item:{auditId:`AUDIT-${randomUUID()}`,institutionId:inst,
    action:'learnerProfilePreferencesUpdate',actorCognitoSub:subject,actorPersonId:actor.personId,
    timestamp:now,resourceType:'student',resourceId:student.personId},ConditionExpression:'attribute_not_exists(auditId)'}});
   try{await db.send(new TransactWriteCommand({TransactItems:actions}));}
   catch(e:any){if(['TransactionCanceledException','ConditionalCheckFailedException'].includes(e.name))throw httpError(409,'Profile or family access changed. Refresh and retry.');throw e;}
  }
 };
 return makeM10FinalLearnerProfiles(io);
}
let cached:ReturnType<typeof makeM10FinalLearnerProfilesData>|undefined;
export function m10FinalLearnerProfiles(){
 if(!cached){
  const db=DynamoDBDocumentClient.from(new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'}),{marshallOptions:{removeUndefinedValues:true}});
  cached=makeM10FinalLearnerProfilesData(db,new CognitoIdentityProviderClient({}));
 }
 return cached;
}
