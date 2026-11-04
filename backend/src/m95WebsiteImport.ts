/** M9.5 opt-in website import. No Cognito provisioning or external website writes. */
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,TransactWriteCommand,UpdateCommand} from '@aws-sdk/lib-dynamodb';
import {fetchWebsiteRegistration,updateWebsiteRegistrationImport} from './websiteRegistrationGateway.ts';
import {expectedWebsiteMapping} from './m95WebsiteSyncCore.mjs';
import {demandInstitution,httpError} from './model.ts';
import type {Claims, InstitutionId} from './model.ts';
import {markerId,prepareWebsiteImport} from './m95WebsiteImportCore.mjs';
import {prepareLegacyImportBridge} from './m9LegacyImportBridge.mjs';
import {toApprovedM9Registration} from './m91SrutiIntakeCore.mjs';
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
export async function m95ImportApprovedWebsiteRegistration(inst:InstitutionId,claims:Claims,registrationId:string,execute=false,mode:'fresh'|'legacy-bridge'='fresh'){
 demandInstitution(claims,inst);
 if(process.env.M95_ONBOARDING_MODE!=='enabled')throw fail(404,'Not enabled.');
 if(execute&&((mode==='fresh'&&process.env.M95_WEBSITE_IMPORT_WRITES!=='enabled')||(mode==='legacy-bridge'&&process.env.M9_LEGACY_BRIDGE_WRITES!=='enabled')))throw fail(403,'M9 website import writes are disabled.');
 if(!((inst==='raaga'&&/^RS-[A-Za-z0-9_-]{1,110}$/.test(registrationId))||(inst==='sruti'&&mode==='fresh'&&/^SR-[A-Za-z0-9-]{1,110}$/.test(registrationId))))throw fail(400,'Invalid website registration identifier.');
 const id=markerId(inst,registrationId);
 const already=(await db.send(new GetCommand({TableName:tables.registrations,Key:{registrationId:id},ConsistentRead:true}))).Item;
 if(already){if(already.institutionId!==inst||already.externalRegistrationId!==registrationId)throw fail(409,'Registration identity collision.');return {alreadyImported:true,registrationId:id,familyId:already.familyId,studentIds:already.studentIds,externalSyncPending:inst==='raaga'&&already.websiteSyncStatus!=='legacy-authoritative',guardianApprovalPending:true};}
 const remote=inst==='sruti'
  ?toApprovedM9Registration((await db.send(new GetCommand({TableName:tables.registrations,Key:{registrationId},ConsistentRead:true}))).Item)
  :approvedShape(await fetchWebsiteRegistration(registrationId));
 if(!remote||remote.registrationId!==registrationId||remote.reviewStatus!=='approved')throw fail(409,'Website registration approval or identity mismatch.');
 const [family,student]=await Promise.all([getCounter(inst,'FAMILY_NUMBER'),getCounter(inst,'STUDENT_ROLL')]);
 const now=new Date().toISOString();
 const plan=mode==='legacy-bridge'
  ?prepareLegacyImportBridge(remote,inst,claims.sub,{family,student},now)
  :prepareWebsiteImport(remote,inst,claims.sub,{family,student},now);
 // A returning primary contact must go through explicit identity/family review;
 // do not silently allocate another household or grant guardian access.
 const existingContact=(await db.send(new GetCommand({TableName:tables.counters,Key:{counterId:plan.contactGuardId},ConsistentRead:true}))).Item;
 if(existingContact)throw fail(409,'Primary contact belongs to an existing M9 family. Administrator family reconciliation is required.');
 if(!execute)return {preview:true,registrationId:id,familyNumber:plan.familyNumber,studentCount:plan.studentMappings.length,pendingGuardianLinks:plan.pendingGuardianLinks,externalSyncPending:inst==='raaga'&&mode!=='legacy-bridge',legacyBridge:mode==='legacy-bridge',writeCount:plan.items.length+2+(inst==='sruti'?1:0),readyForExecute:true,guardianApprovalPending:true};
 // The registration record and identity guards participate in the SAME transaction as counters and people.
 // Conditional writes ensure concurrent retries cannot allocate the same roll number.
 const tx:any[]=[counterWrite(inst,'FAMILY_NUMBER',plan.counters.family.current,plan.counters.family.next,now),counterWrite(inst,'STUDENT_ROLL',plan.counters.student.current,plan.counters.student.next,now)];
 if(inst==='sruti')tx.push({Update:{TableName:tables.registrations,Key:{registrationId},UpdateExpression:'SET importStatus=:imported,updatedAt=:now',ConditionExpression:'institutionId=:inst AND #source=:source AND reviewStatus=:approved AND importStatus=:pending',ExpressionAttributeNames:{'#source':'source'},ExpressionAttributeValues:{':inst':'sruti',':source':'sruti-website',':approved':'approved',':pending':'pending',':imported':'imported',':now':now}}});
 for(const {table,item} of plan.items){
  const pk=keys[table as keyof typeof keys];
  tx.push({Put:{TableName:tables[table as keyof typeof tables],Item:normalize(item),ConditionExpression:`attribute_not_exists(${pk})`}});
 }
 try{await db.send(new TransactWriteCommand({TransactItems:tx}));}
 catch(e:any){
  if(e?.name==='TransactionCanceledException'||e?.name==='ConditionalCheckFailedException'){
   const committed=(await db.send(new GetCommand({TableName:tables.registrations,Key:{registrationId:id},ConsistentRead:true}))).Item;
   if(committed&&committed.institutionId===inst&&committed.externalRegistrationId===registrationId)return {alreadyImported:true,registrationId:id,familyId:committed.familyId,studentIds:committed.studentIds,externalSyncPending:inst==='raaga'};
   throw fail(409,'Import conflict or possible duplicate student. Resolve and retry.');
  }
  throw e;
 }
 return {imported:true,alreadyImported:false,registrationId:id,familyId:plan.familyId,studentIds:plan.studentMappings.map((x:any)=>x.studentId),studentRollNumbers:Object.fromEntries(plan.studentMappings.map((x:any)=>[x.sourcePersonId,x.rollNumber])),pendingGuardianLinks:plan.pendingGuardianLinks,externalSyncPending:inst==='raaga'&&mode!=='legacy-bridge',legacyBridge:mode==='legacy-bridge',provisioningPending:true,guardianApprovalPending:true};
}

