/** Explicit opt-in DynamoDB table routing for Sadhana v0.9.5.
 * No writes to legacy table are made by this adapter in SPLIT mode.
 */
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient} from '@aws-sdk/lib-dynamodb';

export type Domain='calendar'|'students'|'learning'|'admin'|'audit';
const tableNames:Record<Domain,string>={calendar:'sadhana-dev-calendar',students:'sadhana-dev-students',learning:'sadhana-dev-learning',admin:'sadhana-dev-admin',audit:'sadhana-dev-audit'};
export function domainForPK(pk:string,sk=''):Domain {
 if(pk.startsWith('SCHEDULE#')||pk.startsWith('SCHEDULE_SERIES#')||pk.startsWith('VENUE#')||pk.startsWith('CALENDAR#')||pk.startsWith('CLASS#')||pk==='DIRECTORY#VENUE'||/^INST#[^#]+#CLASS$/.test(pk))return 'calendar';
 if(pk.startsWith('TEACHER_REGISTRY')||pk.startsWith('TEACHER_SUB#'))return 'admin';
 if(pk.startsWith('ACCESS_REQUEST#')||pk.startsWith('ACCESS#'))return 'admin';
 if(pk.startsWith('AUDIT#'))return 'audit';
 if(pk.startsWith('OPS#GLOBAL#COUNTERS')||pk.startsWith('OPS#GLOBAL#FAMILY')||pk.startsWith('OPS#GLOBAL#STUDENT')||pk.startsWith('OPS#sruti#FAMILY')||pk.startsWith('OPS#raaga#FAMILY')||pk.startsWith('OPS#sruti#STUDENT')||pk.startsWith('OPS#raaga#STUDENT')||pk.startsWith('OPS#sruti#ENROLMENT')||pk.startsWith('OPS#raaga#ENROLMENT')||pk.startsWith('FAMILY#')||pk.startsWith('STUDENT#')||pk.startsWith('ENROLMENT#')||pk==='DIRECTORY#FAMILY'||pk==='DIRECTORY#STUDENT'||/^INST#[^#]+#ENROLMENT$/.test(pk))return 'students';
 if(/^OPS#(?:sruti|raaga)#(?:ATTENDANCE|PRACTICE|FEEDBACK|RSVP)$/.test(pk)||pk.startsWith('PRACTICE#')||/^INST#[^#]+#PRACTICE$/.test(pk))return 'learning';
 if(pk.startsWith('PHONE#')) {if(sk.startsWith('FAMILY#')||sk.startsWith('STUDENT#'))return 'students'; throw Error(`Cannot route phone GSI without identity sort key`);}
 throw Error(`Unmapped DynamoDB partition: ${pk}`);
}
function keyFromInput(i:any):string {
 if(i?.Key?.PK)return String(i.Key.PK);
 if(i?.Item?.PK)return String(i.Item.PK);
 if(i?.KeyConditionExpression){const names=i.ExpressionAttributeNames||{};const values=i.ExpressionAttributeValues||{};const condition=String(i.KeyConditionExpression);
  const expression=condition.match(/(?:#p|PK|GSI1PK|GSI2PK)\s*=\s*(:[\w]+)/);
  if(expression&&values[expression[1]])return String(values[expression[1]]);
  const param=Object.entries(values).find(([k])=>k===':pk'||k===':p');if(param)return String(param[1]);
 }
 throw Error('Unable to determine DynamoDB partition from request; refusing split-table operation');
}
const isSplit=()=>process.env.SADHANA_DATA_MODE==='split';
export function routeDocumentInput(input:any):any {
 if(!isSplit())return input;
 if(input.TransactItems){return {...input,TransactItems:input.TransactItems.map((entry:any)=>{const action=Object.keys(entry)[0];if(!action||!entry[action])throw Error('Unsupported transaction item');const part=entry[action];return {[action]:{...part,TableName:tableNames[domainForPK(keyFromInput(part),String(part?.Key?.SK||part?.Item?.SK||''))]}};})};}
 if(input.RequestItems){const result:any={};for(const [,requests] of Object.entries(input.RequestItems as Record<string,any[]>)){for(const r of requests){const item=r.PutRequest?.Item||r.DeleteRequest?.Key;const domain=domainForPK(String(item?.PK||''),String(item?.SK||''));(result[tableNames[domain]]||=[]).push(r);}}return {...input,RequestItems:result};}
 const pk=keyFromInput(input);return {...input,TableName:tableNames[domainForPK(pk,String(input?.Key?.SK||input?.Item?.SK||''))]};
}
/** Install middleware before the document marshaling stage. Both base and transaction inputs are routed. */
export function makeRoutedClient(region?:string):DynamoDBDocumentClient {
 const client=DynamoDBDocumentClient.from(new DynamoDBClient({region}),{marshallOptions:{removeUndefinedValues:true}});
 client.middlewareStack.add((next)=>async(args)=>next({...args,input:routeDocumentInput(args.input)}),{step:'initialize',name:'sadhanaTableRouter',priority:'high'});
 return client;
}
export const expectedTables=tableNames;
