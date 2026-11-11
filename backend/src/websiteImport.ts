import {entityTable} from './entityTables.mjs';
import {createHash} from 'node:crypto';
/** Website import. Registration approval verifies submitted family relationships;
 * Cognito provisioning and external website writes remain separate. */
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,TransactWriteCommand,UpdateCommand} from '@aws-sdk/lib-dynamodb';
import {fetchWebsiteRegistration,updateWebsiteRegistrationImport} from './websiteRegistrationGateway.ts';
import {expectedWebsiteMapping} from './websiteSyncCore.mjs';
import {demandInstitution,httpError} from './model.ts';
import type {Claims, InstitutionId} from './model.ts';
import {markerId,prepareWebsiteImport} from './websiteImportCore.mjs';
import {prepareLegacyImportBridge} from './legacyImportBridge.mjs';
import {toApprovedM9Registration} from './srutiIntakeCore.mjs';
import {canonicalRaagaRegistration} from './raagaImportSource.mjs';
import {assertRaagaWebsiteSyncPolicy} from './raagaWebsiteSyncPolicy.mjs';
const db=DynamoDBDocumentClient.from(new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'}),{marshallOptions:{removeUndefinedValues:true}});
// Resolve table names on each operation; do not throw at Lambda cold start before final-mode guardrails run.
const tables={get families(){return entityTable('families')},get people(){return entityTable('people')},get 'family-links'(){return entityTable('family-links')},get counters(){return entityTable('counters')},get registrations(){return entityTable('registrations')},get audit(){return entityTable('audit')}} as const;
const keys={families:'familyId',people:'personId','family-links':'linkId',counters:'counterId',registrations:'registrationId',audit:'auditId'} as const;
const approvedShape=(raw:any)=>raw?.registration??raw?.record??raw?.item??raw?.data??raw;
const fail=(code:number,message:string)=>httpError(code,message);
const normalize=(v:any):any=>Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([,x])=>x!==null&&x!==undefined).map(([k,x])=>[k,normalize(x)])):v;
const counterKey=(inst:InstitutionId,name:'FAMILY_NUMBER'|'STUDENT_ROLL')=>`${inst}#${name}`;
const contactHash=(...parts:string[])=>createHash('sha256').update(JSON.stringify(parts)).digest('hex');
// Only these confirmed final-table gates may bypass the older M95 pilot flags.
const finalRaaga=()=>process.env.SADHANA_ENTITY_TABLE_SET==='final' &&
 process.env.SADHANA_ENTITY_FINAL_ACK==='enabled' && process.env.SADHANA_DATA_MODE!=='split';
