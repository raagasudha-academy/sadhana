/** Website revocation coordinator: fence -> dependency scan -> conditional transaction -> upstream CAS reset.
 * The feature flags remain OFF unless operations independently validates live writer coverage.
 */
import {randomUUID} from 'node:crypto';
import {GetCommand,QueryCommand,TransactWriteCommand,UpdateCommand} from '@aws-sdk/lib-dynamodb';
import {makeRoutedClient} from './tableRouter.ts';
import {previewWebsiteRevocation} from './websiteRevocationPreflight.ts';
import {fetchWebsiteRegistration,resetWebsiteRegistrationImport} from './websiteRegistrationGateway.ts';
import {acquireFenceTransaction,releaseFenceTransaction,identityKey,journalKey,type FenceStudent} from './revocationFence.ts';
const db=makeRoutedClient();
const table=()=>{if(!process.env.SADHANA_TABLE_NAME)throw Error('SADHANA_TABLE_NAME missing');return process.env.SADHANA_TABLE_NAME;};
const fail=(status:number,message:string)=>Object.assign(new Error(message),{status});
const mkey=(id:string)=>({PK:'OPS#GLOBAL#WEB_IMPORT',SK:`ITEM#${id}`});
const rkey=(kind:'FAMILY'|'STUDENT',id:string)=>({PK:`OPS#GLOBAL#${kind}`,SK:`ITEM#${id}`});
const get=async(Key:Record<string,string>)=>(await db.send(new GetCommand({TableName:table(),Key,ConsistentRead:true}))).Item;
const unwrap=(x:any)=>x?.registration??x?.record??x?.item??x?.data??x;
const canonical=(x:any)=>JSON.stringify(Object.entries(x||{}).sort(([a],[b])=>a.localeCompare(b)));
const validStudentId=(x:any)=>typeof x==='string'&&/^STUDENT-[a-f0-9-]{36}$/i.test(x);
function assertMapping(upstream:any,registrationId:string,marker:any){
 if(upstream?.registrationId!==registrationId||upstream?.reviewStatus!=='approved'||upstream?.sadhanaImport?.status!=='imported'||upstream.sadhanaImport.familyId!==marker.familyId||canonical(upstream.sadhanaImport.studentIds)!==canonical(marker.studentIds))throw fail(409,'Website import mapping does not match Sadhana.');
}
async function readOwned(registrationId:string){
 const marker=await get(mkey(registrationId));
 if(!marker||!marker.familyId||!marker.studentIds||!Object.keys(marker.studentIds).length)throw fail(409,'Incomplete import marker.');
 const studentIds=Object.values(marker.studentIds) as string[];
 if(studentIds.length>10||new Set(studentIds).size!==studentIds.length||!studentIds.every(validStudentId))throw fail(409,'Invalid imported student identifiers.');
 assertMapping(unwrap(await fetchWebsiteRegistration(registrationId)),registrationId,marker);
 const family=await get(rkey('FAMILY',marker.familyId));
 if(!family||family.institution!=='raaga'||(!marker.linkedExistingFamily&&family.sourceWebsiteRegistrationId!==registrationId))throw fail(409,'Family ownership mismatch.');
 if(!marker.linkedExistingFamily&&(!Number.isSafeInteger(family.version)||family.version<1))throw fail(409,'Family not versioned.');
 const students=[] as FenceStudent[];
 for(const id of studentIds){const s=await get(rkey('STUDENT',id));
  if(!s||s.sourceWebsiteRegistrationId!==registrationId||s.familyId!==marker.familyId||s.institution!=='raaga'||!Number.isSafeInteger(s.version)||s.version<1)throw fail(409,`Student ownership/version mismatch: ${id}`);
  students.push(s as FenceStudent);
 }
 const locksQuery=await db.send(new QueryCommand({TableName:table(),KeyConditionExpression:'PK = :pk AND begins_with(SK,:prefix)',ExpressionAttributeValues:{':pk':'OPS#GLOBAL#WEB_IMPORT',':prefix':'IDENTITY#'},ConsistentRead:true}));
 if(locksQuery.LastEvaluatedKey)throw fail(409,'Identity lock scan incomplete.');
 const locks=(locksQuery.Items||[]).filter(x=>x.sourceRegistrationId===registrationId);
 if(locks.length!==studentIds.length||new Set(locks.map(x=>x.SK)).size!==studentIds.length)throw fail(409,'Identity locks do not match imported students.');
 return {marker,studentIds,students,family,locks};
}
async function failClosedDependencies(registrationId:string){
 const report=await previewWebsiteRevocation(registrationId);
 if(report.blockers?.length)throw fail(409,`Revocation blocked: ${report.blockers.join('; ')}`);
}
export async function revokeWebsiteImport(registrationId:string,actorSub:string,confirmation:string){
 if(process.env.SADHANA_ENABLE_REVOKE_EXECUTION!=='true'||process.env.SADHANA_REVOKE_WRITER_FENCE_VERIFIED!=='true')throw fail(503,'Revocation remains disabled pending writer and integration validation.');
 if(!/^RS-[A-Za-z0-9_-]{1,110}$/.test(registrationId))throw fail(400,'Invalid registration ID.');
 if(confirmation!=='REVOKE')throw fail(400,'Type REVOKE to confirm.');
 if(!actorSub)throw fail(403,'Verified administrator required.');
 let journal=await get(journalKey(registrationId));
 if(journal?.status==='completed')return {registrationId,status:'completed',alreadyRevoked:true};
 if(journal?.status==='sadhana-deleted')return finishWebsiteReset(registrationId,journal);
 if(journal&&!['fenced','released'].includes(journal.status))throw fail(409,'Prior revocation requires administrator review.');
 // A released operation did not delete imported records. Re-validate ownership,
 // mapping and dependencies before creating a fresh fenced operation.
 const releasedJournal=journal?.status==='released'?journal:null;
 if(releasedJournal&&(!releasedJournal.operationId||!releasedJournal.actorSub))throw fail(409,'Released journal incomplete; manual review required.');
 if(releasedJournal)journal=undefined;
 let state=await readOwned(registrationId);
 if(!journal){
  // The initial preflight is advisory; the authoritative dependency scan is AFTER fencing.
  await failClosedDependencies(registrationId);
  const operationId=`REVOKE-${randomUUID()}`;
  try{await db.send(acquireFenceTransaction(table(),registrationId,state.marker.familyId,state.students,operationId,actorSub,new Date().toISOString(),releasedJournal?.operationId));}
  catch(e:any){if(e.name==='TransactionCanceledException')throw fail(409,'Concurrent identity change; revocation did not start.');throw e;}
  journal=await get(journalKey(registrationId));
  state=await readOwned(registrationId);
  if(!journal||journal.operationId!==operationId||journal.status!=='fenced')throw fail(409,'Fence confirmation failed; manual recovery required.');
 }else if(journal.actorSub!==actorSub){
  throw fail(403,'A different administrator owns the interrupted revocation.');
 }
 const op=journal.operationId as string;
 // Ensure every identity remains fenced to THIS operation. Version must be the
 // originally observed version +1; no other mutation may have occurred.
 if(state.students.some(s=>!Number.isSafeInteger(journal.studentVersions?.[s.id])))throw fail(409,'Incomplete fence journal; manual recovery required.');
 for(const s of state.students){const base=journal.studentVersions[s.id];
  if(s.version!==base+1||(s as any).revocationState!=='fenced'||(s as any).revocationOperationId!==op)throw fail(409,'Identity fence changed; manual recovery required.');
 }
 // Scan AFTER the fence: all dependent writers condition-check these fenced identities.
 // On a scan blocker, leave the durable fence for administrator recovery rather than
 // accidentally allowing writes while state is uncertain.
 await failClosedDependencies(registrationId);
 const items:any[]=[
  {Delete:{TableName:table(),Key:mkey(registrationId),ConditionExpression:'familyId=:family AND attribute_exists(PK)',ExpressionAttributeValues:{':family':state.marker.familyId}}},
  ...state.students.map(s=>({Delete:{TableName:table(),Key:identityKey(s.id),ConditionExpression:'sourceWebsiteRegistrationId=:id AND familyId=:fam AND #v=:version AND revocationState=:fenced AND revocationOperationId=:op',ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':id':registrationId,':fam':state.marker.familyId,':version':s.version,':fenced':'fenced',':op':op}}})),
  ...state.locks.map(lock=>({Delete:{TableName:table(),Key:{PK:lock.PK,SK:lock.SK},ConditionExpression:'sourceRegistrationId=:id',ExpressionAttributeValues:{':id':registrationId}}})),
  ...(state.marker.linkedExistingFamily?[]:[{Delete:{TableName:table(),Key:rkey('FAMILY',state.marker.familyId),ConditionExpression:'sourceWebsiteRegistrationId=:id AND #v=:version',ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':id':registrationId,':version':state.family.version}}}]),
  {Update:{TableName:table(),Key:journalKey(registrationId),UpdateExpression:'SET #status=:deleted, deletedAt=:at, expectedFamilyId=:family, expectedStudentIds=:mapping, removedStudentIds=:ids, familyDisposition=:disposition',ConditionExpression:'operationId=:op AND #status=:fenced',ExpressionAttributeNames:{'#status':'status'},ExpressionAttributeValues:{':op':op,':fenced':'fenced',':deleted':'sadhana-deleted',':at':new Date().toISOString(),':family':state.marker.familyId,':mapping':state.marker.studentIds,':ids':state.studentIds,':disposition':state.marker.linkedExistingFamily?'retained-shared':'deleted'}}},
  {Put:{TableName:table(),Item:{PK:'AUDIT#raaga',SK:`AT#${new Date().toISOString()}#${op}`,entityType:'AUDIT',type:'WEBSITE_IMPORT_REVOKED_SADHANA',registrationId,operationId:op,actorSub,studentIds:state.studentIds,familyId:state.marker.familyId,at:new Date().toISOString()},ConditionExpression:'attribute_not_exists(PK)'}}
 ];
 if(items.length>100)throw fail(409,'Revocation transaction too large.');
 try{await db.send(new TransactWriteCommand({TransactItems:items,ClientRequestToken:(op.slice(0,27)+'-delete')}));}
 catch(e:any){if(e.name==='TransactionCanceledException')throw fail(409,'Concurrent change or fence mismatch; deletion not committed. Retry after review.');throw e;}
 journal=await get(journalKey(registrationId));
 if(!journal||journal.status!=='sadhana-deleted')throw fail(503,'Commit state uncertain; verify journal before retrying.');
 return finishWebsiteReset(registrationId,journal);
}
async function finishWebsiteReset(registrationId:string,journal:any){
 try{
  await resetWebsiteRegistrationImport(registrationId,{operationId:journal.operationId,actor:journal.actorSub,
   expectedFamilyId:journal.expectedFamilyId,expectedStudentIds:journal.expectedStudentIds,
   removedStudentIds:journal.removedStudentIds,familyDisposition:journal.familyDisposition});
  await db.send(new UpdateCommand({TableName:table(),Key:journalKey(registrationId),UpdateExpression:'SET #s=:done, completedAt=:now',ConditionExpression:'operationId=:op AND #s=:pending',ExpressionAttributeNames:{'#s':'status'},ExpressionAttributeValues:{':done':'completed',':pending':'sadhana-deleted',':now':new Date().toISOString(),':op':journal.operationId}}));
  return {registrationId,status:'completed',operationId:journal.operationId};
 }catch{
  return {registrationId,status:'website-reset-pending',operationId:journal.operationId,warning:'Sadhana deletion committed; website reset not confirmed. Retry this revocation. Do NOT activate again.'};
 }
}

