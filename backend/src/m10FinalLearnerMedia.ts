/** Canonical learner media compatibility. Private S3 objects and canonical
 * submission receipts; no new tables, PK/SK routing, or guardian inference. */
import {randomUUID} from 'node:crypto';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,QueryCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {S3Client,PutObjectCommand,HeadObjectCommand,GetObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {entityTable} from './m10EntityTables.mjs';
import {m10FinalLearnerProfiles} from './m10FinalLearnerProfilesData.ts';
import {httpError} from './model.ts';
import type {Claims,InstitutionId} from './model.ts';

const types:Record<string,{ext:string;max:number}>={
 'image/jpeg':{ext:'jpg',max:5_000_000},'image/png':{ext:'png',max:5_000_000},
 'image/webp':{ext:'webp',max:5_000_000},'audio/mpeg':{ext:'mp3',max:20_000_000},
 'audio/mp4':{ext:'m4a',max:20_000_000},'video/mp4':{ext:'mp4',max:100_000_000},
};
const validId=(id:unknown)=>typeof id==='string'&&/^[-A-Za-z0-9_]{4,150}$/.test(id);
const validPurpose=(p:unknown)=>p==='profile'||p==='homework'||p==='practice';
const recordId=(id:unknown)=>typeof id==='string'&&/^LEARNERMEDIA-[0-9a-f-]{36}$/i.test(id);
const isObject=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const noExtras=(value:Record<string,any>,keys:string[])=>Object.keys(value).every(key=>keys.includes(key));

export type MediaDb={send:(cmd:any)=>Promise<any>};
export type MediaIO={head:(bucket:string,key:string)=>Promise<any>;signPut:(bucket:string,key:string,mime:string,size:number)=>Promise<string>;signGet:(bucket:string,key:string)=>Promise<string>};
const s3=new S3Client({requestChecksumCalculation:'WHEN_REQUIRED'});
const mediaIo:MediaIO={
 head:(bucket,key)=>s3.send(new HeadObjectCommand({Bucket:bucket,Key:key})),
 signPut:(bucket,key,mime,size)=>getSignedUrl(s3,new PutObjectCommand({Bucket:bucket,Key:key,ContentType:mime,ContentLength:size}),{expiresIn:300}),
 signGet:(bucket,key)=>getSignedUrl(s3,new GetObjectCommand({Bucket:bucket,Key:key}),{expiresIn:180}),
};
export function makeM10FinalLearnerMedia(db:MediaDb,io:MediaIO=mediaIo,
 authorise=m10FinalLearnerProfiles().authorise){
 const bucket=()=>{const b=process.env.SADHANA_LEARNER_MEDIA_BUCKET;if(!b)throw httpError(503,'Private learner media bucket not configured');return b;};
 const mediaTable=()=>entityTable('submissions');
 const get=async(id:string)=>(await db.send(new GetCommand({TableName:mediaTable(),Key:{submissionId:id},ConsistentRead:true}))).Item??null;
 function checks(inst:InstitutionId,subject:string,studentId:string,access:any){
  const actor=access.actor,student=access.student;
  const conditionChecks:any[]=[{ConditionCheck:{TableName:entityTable('people'),Key:{personId:actor.personId},
   ConditionExpression:'#status=:active AND cognitoSub=:sub AND contains(institutionIds,:inst)'+(actor.personId===studentId?'':' AND contains(personTypes,:guardian) AND familyId=:family'),
   ExpressionAttributeNames:{'#status':'status'},ExpressionAttributeValues:{':active':'active',':sub':subject,':inst':inst,
      ...(actor.personId===studentId?{}:{':guardian':'guardian',':family':access.link.familyId})}}}];
  if(actor.personId!==studentId)conditionChecks.push({ConditionCheck:{TableName:entityTable('people'),Key:{personId:studentId},
   ConditionExpression:'#status=:active AND contains(institutionIds,:inst) AND contains(personTypes,:student) AND familyId=:family',
   ExpressionAttributeNames:{'#status':'status'},ExpressionAttributeValues:{':active':'active',':inst':inst,':student':'student',':family':access.link.familyId}}},
   {ConditionCheck:{TableName:entityTable('family-links'),Key:{linkId:access.link.linkId},
   ConditionExpression:'guardianPersonId=:guardian AND studentId=:student AND institutionId=:inst AND accessStatus=:approved AND relationshipVerified=:yes AND familyId=:family',
   ExpressionAttributeValues:{':guardian':actor.personId,':student':studentId,':inst':inst,':approved':'approved',':yes':true,':family':access.link.familyId}}});
  else conditionChecks[0].ConditionCheck.ConditionExpression+=' AND contains(personTypes,:student)',
   conditionChecks[0].ConditionCheck.ExpressionAttributeValues[':student']='student';
  return conditionChecks;
 }
 async function allowed(inst:InstitutionId,claims:Claims,id:string){
  if(!validId(id)||!validId(claims?.sub))throw httpError(401,'Verified learner identity required');
  return authorise(inst,claims,id);
 }
 return {
  async start(inst:InstitutionId,claims:Claims,id:string,body:unknown){
   if(!isObject(body)||!noExtras(body,['mime','size','purpose'])||!validPurpose(body.purpose))throw httpError(400,'Invalid media upload request');
   const type=types[body.mime];
   if(!type||!Number.isSafeInteger(body.size)||body.size<1||body.size>type.max||
      (body.purpose==='profile'&&!body.mime.startsWith('image/')))throw httpError(400,'Unsupported media type or size');
   const access=await allowed(inst,claims,id),receipt=`LEARNERMEDIA-${randomUUID()}`;
   // Prefix is already covered by the deployed private homework-media S3 IAM policy.
   const key=`homework-private/learner/${inst}/${id}/${receipt}.${type.ext}`;
   const item={submissionId:receipt,recordType:'learner-media',institutionId:inst,studentId:id,
    objectKey:key,mime:body.mime,size:body.size,purpose:body.purpose,mediaStatus:'pending',uploadedBy:claims.sub,createdAt:new Date().toISOString(),
    submittedAt:new Date().toISOString()};
   try{await db.send(new TransactWriteCommand({TransactItems:[...checks(inst,claims.sub!,id,access),
    {Put:{TableName:mediaTable(),Item:item,ConditionExpression:'attribute_not_exists(submissionId)'}}]}));}
   catch(e:any){if(e.name==='TransactionCanceledException')throw httpError(409,'Learner access changed. Refresh before uploading');throw e;}
   return {uploadUrl:await io.signPut(bucket(),key,body.mime,body.size),key,expiresIn:300,maxBytes:type.max};
  },
  async finish(inst:InstitutionId,claims:Claims,id:string,body:unknown){
   if(!isObject(body)||!noExtras(body,['key','purpose'])||typeof body.key!=='string'||!validPurpose(body.purpose))throw httpError(400,'Invalid media completion request');
   const prefix=`homework-private/learner/${inst}/${id}/`;
   if(!body.key.startsWith(prefix))throw httpError(403,'Media belongs to another learner');
   const name=body.key.slice(prefix.length),match=/^(LEARNERMEDIA-[0-9a-f-]{36})\.(jpg|png|webp|mp3|m4a|mp4)$/i.exec(name);
   if(!match||!recordId(match[1]))throw httpError(400,'Invalid upload reference');
   const access=await allowed(inst,claims,id),receipt=await get(match[1]);
   if(!receipt||receipt.recordType!=='learner-media'||receipt.institutionId!==inst||receipt.studentId!==id||
     receipt.objectKey!==body.key||receipt.purpose!==body.purpose||receipt.uploadedBy!==claims.sub)
    throw httpError(403,'Unverified media receipt');
   if(receipt.mediaStatus==='ready')return {uploaded:true,id:receipt.submissionId};
   if(receipt.mediaStatus!=='pending')throw httpError(409,'Invalid media status');
   let head:any;
   try{head=await io.head(bucket(),body.key)}catch{throw httpError(409,'Upload not found')}
   const type=types[receipt.mime];
   if(!type||!Number.isSafeInteger(head.ContentLength)||head.ContentLength!==receipt.size||
      head.ContentType!==receipt.mime||receipt.size>type.max)
    throw httpError(409,'Uploaded media metadata mismatch');
   const now=new Date().toISOString();
   try{await db.send(new TransactWriteCommand({TransactItems:[...checks(inst,claims.sub!,id,access),
    {Update:{TableName:mediaTable(),Key:{submissionId:receipt.submissionId},
     UpdateExpression:'SET mediaStatus=:ready, verifiedAt=:now',
     ConditionExpression:'recordType=:type AND mediaStatus=:pending AND institutionId=:inst AND studentId=:student AND uploadedBy=:actor',
     ExpressionAttributeValues:{':ready':'ready',':now':now,':type':'learner-media',':pending':'pending',':inst':inst,':student':id,':actor':claims.sub}}},
    {Put:{TableName:entityTable('audit'),Item:{auditId:`AUDIT-${randomUUID()}`,institutionId:inst,
     action:'learnerMediaUploaded',actorCognitoSub:claims.sub,resourceType:'student',resourceId:id,timestamp:now},
     ConditionExpression:'attribute_not_exists(auditId)'}}]}));}
   catch(e:any){if(e.name==='TransactionCanceledException')throw httpError(409,'Learner access or upload changed');throw e;}
   return {uploaded:true,id:receipt.submissionId};
  },
  async list(inst:InstitutionId,claims:Claims,id:string){
   await allowed(inst,claims,id);
   const items:any[]=[];let cursor:any;
   do{
    const page=await db.send(new QueryCommand({TableName:mediaTable(),IndexName:'StudentSubmissionsIndex',
     KeyConditionExpression:'studentId=:student',ExpressionAttributeValues:{':student':id},Limit:100,ExclusiveStartKey:cursor}));
    items.push(...(page.Items||[]));cursor=page.LastEvaluatedKey;
    if(items.length>2000)throw httpError(413,'Too many learner media records');
   }while(cursor);
   const records=[];
   for(const entry of items){
    if(entry.recordType!=='learner-media'||entry.institutionId!==inst||!recordId(entry.submissionId))continue;
    const r=await get(entry.submissionId);
    if(!r||r.recordType!=='learner-media'||r.mediaStatus!=='ready'||r.institutionId!==inst||r.studentId!==id||
       !r.objectKey?.startsWith(`homework-private/learner/${inst}/${id}/`))continue;
    if(records.length>=100)throw httpError(413,'Too many learner media records to display');
    records.push({id:r.submissionId,purpose:r.purpose,mime:r.mime,createdAt:r.createdAt,
     url:await io.signGet(bucket(),r.objectKey)});
   }
   return {records:records.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))};
  }
 };
}
let instance:ReturnType<typeof makeM10FinalLearnerMedia>|undefined;
export function m10FinalLearnerMedia(){
 return instance??=makeM10FinalLearnerMedia(DynamoDBDocumentClient.from(
  new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'}),{marshallOptions:{removeUndefinedValues:true}}));
}