async function getCounter(inst:InstitutionId,name:'FAMILY_NUMBER'|'STUDENT_ROLL'){
 const item=(await db.send(new GetCommand({TableName:tables.counters,Key:{counterId:counterKey(inst,name)},ConsistentRead:true}))).Item;
 if(item&&(!Number.isSafeInteger(item.lastAllocated)||item.lastAllocated<0))throw fail(409,'Invalid roll-number sequence; review required.');
 return Number(item?.lastAllocated??0);
}
function counterWrite(inst:InstitutionId,name:'FAMILY_NUMBER'|'STUDENT_ROLL',previous:number,next:number,now:string){
 const key={counterId:counterKey(inst,name)};
 return {Update:{TableName:tables.counters,Key:key,UpdateExpression:'SET lastAllocated=:next, institutionId=:inst, sequenceType=:kind, updatedAt=:now',ConditionExpression:previous===0?'attribute_not_exists(counterId) OR lastAllocated = :previous':'lastAllocated = :previous',ExpressionAttributeValues:{':next':next,':inst':inst,':kind':name,':now':now,':previous':previous}}};
}
export async function m95ImportApprovedWebsiteRegistration(inst:InstitutionId,claims:Claims,registrationId:string,execute=false,mode:'fresh'|'legacy-bridge'='fresh',scopedSrutiRoute=false){
 demandInstitution(claims,inst);
 // Only the authenticated Sruti-specific registration route may use this
 // narrow import gate. Existing Raagasudha and M9 onboarding rules are unchanged.
 if(scopedSrutiRoute&&(inst!=='sruti'||mode!=='fresh'))throw fail(403,'Invalid scoped Sruti import.');
 if(!scopedSrutiRoute&&!(inst==='raaga'&&finalRaaga())&&process.env.M95_ONBOARDING_MODE!=='enabled')throw fail(404,'Not enabled.');
 if(execute&&(scopedSrutiRoute
   ? process.env.M91_SRUTI_IMPORT_WRITES!=='enabled'
   : (inst==='raaga'&&finalRaaga()
     ? (mode!=='fresh'||process.env.SADHANA_FINAL_RAAGA_IMPORT_WRITES!=='enabled'||process.env.SADHANA_FINAL_RAAGA_IDENTITY_RECONCILED!=='enabled')
     : ((mode==='fresh'&&process.env.M95_WEBSITE_IMPORT_WRITES!=='enabled')||(mode==='legacy-bridge'&&process.env.M9_LEGACY_BRIDGE_WRITES!=='enabled')))))throw fail(403,'Website import writes are disabled.');
 if(!((inst==='raaga'&&/^RS-[A-Za-z0-9_-]{1,110}$/.test(registrationId))||(inst==='sruti'&&mode==='fresh'&&/^SR-[A-Za-z0-9-]{1,110}$/.test(registrationId))))throw fail(400,'Invalid website registration identifier.');
 const id=markerId(inst,registrationId);
 const already=(await db.send(new GetCommand({TableName:tables.registrations,Key:{registrationId:id},ConsistentRead:true}))).Item;
 if(already){if(already.institutionId!==inst||already.externalRegistrationId!==registrationId)throw fail(409,'Registration identity collision.');return {alreadyImported:true,registrationId:id,familyId:already.familyId,studentIds:already.studentIds,externalSyncPending:inst==='raaga'&&!['synced','legacy-authoritative'].includes(already.websiteSyncStatus),guardianRelationshipsVerified:already.identityResolutionStatus==='registration_relationships_verified'};}
 const external=inst==='raaga'?approvedShape(await fetchWebsiteRegistration(registrationId)):undefined;
 // The existing Raagasudha intake stores the institution as RAAGASUDHA.
 // Only this exact, trusted external representation is normalised.
 const remote=inst==='sruti'
  ?toApprovedM9Registration((await db.send(new GetCommand({TableName:tables.registrations,Key:{registrationId},ConsistentRead:true}))).Item)
  :canonicalRaagaRegistration(external);
 if(!remote||remote.registrationId!==registrationId||remote.reviewStatus!=='approved')throw fail(409,'Website registration approval or identity mismatch.');
 const [family,student]=await Promise.all([getCounter(inst,'FAMILY_NUMBER'),getCounter(inst,'STUDENT_ROLL')]);
 const now=new Date().toISOString();
 const plan=mode==='legacy-bridge'
  ?prepareLegacyImportBridge(remote,inst,claims.sub,{family,student},now)
  :prepareWebsiteImport(remote,inst,claims.sub,{family,student},now);
 // Contact uniqueness is per academy. Keep the same parent email eligible for
 // a separate institution family so the administrator can attach that family
 // to the parent's existing verified Cognito account after review. Also check
 // both historical key formats to prevent duplicate families within one
 // academy after the guard-key migration.
 const primaryEmail=String(plan.items.find((x:any)=>x.table==='families')?.item?.email||'').trim().toLowerCase();
 const contactKeys=[...new Set([plan.contactGuardId,`CONTACT#${inst}#${contactHash(inst,primaryEmail)}`,`CONTACT#${contactHash(primaryEmail)}`])];
 const contacts=await Promise.all(contactKeys.map(async counterId=>({counterId,item:(await db.send(new GetCommand({TableName:tables.counters,Key:{counterId},ConsistentRead:true}))).Item})));
 for(const {counterId,item} of contacts){
  if(!item)continue;
  let ownerInstitution=item.institutionId;
  if(!['raaga','sruti'].includes(ownerInstitution)&&item.familyId){
   const owner=(await db.send(new GetCommand({TableName:tables.families,Key:{familyId:item.familyId},ConsistentRead:true}))).Item;
   if(Array.isArray(owner?.institutionIds)&&owner.institutionIds.length===1)ownerInstitution=owner.institutionIds[0];
  }
  if(!['raaga','sruti'].includes(ownerInstitution))throw fail(409,'Parent email is already reserved by a family that needs manual institution review.');
  if(ownerInstitution===inst)throw fail(409,'A Sadhana family already uses this parent email in this institution. Open that family to review its learners before importing.');
  if(counterId===plan.contactGuardId)throw fail(409,'Parent contact identity conflicts with an existing family key. Review the family identity before importing.');
 }
 if(!execute)return {preview:true,registrationId:id,familyNumber:plan.familyNumber,studentCount:plan.studentMappings.length,verifiedGuardianLinks:plan.verifiedGuardianLinks??0,externalSyncPending:inst==='raaga'&&mode!=='legacy-bridge',legacyBridge:mode==='legacy-bridge',writeCount:plan.items.length+2+(inst==='sruti'?1:0),readyForExecute:true,guardianRelationshipsVerified:mode!=='legacy-bridge'};
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
   if(committed&&committed.institutionId===inst&&committed.externalRegistrationId===registrationId)return {alreadyImported:true,registrationId:id,familyId:committed.familyId,studentIds:committed.studentIds,externalSyncPending:inst==='raaga',guardianRelationshipsVerified:committed.identityResolutionStatus==='registration_relationships_verified'};
   throw fail(409,'The registration or family details changed. Refresh and try again.');
  }
  throw e;
 }
 return {imported:true,alreadyImported:false,registrationId:id,familyId:plan.familyId,studentIds:plan.studentMappings.map((x:any)=>x.studentId),studentRollNumbers:Object.fromEntries(plan.studentMappings.map((x:any)=>[x.sourcePersonId,x.rollNumber])),verifiedGuardianLinks:plan.verifiedGuardianLinks??0,externalSyncPending:inst==='raaga'&&mode!=='legacy-bridge',legacyBridge:mode==='legacy-bridge',provisioningPending:true,guardianRelationshipsVerified:mode!=='legacy-bridge'};
}

/** Recoverable post-transaction website sync. Does not change relationship or account state. */
export async function m95ReconcileWebsiteImport(inst:InstitutionId,claims:Claims,externalId:string,execute=false){
 demandInstitution(claims,inst);
 // The final writer must not depend on the old M95 pilot switches.
 // In split/M9 mode, retain the existing independent M95 policy unchanged.
 assertRaagaWebsiteSyncPolicy(execute);
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
 return {registrationId,websiteSyncStatus:'synced',alreadySynced:result.alreadySynced,provisioningPending:true};
}