/** Recovery path for a fenced operation that has NOT deleted data.
 * Does not touch the website or imported records. Never cancels after deletion.
 */
export async function cancelFencedWebsiteRevocation(registrationId:string,actorSub:string,confirmation:string){
 if(confirmation!=='CANCEL')throw fail(400,'Type CANCEL to release the fence.');
 if(!actorSub)throw fail(403,'Verified administrator required.');
 const journal=await get(journalKey(registrationId));
 if(!journal||journal.status!=='fenced'||journal.actorSub!==actorSub)throw fail(409,'No cancellable revocation owned by this administrator.');
 const entries=Object.entries(journal.studentVersions||{});
 if(!entries.length||entries.length>10)throw fail(409,'Fence journal invalid.');
 const students: FenceStudent[]=[];
 for(const [id,version] of entries){
  if(!Number.isSafeInteger(version))throw fail(409,'Fence journal version invalid.');
  const s=await get(identityKey(id));
  if(!s||s.version!==(version as number)+1||s.revocationState!=='fenced'||s.revocationOperationId!==journal.operationId||s.familyId!==journal.familyId||s.sourceWebsiteRegistrationId!==registrationId)throw fail(409,'Student identity changed; manual recovery required.');
  students.push({...s,version} as FenceStudent);
 }
 try{await db.send(releaseFenceTransaction(table(),registrationId,students,journal.operationId));}
 catch(e:any){if(e.name==='TransactionCanceledException')throw fail(409,'Fence changed; manual recovery required.');throw e;}
 return {registrationId,status:'released',operationId:journal.operationId};
}