/** Recoverable post-transaction website sync. Never makes guardian access approved. */
export async function m95ReconcileWebsiteImport(inst:InstitutionId,claims:Claims,externalId:string,execute=false){
 demandInstitution(claims,inst);
 if(process.env.M95_ONBOARDING_MODE!=='enabled')throw fail(404,'Not enabled.');
 if(execute && process.env.M95_WEBSITE_SYNC_WRITES!=='enabled')throw fail(403,'M9 website status writes are disabled.');
 if(inst!=='raaga'||!/^RS-[A-Za-z0-9_-]{1,110}$/.test(externalId))throw fail(400,'Unverified website source or invalid registration ID.');
 const registrationId=markerId(inst,externalId);
 const local=(await db.send(new GetCommand({TableName:tables.registrations,Key:{registrationId},ConsistentRead:true}))).Item;
 if(!local)throw fail(404,'M9 import not found; no website sync performed.');
 if(local.websiteSyncStatus==='legacy-authoritative')throw fail(409,'Legacy website mapping is authoritative; do not overwrite it from M9.');
 const remote=approvedShape(await fetchWebsiteRegistration(externalId));
 const result=expectedWebsiteMapping(local,remote,inst,externalId);
 if(!execute)return {preview:true,alreadySynced:result.alreadySynced,registrationId,websiteSyncPending:!result.alreadySynced,readyToSync:true};
 // Write the upstream mapping first. A failed local acknowledgement can be safely retried.
 if(!result.alreadySynced)await updateWebsiteRegistrationImport(externalId,result.mapping);
 const now=new Date().toISOString();
 await db.send(new UpdateCommand({TableName:tables.registrations,Key:{registrationId},
  UpdateExpression:'SET websiteSyncStatus = :synced, websiteSyncedAt = :now, updatedAt = :now',
  ConditionExpression:'attribute_exists(registrationId) AND institutionId = :inst AND externalRegistrationId = :external AND importStatus = :imported',
  ExpressionAttributeValues:{':synced':'synced',':now':now,':inst':inst,':external':externalId,':imported':'imported'}}));
 return {registrationId,websiteSyncStatus:'synced',alreadySynced:result.alreadySynced,provisioningPending:true,guardianApprovalPending:true};
}
