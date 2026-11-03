/** M9.5 opt-in website import. No Cognito provisioning or external website writes. */
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {fetchWebsiteRegistration} from './websiteRegistrationGateway.ts';
import {demandInstitution,httpError} from './model.ts';
import type {Claims, InstitutionId} from './model.ts';
import {markerId,prepareWebsiteImport} from './m95WebsiteImportCore.mjs';
const db=DynamoDBDocumentClient.from(new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'}),{marshallOptions:{removeUndefinedValues:true}});
const tables={families:'sadhana-dev-m9-families',people:'sadhana-dev-m9-people','family-links':'sadhana-dev-m9-family-links',counters:'sadhana-dev-m9-counters',registrations:'sadhana-dev-m9-registrations',audit:'sadhana-dev-m9-audit'} as const;
const keys={families:'familyId',people:'personId','family-links':'linkId',counters:'counterId',registrations:'registrationId',audit:'auditId'} as const;
const approvedShape=(raw:any)=>raw?.registration??raw?.record??raw?.item??raw?.data??raw;
const fail=(code:number,message:string)=>httpError(code,message);
const normalize=(v:any):any=>Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([,x])=>x!==null&&x!==undefined).map(([k,x])=>[k,normalize(x)])):v;
const counterKey=(inst:InstitutionId,name:'FAMILY_NUMBER'|'STUDENT_ROLL')=>`${inst}#${name}`;
async function getCounter(inst:InstitutionId,name:'FAMILY_NUMBER'|'STUDENT_ROLL'){
 const item=(await db.send(new GetCommand({TableName:tables.counters,Key:{counterId:counterKey(inst,name)},ConsistentRead:true}))).Item;
 if(item&&(!Number.isSafeInteger(item.lastAllocated)||item.lastAllocated<0))throw fail(409,'Invalid roll-number sequence; review required.');
 return Number(item?.lastAllocated??0);
}
function counterWrite(inst:InstitutionId,name:'FAMILY_NUMBER'|'STUDENT_ROLL',previous:number,next:number,now:string){
 const key={counterId:counterKey(inst,name)};
 return {Update:{TableName:tables.counters,Key:key,UpdateExpression:'SET lastAllocated=:next, institutionId=:inst, sequenceType=:kind, updatedAt=:now',ConditionExpression:previous===0?'attribute_not_exists(counterId) OR lastAllocated = :previous':'lastAllocated = :previous',ExpressionAttributeValues:{':next':next,':inst':inst,':kind':name,':now':now,':previous':previous}}};
}
export async function m95ImportApprovedWebsiteRegistration(inst:InstitutionId,claims:Claims,registrationId:string,execute=false){
 demandInstitution(claims,inst);
 if(process.env.M95_ONBOARDING_MODE!=='enabled')throw fail(404,'Not enabled.');
 if(execute&&process.env.M95_WEBSITE_IMPORT_WRITES!=='enabled')throw fail(403,'M9 website import writes are disabled.');
 if(inst!=='raaga')throw fail(409,'Sruti website import requires a separately verified intake integration.');
 if(!/^RS-[A-Za-z0-9_-]{1,110}$/.test(registrationId))throw fail(400,'Invalid website registration identifier.');
 const id=markerId(inst,registrationId);
 const already=(await db.send(new GetCommand({TableName:tables.registrations,Key:{registrationId:id},ConsistentRead:true}))).Item;
 if(already){if(already.institutionId!==inst||already.externalRegistrationId!==registrationId)throw fail(409,'Registration identity collision.');return {alreadyImported:true,registrationId:id,familyId:already.familyId,studentIds:already.studentIds,externalSyncPending:true};}
 const remote=approvedShape(await fetchWebsiteRegistration(registrationId));
 if(!remote||remote.registrationId!==registrationId||remote.reviewStatus!=='approved')throw fail(409,'Website registration approval or identity mismatch.');
 const [family,student]=await Promise.all([getCounter(inst,'FAMILY_NUMBER'),getCounter(inst,'STUDENT_ROLL')]);
 const now=new Date().toISOString();
 const plan=prepareWebsiteImport(remote,inst,claims.sub,{family,student},now);
 if(!execute)return {preview:true,registrationId:id,familyNumber:plan.familyNumber,studentCount:plan.studentMappings.length,pendingGuardianLinks:plan.pendingGuardianLinks,externalSyncPending:true,writeCount:plan.items.length+2,readyForExecute:true};
 // The registration record and identity guards participate in the SAME transaction as counters and people.
 // Conditional writes ensure concurrent retries cannot allocate the same roll number.
 const tx:any[]=[counterWrite(inst,'FAMILY_NUMBER',plan.counters.family.current,plan.counters.family.next,now),counterWrite(inst,'STUDENT_ROLL',plan.counters.student.current,plan.counters.student.next,now)];
 for(const {table,item} of plan.items){
  const pk=keys[table as keyof typeof keys];
  tx.push({Put:{TableName:tables[table as keyof typeof tables],Item:normalize(item),ConditionExpression:`attribute_not_exists(${pk})`}});
 }
 try{await db.send(new TransactWriteCommand({TransactItems:tx}));}
 catch(e:any){
  if(e?.name==='TransactionCanceledException'||e?.name==='ConditionalCheckFailedException'){
   const committed=(await db.send(new GetCommand({TableName:tables.registrations,Key:{registrationId:id},ConsistentRead:true}))).Item;
   if(committed&&committed.institutionId===inst&&committed.externalRegistrationId===registrationId)return {alreadyImported:true,registrationId:id,familyId:committed.familyId,studentIds:committed.studentIds,externalSyncPending:true};
   throw fail(409,'Import conflict or possible duplicate student. Resolve and retry.');
  }
  throw e;
 }
 return {imported:true,alreadyImported:false,registrationId:id,familyId:plan.familyId,studentIds:plan.studentMappings.map((x:any)=>x.studentId),studentRollNumbers:Object.fromEntries(plan.studentMappings.map((x:any)=>[x.sourcePersonId,x.rollNumber])),pendingGuardianLinks:plan.pendingGuardianLinks,externalSyncPending:true,provisioningPending:true};
}
