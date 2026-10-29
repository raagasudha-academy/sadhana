/** Scoped learner directory, editable preferences, and private S3 evidence upload. */
import {randomUUID} from 'node:crypto';
import {GetCommand,PutCommand,QueryCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {S3Client,PutObjectCommand,GetObjectCommand,HeadObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {makeRoutedClient} from './tableRouter.ts';
import {httpError} from './model.ts';
import type {Claims,InstitutionId} from './model.ts';
import {isStudentRecordId} from './accessRules.ts';
import {schedulePK,scheduleSK} from './scheduleModel.ts';
const db=makeRoutedClient();const s3=new S3Client({});
const table=()=>{if(!process.env.SADHANA_TABLE_NAME)throw Error('Missing table');return process.env.SADHANA_TABLE_NAME};
const academy=(x:string):InstitutionId=>{if(x!=='raaga'&&x!=='sruti')throw httpError(400,'Invalid academy');return x};
export async function learnerIdentity(instRaw:string,claims:Claims,studentId:string){
 const inst=academy(instRaw);
 if(!claims.sub||!isStudentRecordId(studentId))throw httpError(403,'Student access denied');
 const access=(await db.send(new GetCommand({TableName:table(),Key:{PK:`ACCESS#${inst}#${claims.sub}`,SK:`STUDENT#${studentId}`},ConsistentRead:true}))).Item;
 if(!access||access.status!=='approved'||access.institution!==inst||access.studentId!==studentId)throw httpError(403,'Approval required for this academy');
 const student=(await db.send(new GetCommand({TableName:table(),Key:{PK:'OPS#GLOBAL#STUDENT',SK:`ITEM#${studentId}`},ConsistentRead:true}))).Item;
 if(!student||student.archived)throw httpError(404,'Student not found');
 return {inst,student,kind:access.kind as string};
}
const profileKey=(studentId:string)=>({PK:'OPS#GLOBAL#STUDENT',SK:`PROFILE#${studentId}`});
export async function learnerExtras(instRaw:string,claims:Claims,studentId:string){
 const {inst,student}=await learnerIdentity(instRaw,claims,studentId);
 const enrollments=await db.send(new QueryCommand({TableName:table(),KeyConditionExpression:'PK=:p',ExpressionAttributeValues:{':p':`OPS#${inst}#ENROLMENT`}}));
 const own=(enrollments.Items||[]).filter(x=>x.studentId===studentId&&!x.archived);
 const classes=await Promise.all(own.map(async e=>(await db.send(new GetCommand({TableName:table(),Key:{PK:schedulePK(inst),SK:scheduleSK(e.classId)}}))).Item));
 const visible=classes.filter(Boolean);
 const profile=(await db.send(new GetCommand({TableName:table(),Key:profileKey(studentId),ConsistentRead:true}))).Item;
 return {student:{id:student.id,name:student.name,rollNumber:student.rollNumber||''},profile:{preferredName:profile?.preferredName||'',phone:profile?.phone||'',about:profile?.about||'',version:profile?.version||0},teachers:[...new Set(visible.map(c=>String(c.teacher||'').trim()).filter(Boolean))],venues:[...new Set(visible.map(c=>String(c.location||c.venue||'').trim()).filter(Boolean))],classes:visible.map(c=>({classId:c.id,name:c.name,teacher:c.teacher||'',venue:c.location||c.venue||''}))};
}
export async function saveLearnerProfile(inst:string,claims:Claims,id:string,body:any){
 const {student}=await learnerIdentity(inst,claims,id);
 if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).some(k=>!['preferredName','phone','about','expectedVersion'].includes(k)))throw httpError(400,'Unsupported profile field');
 const {preferredName,phone,about,expectedVersion}=body;
 if(typeof preferredName!=='string'||preferredName.length>80||/[<>]/.test(preferredName)||typeof phone!=='string'||phone.length>30||!/^[+\d ()-]*$/.test(phone)||typeof about!=='string'||about.length>500||!Number.isInteger(expectedVersion)||expectedVersion<0)throw httpError(400,'Invalid profile details');
 const key=profileKey(id);const old=(await db.send(new GetCommand({TableName:table(),Key:key,ConsistentRead:true}))).Item;
 if((old?.version||0)!==expectedVersion)throw httpError(409,'Profile changed. Refresh before saving');
 const now=new Date().toISOString();
 try{await db.send(new TransactWriteCommand({TransactItems:[{Put:{TableName:table(),Item:{...key,studentId:student.id,preferredName:preferredName.trim(),phone:phone.trim(),about:about.trim(),version:expectedVersion+1,updatedAt:now,updatedBy:claims.sub},ConditionExpression:old?'#v=:v':'attribute_not_exists(PK)',...(old?{ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':v':expectedVersion}}:{})}},{Put:{TableName:table(),Item:{PK:'AUDIT#'+academy(inst),SK:`LEARNER-PROFILE#${now}#${randomUUID()}`,entityType:'audit',action:'learnerProfilePreferencesUpdate',studentId:id,actor:claims.sub,at:now},ConditionExpression:'attribute_not_exists(PK)'}}]}));}
 catch(e:any){if(e.name==='ConditionalCheckFailedException')throw httpError(409,'Profile changed; refresh');throw e}
 return {updated:true,version:expectedVersion+1};
}
const mediaTypes:Record<string,{ext:string;max:number}>={'image/jpeg':{ext:'jpg',max:5_000_000},'image/png':{ext:'png',max:5_000_000},'audio/mpeg':{ext:'mp3',max:20_000_000},'audio/mp4':{ext:'m4a',max:20_000_000},'video/mp4':{ext:'mp4',max:100_000_000}};
export function validateLearnerMedia(mime:unknown,size:unknown){const entry=mediaTypes[String(mime)];if(!entry||!Number.isInteger(size)||Number(size)<1||Number(size)>entry.max)throw httpError(400,'Unsupported file type or file size');return entry}
const bucket=()=>{if(!process.env.SADHANA_LEARNER_MEDIA_BUCKET)throw httpError(503,'Private learner media storage not configured');return process.env.SADHANA_LEARNER_MEDIA_BUCKET};
export async function beginLearnerMedia(inst:string,claims:Claims,id:string,body:any){
 await learnerIdentity(inst,claims,id);
 if(!body||Object.keys(body).some(k=>!['mime','size','purpose'].includes(k)))throw httpError(400,'Invalid media request');
 const type=validateLearnerMedia(body.mime,body.size);
 if(!['profile','homework','practice'].includes(body.purpose)||body.purpose==='profile'&&!String(body.mime).startsWith('image/'))throw httpError(400,'Invalid upload purpose');
 const key=`learner-private/${id}/${randomUUID()}.${type.ext}`;
 const url=await getSignedUrl(s3,new PutObjectCommand({Bucket:bucket(),Key:key,ContentType:body.mime,ContentLength:body.size,Metadata:{student:id,purpose:body.purpose}}),{expiresIn:300});
 return {uploadUrl:url,key,expiresIn:300,maxBytes:type.max};
}
export async function completeLearnerMedia(inst:string,claims:Claims,id:string,body:any){
 await learnerIdentity(inst,claims,id);
 if(!body||typeof body.key!=='string'||!new RegExp(`^learner-private/${id}/[0-9a-f-]{36}\\.(jpg|png|mp3|m4a|mp4)$`).test(body.key)||typeof body.purpose!=='string')throw httpError(400,'Invalid upload reference');
 const head=await s3.send(new HeadObjectCommand({Bucket:bucket(),Key:body.key}));
 const kind=mediaTypes[String(head.ContentType)];
 if(!kind||!head.ContentLength||head.ContentLength>kind.max||head.Metadata?.student!==id||head.Metadata?.purpose!==body.purpose)throw httpError(409,'Upload metadata mismatch');
 const recordId=randomUUID();const now=new Date().toISOString();
 await db.send(new PutCommand({TableName:table(),Item:{PK:'OPS#GLOBAL#STUDENT',SK:`MEDIA#${id}#${recordId}`,studentId:id,objectKey:body.key,purpose:body.purpose,mime:head.ContentType,size:head.ContentLength,uploadedBy:claims.sub,createdAt:now},ConditionExpression:'attribute_not_exists(PK)'}));
 return {uploaded:true,id:recordId};
}
export async function listLearnerMedia(inst:string,claims:Claims,id:string){
 await learnerIdentity(inst,claims,id);
 if(!process.env.SADHANA_LEARNER_MEDIA_BUCKET)return {records:[]};
 const r=await db.send(new QueryCommand({TableName:table(),KeyConditionExpression:'PK=:p AND begins_with(SK,:s)',ExpressionAttributeValues:{':p':'OPS#GLOBAL#STUDENT',':s':`MEDIA#${id}#`},Limit:100}));
 return {records:await Promise.all((r.Items||[]).map(async x=>({id:x.SK,purpose:x.purpose,mime:x.mime,createdAt:x.createdAt,url:await getSignedUrl(s3,new GetObjectCommand({Bucket:bucket(),Key:x.objectKey}),{expiresIn:300})})))};
}
