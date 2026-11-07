import {entityTable} from '../m10EntityTables.mjs';
/** M9-only replacement for frontend audit and administrator practice-history reads.
 * Explicitly opt-in and never falls back to legacy PK/SK storage when enabled.
 */
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,QueryCommand} from '@aws-sdk/lib-dynamodb';
import {demandInstitution,httpError} from '../model.ts';
import {json} from './http.ts';
import type {DomainRoute} from './http.ts';

type Institution='raaga'|'sruti';
type Row=Record<string,any>;
export interface M10OperationalReader {
 audit:(institution:Institution)=>Promise<{records:Row[];more:boolean}>;
 practice:(institution:Institution,studentId:string)=>Promise<{records:Row[];more:boolean}>;
}
let cached:DynamoDBDocumentClient|undefined;
const client=()=>cached??=DynamoDBDocumentClient.from(new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'}));

// Do not return an incomplete filtered page while claiming the query is exhausted.
async function queryRows(table:string,index:string,attribute:string,value:string,institution:Institution,limit:number){
 const records:Row[]=[];
 let cursor:Record<string,unknown>|undefined;
 let requests=0;
 do {
  const page=await client().send(new QueryCommand({
   TableName:entityTable(table),IndexName:index,
   KeyConditionExpression:'#partition = :value',
   ExpressionAttributeNames:{'#partition':attribute},
   ExpressionAttributeValues:{':value':value},
   Limit:100,ExclusiveStartKey:cursor
  }));
  requests++;
  for(const row of page.Items??[]){
   if(row.institutionId===institution && !(table==='practice'&&row.recordType==='operational-feedback'))records.push(row);
   if(records.length>limit)break;
  }
  cursor=page.LastEvaluatedKey;
  if(requests>=20&&cursor)throw Error('M10_OPERATIONAL_QUERY_REQUIRES_PAGINATION');
 }while(cursor&&records.length<=limit);
 return {items:records.slice(0,limit),more:records.length>limit||!!cursor};
}
const original=(row:Row)=>{
 const legacy=row.legacyPayload;
 if(legacy&&typeof legacy==='object'&&!Array.isArray(legacy)){
  const {PK,SK,GSI1PK,GSI1SK,GSI2PK,GSI2SK,entityType,...payload}=legacy;
  return payload;
 }
 return undefined;
};
export const finalOperationalReader:M10OperationalReader={
 async audit(institution){
  const result=await queryRows('audit','InstitutionAuditIndex','institutionId',institution,institution,100);
  return {records:result.items.map(row=>original(row)??{
   id:row.auditId,type:row.action??row.type,resource:row.resourceType??row.resource,
   at:row.timestamp??row.at,actorSub:row.actorCognitoSub??row.actorSub,
   details:row.details??{},
  }),more:result.more};
 },
 async practice(institution,studentId){
  const result=await queryRows('practice','StudentPracticeIndex','studentId',studentId,institution,200);
  return {records:result.items.map(row=>original(row)??{
   id:row.practiceId,institution,studentId:row.studentId,
   date:row.practiceDate??row.practiceDateKey,
   didPractice:row.didPractice??true,minutes:row.minutes??0,
   comments:row.comments??'',topic:row.topic??'',
   classId:row.classId,version:row.version,
  }),more:result.more};
 }
};

export function makeM10OperationalReadRoutes(reader:M10OperationalReader=finalOperationalReader):DomainRoute{
 return async({parts,method,inst,claims,query})=>{
  if(process.env.M10_OPERATIONAL_M9_READS!=='enabled')return undefined;
  const isAudit=parts.length===1&&parts[0]==='audit';
  const isPractice=parts.length===1&&parts[0]==='practice';
  if(!isAudit&&!isPractice)return undefined;
  if(inst!=='raaga'&&inst!=='sruti')throw httpError(400,'Select a valid institution.');
  demandInstitution(claims,inst);
  if(process.env.M9_TARGET_REPOSITORY_ENABLED!=='read-only')return json(503,{error:'M9 operational reader disabled.'});
  if(method!=='GET')return json(503,{error:'M9 operational write not yet migrated; legacy fallback blocked.'});
  if(isAudit)return json(200,await reader.audit(inst));
  const studentId=query.studentId;
  if(!studentId||!/^[-_a-zA-Z0-9]{4,150}$/.test(studentId))throw httpError(400,'Valid studentId required.');
  return json(200,await reader.practice(inst,studentId));
 };
}
export const m10OperationalReadRoutes=makeM10OperationalReadRoutes();
