/** Explicit account-to-student links. No name, email or family-ID inference authorises access. */
import {GetCommand,QueryCommand,PutCommand,UpdateCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {makeRoutedClient} from './tableRouter.ts';
import {demandInstitution,httpError} from './model.ts';
import {isStudentRecordId,isAccountSubject,canReadStudent} from './accessRules.ts';
import {randomUUID} from 'node:crypto';
import {retryVerifiedAdultSelfAccess} from './adultSelfAccessRetry.ts';
import {CognitoIdentityProviderClient,ListUsersCommand} from '@aws-sdk/client-cognito-identity-provider';
import type {Claims,InstitutionId} from './model.ts';
const db=makeRoutedClient();
// Sadhana v11.7.2 identity resolver. Backend only; never expose a free-form subject search.
const identityCognito=new CognitoIdentityProviderClient({});
export const verifiedParentIdentity=(subject:string,users:readonly {Username?:string;Enabled?:boolean;Attributes?:readonly {Name?:string;Value?:string}[]}[])=>{
 const matches=users.filter(u=>u.Attributes?.some(a=>a.Name==='sub'&&a.Value===subject));
 if(matches.length!==1||matches[0].Enabled===false)return null;
 const attr=(name:string)=>matches[0].Attributes?.find(a=>a.Name===name)?.Value||'';
 const email=attr('email').trim();
 if(attr('email_verified')!=='true'||!email||!email.includes('@'))return null;
 const name=(attr('name')||[attr('given_name'),attr('family_name')].filter(Boolean).join(' ')).trim();
 return name?{name,email,verified:true as const}:null;
};
async function parentIdentities(subjects:string[]){
 const pool=process.env.SADHANA_COGNITO_USER_POOL_ID;
 if(!pool)throw httpError(503,'Cognito identity directory is not configured');
 const result:Record<string,{name:string;email:string;verified:true}>={};
 for(const sub of subjects){
  if(!validSub(sub))continue;
  // Cognito sub is an immutable identifier; exact-match response is checked again.
  const page=await identityCognito.send(new ListUsersCommand({UserPoolId:pool,Filter:`sub = "${sub}"`,Limit:2}));
  const identity=verifiedParentIdentity(sub,page.Users||[]);
  if(identity)result[sub]=identity;
 }
 return result;
}
const table=()=>{if(!process.env.SADHANA_TABLE_NAME)throw Error('Missing table');return process.env.SADHANA_TABLE_NAME};
const validInst=(v:string):InstitutionId=>{if(v!=='raaga'&&v!=='sruti')throw httpError(400,'Choose an academy');return v};
const validSub=isAccountSubject;
const validStudent=isStudentRecordId;
const key=(inst:InstitutionId,sub:string,studentId:string)=>({PK:`ACCESS#${inst}#${sub}`,SK:`STUDENT#${studentId}`});
const publicLink=(x:any)=>({studentId:x.studentId,institution:x.institution,kind:x.kind,status:x.status,version:x.version,updatedAt:x.updatedAt});
export async function myStudentLinks(instRaw:string,claims:Claims){
 const inst=validInst(instRaw);if(!claims.sub)throw httpError(401,'Sign in required');
 try{await retryVerifiedAdultSelfAccess(claims.sub,inst)}catch(e){console.error('Verified adult self-access retry deferred',{errorType:e instanceof Error?e.name:'Unknown'});}
 let last:any;const result:any[]=[];
 do{const page=await db.send(new QueryCommand({TableName:table(),KeyConditionExpression:'PK=:pk',ExpressionAttributeValues:{':pk':`ACCESS#${inst}#${claims.sub}`},ExclusiveStartKey:last,Limit:100,ConsistentRead:true}));result.push(...(page.Items||[]));last=page.LastEvaluatedKey;if(result.length>100)throw httpError(413,'Too many linked students')}while(last);
 return {records:result.filter(r=>canReadStudent(r,r.studentId,inst)).map(publicLink)};
}
// Resolve the public roll number only on the server. Never disclose student names
// or details to an unapproved parent requesting a link.
async function studentIdForRoll(rollNumber:string):Promise<string>{
 if(!/^\d{3}-\d{3}$/.test(rollNumber))throw httpError(400,'Enter a valid roll number (for example 001-002)');
 let cursor:any;const matches:string[]=[];let examined=0;
 do{
  const page=await db.send(new QueryCommand({TableName:table(),KeyConditionExpression:'PK=:pk',ExpressionAttributeValues:{':pk':'OPS#GLOBAL#STUDENT'},ConsistentRead:true,ExclusiveStartKey:cursor,Limit:100}));
  for(const item of page.Items||[]){examined++;if(item.rollNumber===rollNumber&&!item.archived&&validStudent(item.id))matches.push(item.id);}
  if(examined>10000)throw httpError(503,'Student directory lookup unavailable; contact the academy');
  cursor=page.LastEvaluatedKey;
 }while(cursor);
 if(matches.length!==1)throw httpError(400,'Unable to process this roll number. Contact the academy to verify your registration.');
 return matches[0];
}
export async function requestStudentAccess(instRaw:string,claims:Claims,body:any){
 const inst=validInst(instRaw);if(!validSub(claims.sub))throw httpError(401,'Verified account required');
 if(!body||Object.keys(body).some(k=>!['studentId','rollNumber','kind','beneficiarySubject'].includes(k))||!['student','guardian'].includes(body.kind)||Boolean(body.studentId)===Boolean(body.rollNumber)|| (body.studentId&&!validStudent(body.studentId)) || (body.rollNumber&&typeof body.rollNumber!=='string'))throw httpError(400,'Provide a roll number and student/guardian access type');
 const resolvedStudentId=body.rollNumber?await studentIdForRoll(body.rollNumber):body.studentId;
 // Only an administrator may initiate a guardian request on behalf of a different account.
 // This records the BENEFICIARY, not the administrator performing the request.
 const beneficiary=body.beneficiarySubject||claims.sub!;
 if(!validSub(beneficiary))throw httpError(400,'Invalid beneficiary account');
 if(beneficiary!==claims.sub){demandInstitution(claims,inst);if(body.kind!=='guardian')throw httpError(400,'On-behalf links must be guardian requests');}
 const now=new Date().toISOString(),k=key(inst,beneficiary,resolvedStudentId);
 // Does not reveal whether a claimed student ID exists, and grants zero permissions.
 try{await db.send(new PutCommand({TableName:table(),Item:{...k,institution:inst,studentId:resolvedStudentId,subject:beneficiary,requestedBy:claims.sub,kind:body.kind,status:'pending',version:1,createdAt:now,updatedAt:now,GSI1PK:`ACCESS_REQUEST#${inst}`,GSI1SK:`${now}#${beneficiary}#${resolvedStudentId}`},ConditionExpression:'attribute_not_exists(PK)'}))}
 catch(e:any){
  if(e.name!=='ConditionalCheckFailedException')throw e;
  // An existing revoked/rejected link can be re-requested, but never automatically reapproved.
  // Reuse the verified account/student identity and its current version, avoiding duplicate links.
  const previous=(await db.send(new GetCommand({TableName:table(),Key:k,ConsistentRead:true}))).Item;
  if(previous?.kind===body.kind&&previous?.status==='approved')return {submitted:false,status:'approved'};
  if(previous?.kind===body.kind&&previous?.status==='pending')return {submitted:false,status:'pending'};
  if(!previous||!['revoked','rejected'].includes(previous.status)||previous.kind!==body.kind)throw httpError(409,'Request already exists with a different access type. Contact the academy.');
  try{await db.send(new UpdateCommand({TableName:table(),Key:k,
   UpdateExpression:'SET #status=:pending, #version=:next, updatedAt=:now, GSI1PK=:gpk, GSI1SK=:gsk REMOVE reviewedBy',
   ConditionExpression:'#version=:previous AND #status=:oldStatus AND #kind=:kind',
   ExpressionAttributeNames:{'#status':'status','#version':'version','#kind':'kind'},
   ExpressionAttributeValues:{':pending':'pending',':next':previous.version+1,':now':now,':gpk':`ACCESS_REQUEST#${inst}`,':gsk':`${now}#${claims.sub}#${resolvedStudentId}`,':previous':previous.version,':oldStatus':previous.status,':kind':body.kind}
  }))}catch(updateError:any){if(updateError.name==='ConditionalCheckFailedException')throw httpError(409,'Access request changed. Refresh and retry.');throw updateError}
 }
 return {submitted:true,status:'pending'};
}
export async function listAccessRequests(instRaw:string,claims:Claims){
 const inst=validInst(instRaw);demandInstitution(claims,inst);
 // A dedicated institution partition is required for safe paginated admin queues.
 let last:any;const records:any[]=[];
 do{const result=await db.send(new QueryCommand({TableName:table(),IndexName:'GSI1',KeyConditionExpression:'GSI1PK=:pk',ExpressionAttributeValues:{':pk':`ACCESS_REQUEST#${inst}`},ExclusiveStartKey:last,Limit:100}));records.push(...(result.Items||[]));last=result.LastEvaluatedKey;if(records.length>2000)throw httpError(413,'Use a narrower access queue')}while(last);
 const subs=[...new Set(records.map(r=>r.subject).filter((v):v is string=>typeof v==='string'))];
 if(subs.length>100)throw httpError(413,'Too many account identities; narrow the queue');
 // Fail closed: do not mark an identity verified if Cognito is unavailable.
 let identities:Record<string,{name:string;email:string;verified:true}>={};
 try{identities=await parentIdentities(subs)}catch(e){console.error('Guardian identity resolution unavailable',{errorType:e instanceof Error?e.name:'Unknown'});}
 return {records:records.map(r=>({...publicLink(r),subject:r.subject})),identities};
}
export async function decideStudentAccess(instRaw:string,claims:Claims,body:any){
 const inst=validInst(instRaw);demandInstitution(claims,inst);
 if(!body||Object.keys(body).some(k=>!['subject','studentId','decision','expectedVersion','relationshipVerified'].includes(k))||!validSub(body.subject)||!validStudent(body.studentId)||!['approved','revoked','rejected'].includes(body.decision)||!Number.isInteger(body.expectedVersion))throw httpError(400,'Invalid access decision');
 if(body.decision==='approved'&&body.relationshipVerified!==true)throw httpError(400,'Confirm independent relationship verification before approval');
 // Confirm the existing global student identity before any approval.
 if(body.decision==='approved'){
  const student=await db.send(new GetCommand({TableName:table(),Key:{PK:'OPS#GLOBAL#STUDENT',SK:`ITEM#${body.studentId}`},ConsistentRead:true}));
  if(!student.Item||student.Item.archived)throw httpError(404,'Active student record not found');
  // Profile access is independent of class enrolment. Never cross academy boundaries.
  if(student.Item.institution!==inst){const records=await db.send(new QueryCommand({TableName:table(),KeyConditionExpression:'PK=:pk',ExpressionAttributeValues:{':pk':`OPS#${inst}#ENROLMENT`},ConsistentRead:true}));if(!(records.Items||[]).some(e=>e.studentId===body.studentId&&!e.archived))throw httpError(409,'Student has no membership in this academy');}
 }
 if(body.decision==='approved' && body.subject===claims.sub){
  const allow=(process.env.SADHANA_SUPER_ADMIN_SUBJECTS||'').split(',').map(s=>s.trim()).filter(Boolean);
  if(!claims.sub||!allow.includes(claims.sub))throw httpError(403,'Only a designated Super Admin may approve their own access request');
 }
 const now=new Date().toISOString();
 try{await db.send(new TransactWriteCommand({TransactItems:[{Update:{TableName:table(),Key:key(inst,body.subject,body.studentId),UpdateExpression:'SET #s=:status, #v=:next, updatedAt=:now, reviewedBy=:actor',ConditionExpression:'#v=:expected AND #s=:currentStatus AND attribute_exists(PK)',ExpressionAttributeNames:{'#s':'status','#v':'version'},ExpressionAttributeValues:{':status':body.decision,':next':body.expectedVersion+1,':now':now,':actor':claims.sub,':expected':body.expectedVersion,':currentStatus':body.decision==='approved'?'pending':'approved'}}},{Put:{TableName:table(),Item:{PK:`AUDIT#${inst}`,SK:`ACCESS#${now}#${randomUUID()}`,entityType:'audit',action:'studentAccessDecision',subject:body.subject,studentId:body.studentId,decision:body.decision,actor:claims.sub,selfApproved:body.subject===claims.sub,relationshipVerified:body.decision==='approved'&&body.relationshipVerified===true,at:now},ConditionExpression:'attribute_not_exists(PK)'}}]}))}catch(e:any){if(e.name==='TransactionCanceledException')throw httpError(409,'Request changed. Refresh before deciding.');throw e}
 return {updated:true,status:body.decision};
}
export async function myStudentOverview(instRaw:string,claims:Claims){
 const inst=validInst(instRaw);const links=(await myStudentLinks(inst,claims)).records;
 const records=[] as any[];
 for(const link of links){
  const student=(await db.send(new GetCommand({TableName:table(),Key:{PK:'OPS#GLOBAL#STUDENT',SK:`ITEM#${link.studentId}`},ConsistentRead:true}))).Item;
  if(!student||student.archived)continue;if(student.institution!==inst){const membership=await db.send(new QueryCommand({TableName:table(),KeyConditionExpression:'PK=:pk',ExpressionAttributeValues:{':pk':`OPS#${inst}#ENROLMENT`},ConsistentRead:true}));if(!(membership.Items||[]).some(e=>e.studentId===link.studentId&&!e.archived))continue;}
  // Minimal student fields only; practice and timetable are added through individually scoped APIs.
  records.push({id:student.id,name:student.name,rollNumber:student.rollNumber||'',kind:link.kind});
 }
 return {records};
}
