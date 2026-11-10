import {createHash,randomUUID} from 'node:crypto';
import {DynamoDBDocumentClient,DeleteCommand,GetCommand,QueryCommand,ScanCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {GetObjectCommand,HeadObjectCommand,PutObjectCommand,S3Client} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {makeRoutedClient} from './tableRouter.ts';
import {demandInstitution,demandViewInstitution,httpError,permittedInstitutions} from './model.ts';
import type {Claims,InstitutionId} from './model.ts';
import {learnerIdentity} from './learnerExtras.ts';
import {myTeacherIdentity} from './teacherDirectory.ts';
import {schedulePK,scheduleSK} from './scheduleModel.ts';

type Category='syllabus'|'getting-started'|'practice'|'policies';
type ResourceInput={title:string;description:string;category:Category;audience:'students'|'families'|'all';url:string;classIds:string[];programme?:string;stage?:string;levelNumber?:number;studentMessage?:string;objective?:string;duration?:string;versionLabel?:string;status?:'draft'|'published'|'archived';mediaKey?:string;fileName?:string;mimeType?:string;fileSize?:number};
const legacy=makeRoutedClient();
const canonical=DynamoDBDocumentClient.from(new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'}),{marshallOptions:{removeUndefinedValues:true}});
const s3=new S3Client({region:process.env.AWS_REGION||'us-east-1'});
const isFinal=()=>process.env.SADHANA_ENTITY_TABLE_SET==='final';
const table=()=>{const value=process.env.SADHANA_TABLE_NAME;if(!value)throw Error('SADHANA_TABLE_NAME missing');return value;};
import {entityTable as entityTableRuntime} from './entityTables.mjs';
const canonicalTable=(entity:string)=>entityTableRuntime(entity);
const bucket=()=>{const value=process.env.SADHANA_HOMEWORK_MEDIA_BUCKET;if(!value)throw Error('SADHANA_HOMEWORK_MEDIA_BUCKET missing');return value;};
const cleanText=(v:unknown,max:number)=>typeof v==='string'?v.trim().replace(/\s+/g,' ').slice(0,max):'';
const validClassId=(value:unknown):value is string=>typeof value==='string'&&/^CLASS-[A-Za-z0-9_-]{3,120}$/.test(value);
function validate(input:any,creating:boolean,hasExistingFile=false,existing?:any):ResourceInput{
 if(!input||typeof input!=='object'||Array.isArray(input))throw httpError(400,'Resource details are required.');
 const allowed=['title','description','category','audience','url','versionLabel','status','expectedVersion','classIds','mediaKey','fileName','mimeType','fileSize','programme','stage','levelNumber','studentMessage','objective','duration'];
 if(Object.keys(input).some(k=>!allowed.includes(k)))throw httpError(400,'Unsupported resource field.');
 const title=cleanText(input.title,120),description=typeof input.description==='string'?input.description.trim().slice(0,1200):'';
 const category=input.category as Category,audience=input.audience,status=input.status??(creating?'draft':undefined);
 const url=typeof input.url==='string'?input.url.trim():'';
 const classIds:string[]=Array.isArray(input.classIds)?[...new Set<string>(input.classIds)]:[];
 const programme=cleanText(input.programme,120)||cleanText(existing?.programme,120),stage=cleanText(input.stage,120)||cleanText(existing?.stage,120);
 const levelNumber=input.levelNumber===undefined?existing?.levelNumber:input.levelNumber;
 const studentMessage=typeof input.studentMessage==='string'?input.studentMessage.trim().slice(0,300):String(existing?.studentMessage||'');
 const objective=typeof input.objective==='string'?input.objective.trim().slice(0,1200):String(existing?.objective||'');
 const duration=typeof input.duration==='string'?cleanText(input.duration,80):cleanText(existing?.duration,80);
 if(!title||!['syllabus','getting-started','practice','policies'].includes(category)||!['students','families','all'].includes(audience))throw httpError(400,'Enter a title, category and audience.');
 if(classIds.length>40||classIds.some(id=>!validClassId(id)))throw httpError(400,'Select valid classes.');
 if(category!=='syllabus'&&!classIds.length)throw httpError(400,'Choose at least one class for this resource.');
 if(category==='syllabus'&&classIds.length)throw httpError(400,'Syllabus entries are shared with the academy, not individual classes.');
 const hasCurriculumFields=!!programme||!!stage||(levelNumber!==undefined&&levelNumber!==null);
 if(category==='syllabus'&&(creating||hasCurriculumFields)&&(!programme||!stage||!Number.isInteger(levelNumber)||levelNumber<0||levelNumber>999))throw httpError(400,'Enter a programme, stage and whole-number sequence from 0 to 999.');
 if(url){let parsed:URL;try{parsed=new URL(url)}catch{throw httpError(400,'Enter a valid HTTPS resource link.');}if(parsed.protocol!=='https:'||url.length>2000)throw httpError(400,'Resource links must use HTTPS.');}
 const mediaKey=typeof input.mediaKey==='string'?input.mediaKey:'';
 const fileName=cleanText(input.fileName,180),mimeType=cleanText(input.mimeType,120),fileSize=input.fileSize;
 if(!url&&!mediaKey&&!hasExistingFile&&!(category==='syllabus'&&(description||studentMessage||objective)))throw httpError(400,'Add syllabus content, a secure link or upload a file.');
 if(mediaKey&&(!fileName||!mimeType||!Number.isInteger(fileSize)||fileSize<1||fileSize>100_000_000))throw httpError(400,'Uploaded file details are invalid.');
 if(status!==undefined&&!['draft','published','archived'].includes(status))throw httpError(400,'Invalid resource status.');
 const versionLabel=cleanText(input.versionLabel,50);
 return {title,description,category,audience,url,classIds,...(category==='syllabus'&&hasCurriculumFields?{programme,stage,levelNumber,studentMessage,objective,duration}:{}),...(versionLabel?{versionLabel}:{}),...(status?{status}:{}),...(mediaKey?{mediaKey,fileName,mimeType,fileSize}: {})};
}
function legacyKey(inst:InstitutionId,id:string){return {PK:`OPS#${inst}#LEARNING-RESOURCES`,SK:`ITEM#${id}`};}
async function rows(inst:InstitutionId){
 if(isFinal()){
  const result=await canonical.send(new QueryCommand({TableName:canonicalTable('homework'),IndexName:'ClassHomeworkIndex',KeyConditionExpression:'classId=:classId',ExpressionAttributeValues:{':classId':`LIBRARY#${inst}`},Limit:100}));
  return (result.Items||[]).filter(x=>x.recordType==='learning-resource'&&x.institutionId===inst);
 }
 const result=await legacy.send(new QueryCommand({TableName:table(),KeyConditionExpression:'PK=:pk',ExpressionAttributeValues:{':pk':`OPS#${inst}#LEARNING-RESOURCES`},Limit:100,ConsistentRead:true}));
 return result.Items||[];
}
async function get(inst:InstitutionId,id:string){
 if(isFinal())return (await canonical.send(new GetCommand({TableName:canonicalTable('homework'),Key:{homeworkId:id},ConsistentRead:true}))).Item;
 return (await legacy.send(new GetCommand({TableName:table(),Key:legacyKey(inst,id),ConsistentRead:true}))).Item;
}
const validPersonId=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{4,150}$/.test(value);
async function currentTeacherIds(inst:InstitutionId,claims:Claims):Promise<string[]>{
 if(isFinal()){
  if(!claims.sub)throw httpError(403,'Verified teacher access is required.');
  const linked=await canonical.send(new QueryCommand({TableName:canonicalTable('people'),IndexName:'CognitoIdentityIndex',KeyConditionExpression:'cognitoSub=:sub',ExpressionAttributeValues:{':sub':claims.sub},Limit:20}));
  const people=(linked.Items||[]).filter(p=>p.cognitoSub===claims.sub&&p.status==='active'&&p.personTypes?.includes('teacher')&&p.institutionIds?.includes(inst));
  if(people.length!==1)throw httpError(403,'Verified teacher access is required for this academy.');
  const p=people[0];return [...new Set([p.personId,p.teacherId,p.staffProfile?.teacherId,p.legacyPayload?.id].filter(validPersonId))];
 }
 const identity=await myTeacherIdentity(inst,claims).catch(()=>({linked:false,teacherId:null}));
 if(!identity.linked||!identity.teacherId)throw httpError(403,'Verified teacher access is required for this academy.');
 return [identity.teacherId];
}
async function getClass(inst:InstitutionId,classId:string){
 if(isFinal())return (await canonical.send(new GetCommand({TableName:canonicalTable('classes'),Key:{classId},ConsistentRead:true}))).Item;
 return (await legacy.send(new GetCommand({TableName:table(),Key:{PK:schedulePK(inst),SK:scheduleSK(classId)},ConsistentRead:true}))).Item;
}
function classBelongsTo(row:any,inst:InstitutionId){
 // Canonical class entities are keyed by classId and do not necessarily carry
 // the legacy schedule discriminator. Continue requiring it when present so
 // dated class-session rows cannot be mistaken for master classes.
 const isClass=row?.recordType==='class'||(!row?.recordType&&validClassId(row?.classId));
 return row&&(row.institutionId===inst||row.institution===inst)&&isClass&&row.status!=='archived'&&row.lifecycleStatus!=='archived'&&row.archived!==true;
}
function teacherAssigned(row:any,ids:string[]){const assigned=[...(Array.isArray(row.teacherPersonIds)?row.teacherPersonIds:[]),row.teacherId,row.legacyPayload?.teacherId].filter(validPersonId);return assigned.some(id=>ids.includes(id));}
async function validateClassScope(inst:InstitutionId,claims:Claims,classIds:string[],admin:boolean){
 if(!classIds.length)return;
 const teacherIds=admin?[]:await currentTeacherIds(inst,claims);
 for(const id of classIds){const row=await getClass(inst,id);if(!classBelongsTo(row,inst))throw httpError(400,'A selected class is not active in this academy.');if(!admin&&!teacherAssigned(row,teacherIds))throw httpError(403,'Resources can only be shared with your assigned classes.');}
}
async function staffScope(inst:InstitutionId,claims:Claims){
 if(permittedInstitutions(claims).includes(inst))return {admin:true,classIds:[] as string[]};
 demandViewInstitution(claims,inst);
 const teacherIds=await currentTeacherIds(inst,claims);
 let classes:any[]=[];
 if(isFinal()){
  const response=await canonical.send(new ScanCommand({TableName:canonicalTable('classes'),FilterExpression:'institutionId=:inst AND #status<>:archived',ExpressionAttributeNames:{'#status':'status'},ExpressionAttributeValues:{':inst':inst,':archived':'archived'},Limit:500}));classes=response.Items||[];
 }else{
  const response=await legacy.send(new QueryCommand({TableName:table(),KeyConditionExpression:'PK=:pk AND begins_with(SK,:prefix)',ExpressionAttributeValues:{':pk':schedulePK(inst),':prefix':'RECORD#'},Limit:500,ConsistentRead:true}));classes=response.Items||[];
 }
 return {admin:false,classIds:classes.filter(row=>classBelongsTo(row,inst)&&teacherAssigned(row,teacherIds)).map(row=>row.classId).filter(validClassId)};
}
async function allActiveClasses(inst:InstitutionId){
 const classes:any[]=[];
 if(isFinal()){
  let ExclusiveStartKey:Record<string,unknown>|undefined;
  do{
   const response=await canonical.send(new ScanCommand({TableName:canonicalTable('classes'),FilterExpression:'institutionId=:inst',ExpressionAttributeValues:{':inst':inst},ExclusiveStartKey}));
   classes.push(...(response.Items||[]));ExclusiveStartKey=response.LastEvaluatedKey;
  }while(ExclusiveStartKey);
 }else{
  let ExclusiveStartKey:Record<string,unknown>|undefined;
  do{
   const response=await legacy.send(new QueryCommand({TableName:table(),KeyConditionExpression:'PK=:pk AND begins_with(SK,:prefix)',ExpressionAttributeValues:{':pk':schedulePK(inst),':prefix':'RECORD#'},ConsistentRead:true,ExclusiveStartKey}));
   classes.push(...(response.Items||[]));ExclusiveStartKey=response.LastEvaluatedKey;
  }while(ExclusiveStartKey);
 }
 return classes.filter(row=>classBelongsTo(row,inst));
}
async function learnerClassIds(inst:InstitutionId,claims:Claims,studentId:string):Promise<string[]>{
 if(isFinal()){
  const candidates=await canonical.send(new QueryCommand({TableName:canonicalTable('enrolments'),IndexName:'StudentEnrolmentsIndex',KeyConditionExpression:'studentId=:student',ExpressionAttributeValues:{':student':studentId},Limit:200}));
  return [...new Set((candidates.Items||[]).filter(row=>row.institutionId===inst&&row.status==='active'&&row.archived!==true).map(row=>row.classId).filter(validClassId))];
 }
 const linked=await legacy.send(new QueryCommand({TableName:table(),KeyConditionExpression:'PK=:pk',ExpressionAttributeValues:{':pk':`OPS#${inst}#ENROLMENT`},Limit:500,ConsistentRead:true}));
 return [...new Set((linked.Items||[]).filter(row=>row.studentId===studentId&&!row.archived).map(row=>row.classId).filter(validClassId))];
}
async function authorizeFinalLearner(inst:InstitutionId,claims:Claims,studentId:string){
 if(!claims.sub)throw httpError(403,'Student access denied.');
 const people=await canonical.send(new QueryCommand({TableName:canonicalTable('people'),IndexName:'CognitoIdentityIndex',KeyConditionExpression:'cognitoSub=:sub',ExpressionAttributeValues:{':sub':claims.sub},Limit:10}));
 const matches=people.Items||[];
 const person=matches.find(p=>p.personId===studentId&&p.status==='active'&&p.personTypes?.includes('student')&&p.institutionIds?.includes(inst));
 if(person)return 'student' as const;
 const guardianIds=matches.filter(p=>p.status==='active'&&p.personTypes?.includes('guardian')).map(p=>p.personId);
 for(const guardianPersonId of guardianIds){
  const links=await canonical.send(new QueryCommand({TableName:canonicalTable('family-links'),IndexName:'GuardianAccessIndex',KeyConditionExpression:'guardianPersonId=:guardian',ExpressionAttributeValues:{':guardian':guardianPersonId},Limit:100}));
  if((links.Items||[]).some(link=>link.studentId===studentId&&link.institutionId===inst&&link.accessStatus==='approved'&&link.relationshipVerified===true))return 'guardian' as const;
 }
 throw httpError(403,'Approved access to this student is required.');
}
function auditItem(inst:InstitutionId,claims:Claims,action:string,id:string,at:string){
 return isFinal()?{auditId:`AUDIT-${randomUUID()}`,institutionId:inst,action,resourceType:'learning-resource',resourceId:id,actorCognitoSub:claims.sub,timestamp:at}:{PK:`AUDIT#${inst}`,SK:`LEARNING-RESOURCE#${at}#${randomUUID()}`,entityType:'audit',action,resourceType:'learning-resource',resourceId:id,actor:claims.sub,at};
}
const publicId=(r:any)=>r.resourceId||r.homeworkId||r.id||r.SK?.split('#').at(-1);
async function publicResource(r:any){
 let url=r.url||'';
 if(r.mediaKey){try{url=await getSignedUrl(s3,new GetObjectCommand({Bucket:bucket(),Key:r.mediaKey,ResponseContentDisposition:`attachment; filename="${String(r.fileName||'resource').replace(/["\\\r\n]/g,'_')}"`}),{expiresIn:300});}catch{url='';}}
 return {id:publicId(r),title:r.title,description:r.description,category:r.category,audience:r.audience,url,classIds:r.classIds||[],programme:r.programme||'',stage:r.stage||'',levelNumber:r.levelNumber??null,studentMessage:r.studentMessage||'',objective:r.objective||'',duration:r.duration||'',fileName:r.fileName||'',mimeType:r.mimeType||'',fileSize:r.fileSize||0,hasFile:!!r.mediaKey,versionLabel:r.versionLabel||'',status:r.status,createdAt:r.createdAt,updatedAt:r.updatedAt,version:r.version||1};
}
export async function listLearningResourceClasses(inst:InstitutionId,claims:Claims,studentId?:string){
 if(studentId){if(isFinal())await authorizeFinalLearner(inst,claims,studentId);else await learnerIdentity(inst,claims,studentId);const ids=await learnerClassIds(inst,claims,studentId);const records=await Promise.all(ids.map(id=>getClass(inst,id)));return {records:records.filter(row=>classBelongsTo(row,inst)).map(row=>({classId:row.classId,name:row.name||row.legacyPayload?.name||'Class'})).sort((a,b)=>a.name.localeCompare(b.name))};}
 const scope=await staffScope(inst,claims);
 const rows=await allActiveClasses(inst);
 return {records:rows.filter(row=>scope.admin||scope.classIds.includes(row.classId)).map(row=>({classId:row.classId,name:row.name||row.legacyPayload?.name||'Class'})).sort((a,b)=>a.name.localeCompare(b.name))};
}
export async function beginLearningResourceUpload(inst:InstitutionId,claims:Claims,body:any){
 const scope=await staffScope(inst,claims);
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['fileName','mimeType','fileSize','classIds','category'].includes(k)))throw httpError(400,'Invalid upload details.');
 const fileName=cleanText(body.fileName,180),mimeType=cleanText(body.mimeType,120),fileSize=body.fileSize;
 const ext=fileName.includes('.')?fileName.split('.').at(-1)!.toLowerCase():'';
 const allowed=new Set(['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','mp3','m4a','aac','wav','mp4','mov','jpg','jpeg','png','webp']);
 if(!fileName||!allowed.has(ext)||typeof mimeType!=='string'||!/^[-\w.+]+\/[-\w.+]+$/.test(mimeType)||!Number.isInteger(fileSize)||fileSize<1||fileSize>100_000_000)throw httpError(400,'Choose a supported file up to 100 MB.');
 const classIds:string[]=Array.isArray(body.classIds)?[...new Set<string>(body.classIds)]:[];
 if(!['syllabus','getting-started','practice','policies'].includes(body.category)||classIds.length>40||classIds.some(id=>!validClassId(id)))throw httpError(400,'Choose valid resource details.');
 if(body.category==='syllabus'&&!scope.admin)throw httpError(403,'Only academy administrators can edit the syllabus.');
 if(body.category!=='syllabus'&&!classIds.length)throw httpError(400,'Choose one or more classes.');
 await validateClassScope(inst,claims,classIds,scope.admin);
 const owner=createHash('sha256').update(String(claims.sub)).digest('hex');
 const safeName=fileName.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100)||'resource';
 const key=`teacher-materials/${inst}/resources/${owner}/${randomUUID()}-${safeName}`;
 const uploadUrl=await getSignedUrl(s3,new PutObjectCommand({Bucket:bucket(),Key:key,ContentType:mimeType,ContentLength:fileSize,Metadata:{institution:inst,owner}}),{expiresIn:300,unhoistableHeaders:new Set(['x-amz-meta-institution','x-amz-meta-owner'])});
 return {key,uploadUrl,headers:{'Content-Type':mimeType,'x-amz-meta-institution':inst,'x-amz-meta-owner':owner},expiresIn:300};
}
export async function listLearningResources(inst:InstitutionId,claims:Claims,studentId?:string){
 let learnerKind:'student'|'guardian'|undefined;let allowedClasses:string[]=[];let staff:{admin:boolean;classIds:string[]}|undefined;
 if(studentId){if(isFinal())learnerKind=await authorizeFinalLearner(inst,claims,studentId);else {await learnerIdentity(inst,claims,studentId);learnerKind='guardian';}allowedClasses=await learnerClassIds(inst,claims,studentId);}
 else staff=await staffScope(inst,claims);
 const allowed=new Set(allowedClasses.length?allowedClasses:(studentId?[]:staff?.classIds||[]));
 const records=await rows(inst);
 const selected=records.filter(r=>r.institutionId===inst&&r.recordType==='learning-resource'&&(
   studentId?r.status==='published'&&((r.audience==='all')||(learnerKind==='student'&&r.audience==='students')||(learnerKind==='guardian'&&r.audience==='families'))&&(r.category==='syllabus'||(!(r.classIds?.length)||r.classIds.some((id:string)=>allowed.has(id)))):
   staff?.admin?true:(r.category==='syllabus'?r.status==='published':(!(r.classIds?.length)?r.status==='published'&&r.category!=='syllabus':r.classIds.some((id:string)=>allowed.has(id))))
 ));
 // Let learners and teachers see the full journey map without exposing draft
 // syllabus copy. Only stage names, levels and a published flag are returned.
 const syllabusStages=records.filter(r=>r.institutionId===inst&&r.recordType==='learning-resource'&&r.category==='syllabus'&&r.status!=='archived')
  .map(r=>({programme:String(r.programme||'Curriculum'),stage:String(r.stage||'Stages'),levelNumber:Number.isInteger(r.levelNumber)?r.levelNumber:null,published:r.status==='published'}));
 const presented=await Promise.all(selected.map(publicResource));
 return {records:presented.map((record,index)=>({...record,canManage:!studentId&&(!!staff?.admin||(!!staff&&!staff.admin&&selected[index].category!=='syllabus'&&selected[index].createdBy===claims.sub))})),stages:syllabusStages};
}
export async function createLearningResource(inst:InstitutionId,claims:Claims,body:any){
 const scope=await staffScope(inst,claims);const data=validate(body,true);
 if(data.category==='syllabus'&&!scope.admin)throw httpError(403,'Only academy administrators can edit the syllabus.');
 await validateClassScope(inst,claims,data.classIds,scope.admin);
 if(data.mediaKey){const owner=createHash('sha256').update(String(claims.sub)).digest('hex');if(!data.mediaKey.startsWith(`teacher-materials/${inst}/resources/${owner}/`))throw httpError(403,'Uploaded resource does not belong to this account.');
  const head=await s3.send(new HeadObjectCommand({Bucket:bucket(),Key:data.mediaKey}));if(head.ContentLength!==data.fileSize||head.ContentType!==data.mimeType||head.Metadata?.owner!==owner||head.Metadata?.institution!==inst)throw httpError(400,'Uploaded file could not be verified.');}
 const now=new Date().toISOString();const id=`RESOURCE-${randomUUID()}`;
 // ClassHomeworkIndex requires both classId and publishAt; library rows use a
 // synthetic class partition and creation time to remain queryable as drafts.
 const item=isFinal()?{homeworkId:id,classId:`LIBRARY#${inst}`,publishAt:now,institutionId:inst,recordType:'learning-resource',...data,createdAt:now,updatedAt:now,createdBy:claims.sub,version:1}:{...legacyKey(inst,id),id,resourceId:id,institutionId:inst,recordType:'learning-resource',...data,createdAt:now,updatedAt:now,createdBy:claims.sub,version:1};
 const audit=auditItem(inst,claims,'LEARNING_RESOURCE_CREATED',id,now);
 if(isFinal())await canonical.send(new TransactWriteCommand({TransactItems:[{Put:{TableName:canonicalTable('homework'),Item:item,ConditionExpression:'attribute_not_exists(homeworkId)'}},{Put:{TableName:canonicalTable('audit'),Item:audit,ConditionExpression:'attribute_not_exists(auditId)'}}]}));
 else await legacy.send(new TransactWriteCommand({TransactItems:[{Put:{TableName:table(),Item:item,ConditionExpression:'attribute_not_exists(PK)'}},{Put:{TableName:table(),Item:audit,ConditionExpression:'attribute_not_exists(PK)'}}]}));
 return {record:await publicResource(item)};
}
export async function updateLearningResource(inst:InstitutionId,claims:Claims,id:string,body:any){
 const scope=await staffScope(inst,claims);const current=await get(inst,id);if(!current||current.recordType!=='learning-resource'||current.institutionId!==inst)throw httpError(404,'Learning resource not found.');
 if(current.category==='syllabus'&&!scope.admin)throw httpError(403,'Only academy administrators can edit the syllabus.');
 if(!scope.admin&&current.classIds?.length&&current.classIds.some((x:string)=>!scope.classIds.includes(x)))throw httpError(403,'You can only manage resources for your assigned classes.');
 const expectedVersion=body?.expectedVersion;if(!Number.isInteger(expectedVersion)||expectedVersion!==current.version)throw httpError(409,'Resource changed. Refresh and try again.');
 const data=validate(body,false,!!current.mediaKey,current);if(!scope.admin&&current.createdBy!==claims.sub)throw httpError(403,'Only the resource uploader or an administrator can edit this resource.');await validateClassScope(inst,claims,data.classIds,scope.admin);
 if(data.mediaKey){const owner=createHash('sha256').update(String(claims.sub)).digest('hex');if(!data.mediaKey.startsWith(`teacher-materials/${inst}/resources/${owner}/`))throw httpError(403,'Uploaded resource does not belong to this account.');const head=await s3.send(new HeadObjectCommand({Bucket:bucket(),Key:data.mediaKey}));if(head.ContentLength!==data.fileSize||head.ContentType!==data.mimeType||head.Metadata?.owner!==owner||head.Metadata?.institution!==inst)throw httpError(400,'Uploaded file could not be verified.');}
 const now=new Date().toISOString();const next={...current,...data,...(isFinal()?{publishAt:current.publishAt||current.createdAt||now}:{}),updatedAt:now,updatedBy:claims.sub,version:expectedVersion+1};
 const audit=auditItem(inst,claims,data.status==='published'?'LEARNING_RESOURCE_PUBLISHED':data.status==='archived'?'LEARNING_RESOURCE_ARCHIVED':'LEARNING_RESOURCE_UPDATED',id,now);
 if(isFinal())await canonical.send(new TransactWriteCommand({TransactItems:[{Put:{TableName:canonicalTable('homework'),Item:next,ConditionExpression:'recordType=:type AND institutionId=:inst AND #v=:v',ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':type':'learning-resource',':inst':inst,':v':expectedVersion}}},{Put:{TableName:canonicalTable('audit'),Item:audit,ConditionExpression:'attribute_not_exists(auditId)'}}]}));
 else await legacy.send(new TransactWriteCommand({TransactItems:[{Put:{TableName:table(),Item:next,ConditionExpression:'recordType=:type AND institutionId=:inst AND #v=:v',ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':type':'learning-resource',':inst':inst,':v':expectedVersion}}},{Put:{TableName:table(),Item:audit,ConditionExpression:'attribute_not_exists(PK)'}}]}));
 return {record:await publicResource(next)};
}
export async function deleteLearningResource(inst:InstitutionId,claims:Claims,id:string,expectedVersion:number){
 const scope=await staffScope(inst,claims);const current=await get(inst,id);if(!current||current.recordType!=='learning-resource'||current.institutionId!==inst)throw httpError(404,'Learning resource not found.');
 if(current.category==='syllabus'&&!scope.admin)throw httpError(403,'Only academy administrators can edit the syllabus.');
 if(!scope.admin&&current.createdBy!==claims.sub)throw httpError(403,'Only the resource uploader or an administrator can delete this resource.');
 if(!scope.admin&&current.classIds?.length&&current.classIds.some((x:string)=>!scope.classIds.includes(x)))throw httpError(403,'You can only manage resources for your assigned classes.');
 if(!Number.isInteger(expectedVersion)||expectedVersion!==current.version)throw httpError(409,'Resource changed. Refresh and try again.');
 const audit=auditItem(inst,claims,'LEARNING_RESOURCE_DELETED',id,new Date().toISOString());
 if(isFinal())await canonical.send(new TransactWriteCommand({TransactItems:[{Delete:{TableName:canonicalTable('homework'),Key:{homeworkId:id},ConditionExpression:'recordType=:type AND institutionId=:inst AND #v=:v',ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':type':'learning-resource',':inst':inst,':v':expectedVersion}}},{Put:{TableName:canonicalTable('audit'),Item:audit,ConditionExpression:'attribute_not_exists(auditId)'}}]}));
 else await legacy.send(new TransactWriteCommand({TransactItems:[{Delete:{TableName:table(),Key:legacyKey(inst,id),ConditionExpression:'recordType=:type AND institutionId=:inst AND #v=:v',ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':type':'learning-resource',':inst':inst,':v':expectedVersion}}},{Put:{TableName:table(),Item:audit,ConditionExpression:'attribute_not_exists(PK)'}}]}));
 return {deleted:true,id};
}
