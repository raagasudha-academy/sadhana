/** Exact final-table facade over Raagasudha's existing external intake API.
 * The intake itself retains its independent DynamoDB table.
 * All methods fail closed; the old PK/SK importer is never used.
 */
const reply=(status,error)=>({status,body:{error}});
const recordId=v=>typeof v==='string'&&/^RS-[A-Za-z0-9_-]{1,110}$/.test(v);
const personId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(v);
const allow=(env,flag)=>env[flag]==='enabled';

export async function finalRaagaIntakeRoute(context,deps,env=process.env){
 const {parts,method,claims,query={},event={}}=context;
 if (!Array.isArray(parts)||parts[0]!=='website-registrations')return undefined;
 if (!claims?.sub)return reply(401,'Authenticated account required.');
 if (env.SADHANA_ENTITY_TABLE_SET!=='final'||env.SADHANA_ENTITY_FINAL_ACK!=='enabled'||env.SADHANA_DATA_MODE==='split')
   return reply(503,'Final-table cutover is not authorised.');
 const list=method==='GET'&&parts.length===1;
 const detail=method==='GET'&&parts.length===2&&recordId(parts[1]);
 const photo=method==='GET'&&parts.length===4&&parts[2]==='photos'&&recordId(parts[1])&&personId(parts[3]);
 const parentStatus=method==='GET'&&parts.length===3&&parts[2]==='access-status'&&recordId(parts[1]);
 const review=method==='PATCH'&&parts.length===2&&recordId(parts[1]);
 const imp=method==='POST'&&parts.length===3&&parts[2]==='import'&&recordId(parts[1]);
 const sync=method==='POST'&&parts.length===3&&parts[2]==='sync'&&recordId(parts[1]);
 const parentAction=method==='POST'&&parts.length===3&&recordId(parts[1])&&
   ['queue-parent-links','provision-parent','resend-parent-invitation'].includes(parts[2]);
 if (!list&&!detail&&!photo&&!parentStatus&&!review&&!imp&&!sync&&!parentAction)return reply(405,'Unsupported Raagasudha intake operation.');
 if ((list||detail||photo) && !allow(env,'SADHANA_FINAL_RAAGA_INTAKE_READS'))return reply(503,'Raagasudha intake reads are disabled.');
 if (parentStatus && !allow(env,'SADHANA_FINAL_RAAGA_PARENT_STATUS_READS'))return reply(503,'Raagasudha parent account status reads are disabled.');
 if (review && !allow(env,'SADHANA_FINAL_RAAGA_REVIEW_WRITES'))return reply(503,'Raagasudha review writes are disabled.');
 if (imp && !allow(env,'SADHANA_FINAL_RAAGA_IMPORT_PREVIEW'))return reply(503,'Raagasudha final import preview is disabled.');
 if (sync && !allow(env,'SADHANA_FINAL_RAAGA_WEBSITE_SYNC_WRITES'))return reply(503,'Raagasudha website status sync is disabled.');
 if (parentAction && !allow(env,'SADHANA_FINAL_RAAGA_PARENT_ACTION_READS'))return reply(503,'Canonical parent account actions are disabled.');
 if(list){
   deps.assertConfigured();
   const filters={};
   for(const key of ['status','locationId','from','to','limit'])if(query[key]!==undefined)filters[key]=query[key];
   return {status:200,body:await deps.list(filters)};
 }
 if(detail){deps.assertConfigured();return {status:200,body:await deps.get(parts[1])};}
 if(photo){deps.assertConfigured();return {status:200,body:await deps.photo(parts[1],parts[3])};}
 if(parentStatus){
   if(typeof deps.parentStatus!=='function')return reply(503,'Canonical parent account status reader is not configured.');
   deps.assertConfigured();
   return {status:200,body:await deps.parentStatus(parts[1])};
 }
 const body=deps.parse(event);
 if (!body||typeof body!=='object'||Array.isArray(body))return reply(400,'Invalid request body.');
 if(parentAction){
   if(typeof deps.parentAction!=='function')return reply(503,'Canonical parent action handler is not configured.');
   deps.assertConfigured();
   return {status:200,body:await deps.parentAction(parts[2],parts[1],body,claims)};
 }
 if(review){
   if(!['approved','discarded'].includes(body.reviewStatus)||Object.keys(body).some(k=>k!=='reviewStatus'))
     return reply(400,'Invalid review decision.');
   deps.assertConfigured();
   return {status:200,body:await deps.review(parts[1],body.reviewStatus,claims.sub)};
 }
 // A normal legacy import POST must never become a new-family write by accident.
 // Execute requires both independent release flags AND the exact registration
 // reference in the body; linking an existing family requires a separate review.
 const keys=Object.keys(body);
 if (sync) {
   if (keys.length!==1||body.confirmReference!==parts[1])
     return reply(400,'Confirm the exact registration reference to retry website sync.');
   if (!allow(env,'SADHANA_FINAL_RAAGA_IDENTITY_RECONCILED'))
     return reply(503,'Historical import identities have not been reconciled.');
   deps.assertConfigured();
   return {status:200,body:await deps.sync(parts[1],claims)};
 }
 if (keys.length===1&&body.preview===true){
   deps.assertConfigured();
   return {status:200,body:await deps.preview(parts[1],claims)};
 }
 if (keys.length!==2||body.preview!==false||body.confirmReference!==parts[1])
   return reply(503,'Import execution requires explicit reference confirmation; existing family links require separate review.');
 if (!allow(env,'SADHANA_FINAL_RAAGA_IMPORT_WRITES')||
     !allow(env,'SADHANA_FINAL_RAAGA_IDENTITY_RECONCILED'))
   return reply(503,'Raagasudha final import execution is disabled pending identity reconciliation.');
 deps.assertConfigured();
 const imported=await deps.execute(parts[1],claims);
 // The atomic Sadhana import is committed before any external website sync.
 // Provisioning and guardian approval remain independent and pending.
 return {status:200,body:{...imported,guardianAccessGranted:false,invitationSent:false}};
}
