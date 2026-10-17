/** v0.7.4: narrowly scoped repair of Sruti Vedanta teacher. Dry-run by default.
 * Usage from backend: npx tsx scripts/assignVedantaTeacher.ts --table sadhana-dev-main
 * To write: ... --apply --confirm VEDANTA-37
 */
import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

const args=process.argv.slice(2);
const flag=(name:string)=>{const i=args.indexOf(name);return i<0?'':args[i+1]||'';};
const table=flag('--table');
const apply=args.includes('--apply');
if(table!=='sadhana-dev-main')throw Error('For safety, this script only accepts --table sadhana-dev-main');
if(apply&&flag('--confirm')!=='VEDANTA-37')throw Error('To write, add --apply --confirm VEDANTA-37');
const masterId='CLASS-SRUTI-NEWCASTLE-VEDANTA';
const teacher='Mr Srikailash Venkitadri';
const db=DynamoDBDocumentClient.from(new DynamoDBClient({}),{marshallOptions:{removeUndefinedValues:true}});
const all:Record<string,any>[]=[];
let cursor:Record<string,any>|undefined;
do {
  const result=await db.send(new QueryCommand({
    TableName:table,KeyConditionExpression:'PK = :partition',
    ExpressionAttributeValues:{':partition':'SCHEDULE#sruti'},
    ExclusiveStartKey:cursor,ConsistentRead:true
  }));
  all.push(...(result.Items||[]));
  cursor=result.LastEvaluatedKey;
  if(all.length>10000)throw Error('Refusing unbounded timetable scan');
} while(cursor);
const target=all.filter(item=>item.id===masterId || item.classId===masterId);
const masters=target.filter(item=>item.recordType==='class'&&item.id===masterId);
const sessions=target.filter(item=>item.recordType==='class-session'&&item.classId===masterId);
if(masters.length!==1||sessions.length!==36||target.length!==37)
  throw Error(`Expected exactly 1 master and 36 dated sessions; found ${masters.length} and ${sessions.length}. No writes.`);
for(const item of target){
  if(item.PK!=='SCHEDULE#sruti'||item.SK!==`RECORD#${item.id}`)throw Error('Unexpected primary key; no writes.');
  if(!['',teacher].includes(item.teacher??''))throw Error(`Unexpected teacher on ${item.id}; no writes.`);
  if(!Number.isInteger(item.version)||item.version<1)throw Error(`Missing version on ${item.id}; no writes.`);
}
const change=target.filter(item=>item.teacher!==teacher);
console.log(JSON.stringify({mode:apply?'apply':'READ_ONLY',table,teacher,masterId,
  masters:masters.length,sessions:sessions.length,alreadyAssigned:target.length-change.length,
  willUpdate:change.length,otherCalendarItemsUntouched:all.length-target.length},null,2));
if(!apply){console.log('DRY RUN ONLY. No DynamoDB writes.');process.exit(0);}
if(change.length===0){console.log('Already assigned on all 37 records.');process.exit(0);}
const now=new Date().toISOString();
let written=0;
for(const item of change){
  await db.send(new UpdateCommand({
    TableName:table,
    Key:{PK:item.PK,SK:item.SK},
    UpdateExpression:'SET #teacher = :teacher, #updatedAt = :now, #version = :next',
    ConditionExpression:'#version = :old AND (attribute_not_exists(#teacher) OR #teacher = :blank)',
    ExpressionAttributeNames:{'#teacher':'teacher','#updatedAt':'updatedAt','#version':'version'},
    ExpressionAttributeValues:{':teacher':teacher,':now':now,':next':item.version+1,':old':item.version,':blank':''},
  }));
  written++;
}
await db.send(new PutCommand({TableName:table,Item:{
  PK:'AUDIT#sruti',SK:`VEDANTA-TEACHER#${now}#${randomUUID()}`,
  entityType:'audit',action:'assignVedantaTeacher',masterId,teacher,recordCount:written,at:now,
},ConditionExpression:'attribute_not_exists(PK)'}));
console.log(JSON.stringify({status:'SUCCESS',updated:written,teacher,changesOnly:'teacher, version, updatedAt',calendarCountUnchanged:true},null,2));
