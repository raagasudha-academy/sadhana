/** Non-destructive revocation safety audit. Never authorises deletion on its own. */
import {GetCommand,ScanCommand,DynamoDBDocumentClient} from '@aws-sdk/lib-dynamodb';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {makeRoutedClient,expectedTables} from './tableRouter.ts';
import {fetchWebsiteRegistration} from './websiteRegistrationGateway.ts';
const db=makeRoutedClient();
const table=()=>{if(!process.env.SADHANA_TABLE_NAME)throw new Error('SADHANA_TABLE_NAME missing');return process.env.SADHANA_TABLE_NAME;};
const fail=(status:number,message:string)=>Object.assign(new Error(message),{status});
const markerKey=(id:string)=>({PK:'OPS#GLOBAL#WEB_IMPORT',SK:`ITEM#${id}`});
const recordKey=(kind:'STUDENT'|'FAMILY',id:string)=>({PK:`OPS#GLOBAL#${kind}`,SK:`ITEM#${id}`});
const own=(item:any,id:string)=> item?.sourceWebsiteRegistrationId===id;
export async function previewWebsiteRevocation(registrationId:string){
 if(!/^RS-[A-Za-z0-9_-]{1,110}$/.test(registrationId))throw fail(400,'Invalid registration ID');
 const marker=(await db.send(new GetCommand({TableName:table(),Key:markerKey(registrationId),ConsistentRead:true}))).Item;
 if(!marker)return {registrationId,canRevoke:false,blockers:['No Sadhana import marker exists'],students:[],familyId:null};
 const blockers:string[]=[];
 const studentIds=Object.values(marker.studentIds||{}).filter((x):x is string=>typeof x==='string');
 if(!studentIds.length||new Set(studentIds).size!==studentIds.length)blockers.push('Student import marker incomplete or duplicated');
 if(studentIds.length>20)blockers.push('More than 20 students: manual review required');
 const students:any[]=[];
 for(const id of studentIds.slice(0,20)){
   const record=(await db.send(new GetCommand({TableName:table(),Key:recordKey('STUDENT',id),ConsistentRead:true}))).Item;
   students.push({id,rollNumber:record?.rollNumber||null,name:record?.name||null,owned:own(record,registrationId)});
   if(!record||!own(record,registrationId)||record.familyId!==marker.familyId)blockers.push(`Student ownership or family mismatch: ${id}`);
 }
 const family=(await db.send(new GetCommand({TableName:table(),Key:recordKey('FAMILY',marker.familyId),ConsistentRead:true}))).Item;
 if(!family)blockers.push('Mapped family record missing');
 if(!marker.linkedExistingFamily&&!own(family,registrationId))blockers.push('Family ownership mismatch');
 // Shared families are retained, but imported students may be removed if otherwise safe.
 const physical=process.env.SADHANA_DATA_MODE==='split'?Object.values(expectedTables):[table()];
 const scanDb=DynamoDBDocumentClient.from(new DynamoDBClient({region:'us-east-1'}));
 const ids=new Set(marker.linkedExistingFamily?studentIds:[marker.familyId,...studentIds]);
 // Review all known physical tables, fail closed on uncertain references and scan limits.
 let checked=0;
 for(const name of physical){
   let cursor:any;
   do{
     const page=await scanDb.send(new ScanCommand({TableName:name,Limit:100,ExclusiveStartKey:cursor,ConsistentRead:true}));
     for(const row of page.Items||[]){
       checked++;
       if(checked>50000){blockers.push('Dependency scan exceeded 50,000 rows; manual review required');break;}
       if(row.PK==='OPS#GLOBAL#WEB_IMPORT'&&(row.SK===`ITEM#${registrationId}`||row.SK===`REVOKE#${registrationId}`))continue;
       if(row.PK?.startsWith('OPS#GLOBAL#STUDENT')&&studentIds.includes(row.id))continue;
       if(row.PK?.startsWith('OPS#GLOBAL#FAMILY')&&row.id===marker.familyId)continue;
       if(row.PK?.startsWith('AUDIT#'))continue; // Immutable history is preserved by design.
       const references=[row.studentId,row.familyId,row.guardianId,row.personId,row.memberId,row.studentIds,row.familyIds,row.linkedStudentIds,row.linkedFamilyIds];
       if(references.some(v=>typeof v==='string'?ids.has(v):Array.isArray(v)?v.some(x=>ids.has(x)):false))
         blockers.push(`Dependent record in ${name}: ${String(row.PK||'unknown').slice(0,100)}`);
     }
     if(checked>50000)break;
     cursor=page.LastEvaluatedKey;
   }while(cursor);
   if(checked>50000)break;
 }
 try {
  const response:any=await fetchWebsiteRegistration(registrationId);
  const website=response?.registration??response?.record??response?.item??response?.data??response;
  const mapping=website?.sadhanaImport;
  if(website?.registrationId!==registrationId||website?.reviewStatus!=='approved'||mapping?.status!=='imported'||mapping?.familyId!==marker.familyId||JSON.stringify(Object.entries(mapping?.studentIds||{}).sort())!==JSON.stringify(Object.entries(marker.studentIds||{}).sort()))blockers.push('Website import mapping does not match Sadhana');
 } catch {blockers.push('Website registration could not be verified');}
 if(process.env.SADHANA_ENABLE_REVOKE_EXECUTION!=='true')blockers.push('Revocation execution remains disabled until integrated validation is signed off');
 return {registrationId,canRevoke:blockers.length===0,studentIds,students,familyId:marker.familyId,
   linkedExistingFamily:Boolean(marker.linkedExistingFamily),blockers:[...new Set(blockers)].slice(0,50),
   examinedRecords:checked};
}
