import {makeRoutedClient} from './tableRouter.ts';
/** Atomic creation of a master class and its dated sessions. No existing rows are rewritten. */
import {randomUUID} from 'node:crypto';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,QueryCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {httpError,permittedInstitutions} from './model.ts';
import type {Claims,InstitutionId} from './model.ts';
import {schedulePK,scheduleSK} from './scheduleModel.ts';
const db=makeRoutedClient();
const table=()=>{if(!process.env.SADHANA_TABLE_NAME)throw Error('Missing Sadhana table');return process.env.SADHANA_TABLE_NAME;};
export type Recurrence={frequency:'daily'|'weekly'|'monthly';interval:number;weekdays?:number[];endMode:'date'|'count';until?:string;count?:number};
const iso=/^\d{4}-\d{2}-\d{2}$/;
function day(s:string){if(!iso.test(s))throw httpError(400,'Invalid date.');const d=new Date(`${s}T12:00:00Z`);if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s)throw httpError(400,'Invalid date.');return d;}
const fmt=(d:Date)=>d.toISOString().slice(0,10);
const plus=(d:Date,n:number)=>{const r=new Date(d);r.setUTCDate(r.getUTCDate()+n);return r;};
export function recurrenceDates(first:string,r:Recurrence):string[]{
 const firstDay=day(first);if(!['daily','weekly','monthly'].includes(r.frequency)||!Number.isInteger(r.interval)||r.interval<1||r.interval>12)throw httpError(400,'Invalid recurrence interval.');
 if(r.endMode!=='date'&&r.endMode!=='count')throw httpError(400,'Choose an ending condition.');
 const end=r.endMode==='date'?day(String(r.until)):plus(firstDay,730);
 if(end<firstDay||end>plus(firstDay,730))throw httpError(400,'Ending date must be within two years of the first class.');
 if(r.endMode==='count'&&(!Number.isInteger(r.count)||r.count!<1||r.count!>80))throw httpError(400,'Choose between 1 and 80 sessions.');
 const weekdays=r.weekdays||[];
 if(r.frequency==='weekly'&&(!weekdays.length||weekdays.length>7||new Set(weekdays).size!==weekdays.length||weekdays.some(n=>!Number.isInteger(n)||n<0||n>6)))throw httpError(400,'Select at least one valid weekday.');
 const result:string[]=[];
 for(let offset=0;offset<=730;offset++){
  const current=plus(firstDay,offset);if(current>end)break;
  let matches=false;
  if(r.frequency==='daily')matches=offset%r.interval===0;
  if(r.frequency==='weekly')matches=Math.floor(offset/7)%r.interval===0&&weekdays.includes(current.getUTCDay());
  if(r.frequency==='monthly'){
    const months=(current.getUTCFullYear()-firstDay.getUTCFullYear())*12+current.getUTCMonth()-firstDay.getUTCMonth();
    matches=months%r.interval===0&&current.getUTCDate()===firstDay.getUTCDate();
  }
  if(matches){result.push(fmt(current));if(result.length>80)throw httpError(400,'Maximum 80 sessions per class. Shorten the recurrence.');if(r.endMode==='count'&&result.length===r.count)break;}
 }
 if(!result.length||result[0]!==first)throw httpError(400,'First class date must match your chosen recurrence days.');
 if(r.endMode==='count'&&result.length!==r.count)throw httpError(400,'Could not generate the requested sessions within two years.');
 return result;
}
function parse(inst:InstitutionId,claims:Claims,body:Record<string,any>){
 if(!permittedInstitutions(claims).includes(inst))throw httpError(403,'Academy administrator required to create recurring classes.');
 if(!body||typeof body!=='object'||Array.isArray(body))throw httpError(400,'Invalid class.');
 const allowed=['name','programme','teacherId','mode','venueId','location','date','startTime','endTime','recurrence'];
 if(Object.keys(body).some(k=>!allowed.includes(k)))throw httpError(400,'Unexpected class fields.');
 if(typeof body.name!=='string'||!body.name.trim()||body.name.length>150)throw httpError(400,'Enter a class name.');
 if(!(inst==='raaga'?['Singing']:['Vedam','Vedanta']).includes(body.programme))throw httpError(400,'Invalid academy programme.');
 if(typeof body.teacherId!=='string'||!/^TEACHER-[0-9a-f-]{36}$/i.test(body.teacherId))throw httpError(400,'Choose a teacher.');
 if(!['Online','In person'].includes(body.mode)||typeof body.venueId!=='string'||typeof body.location!=='string')throw httpError(400,'Invalid delivery or venue.');
 if(body.mode==='Online'&&(body.venueId!==''||body.location!=='Online'))throw httpError(400,'Online classes must use Online as the venue.');
 if(body.mode==='In person'&&(!body.venueId||!body.location))throw httpError(400,'Choose a saved venue.');
 if(typeof body.startTime!=='string'||typeof body.endTime!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.startTime)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.endTime)||body.startTime>=body.endTime)throw httpError(400,'Invalid class times.');
 const dates=recurrenceDates(body.date,body.recurrence);
 return {dates,body};
}
async function inspect(inst:InstitutionId,body:Record<string,any>,dates:string[]){
 const teacher=await db.send(new GetCommand({TableName:table(),Key:{PK:'TEACHER_REGISTRY',SK:`TEACHER#${body.teacherId}`},ConsistentRead:true}));
 if(!teacher.Item?.active||!teacher.Item.institutions?.includes(inst))throw httpError(400,'Teacher is not active in this academy.');
 const records:any[]=[];let key:Record<string,any>|undefined;
 do{const r=await db.send(new QueryCommand({TableName:table(),KeyConditionExpression:'PK=:pk',ExpressionAttributeValues:{':pk':schedulePK(inst)},ExclusiveStartKey:key,Limit:250}));records.push(...(r.Items||[]));key=r.LastEvaluatedKey;if(records.length>3000)throw httpError(413,'Too many calendar entries.');}while(key);
 const candidates=records.filter(x=>x.recordType==='class'&&String(x.name).trim().toLocaleLowerCase()===body.name.trim().toLocaleLowerCase());
 return {teacher:teacher.Item,duplicateNames:candidates.map(x=>({id:x.id,name:x.name})),dates};
}
export async function previewRecurringClass(inst:InstitutionId,claims:Claims,body:Record<string,any>){const {dates}=parse(inst,claims,body);const found=await inspect(inst,body,dates);return {dates,count:dates.length,duplicateNames:found.duplicateNames,first:dates[0],last:dates.at(-1)};}
export async function createRecurringClass(inst:InstitutionId,claims:Claims,body:Record<string,any>){
 const {dates}=parse(inst,claims,body);const found=await inspect(inst,body,dates);
 if(found.duplicateNames.length)throw httpError(409,'A master class with this name already exists. Rename the class or review the existing class.');
 const classId=`CLASS-${randomUUID()}`;const now=new Date().toISOString();const common={institution:inst,name:body.name.trim(),programme:body.programme,teacher:found.teacher.displayName,teacherId:body.teacherId,mode:body.mode,location:body.location,venueId:body.venueId,startTime:body.startTime,endTime:body.endTime,timezone:'Europe/London',status:'confirmed',version:1,createdAt:now,updatedAt:now};
 const master={...common,id:classId,recordType:'class',date:dates[0],endDate:dates.at(-1),recurrence:body.recurrence};
 const sessions=dates.map(d=>({...common,id:`EVT-${randomUUID()}`,recordType:'class-session',classId,date:d,endDate:d,allDay:false}));
 const writes=[master,...sessions].map(record=>({Put:{TableName:table(),Item:{PK:schedulePK(inst),SK:scheduleSK(record.id),entityType:'schedule',...record},ConditionExpression:'attribute_not_exists(PK)'}}));
 try{await db.send(new TransactWriteCommand({TransactItems:writes,ClientRequestToken:undefined}));}
 catch(e){if((e as Error).name==='TransactionCanceledException')throw httpError(409,'Class creation conflicted with another write. Nothing was created.');throw e;}
 return {record:master,sessionCount:sessions.length,dates};
}
