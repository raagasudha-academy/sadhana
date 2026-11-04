/** Deploy as a DISTINCT, throttled public Lambda/API, never on the JWT-only Sadhana API. */
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,PutCommand} from '@aws-sdk/lib-dynamodb';
import {validateSrutiSubmission,newSrutiIntakeRecord} from './m91SrutiIntakeCore.mjs';
const db=DynamoDBDocumentClient.from(new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'}));
const origins=new Set(['https://sruti.co.uk','https://www.sruti.co.uk']);
const response=(statusCode:number,body:unknown,origin:string)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store',...(origins.has(origin)?{'access-control-allow-origin':origin,'vary':'Origin'}:{})},body:JSON.stringify(body)});
export async function handler(event:any){
 const origin=event.headers?.origin||event.headers?.Origin||'';
 const method=event.requestContext?.http?.method||event.httpMethod;
 if(!origins.has(origin))return response(403,{error:'Origin not allowed.'},origin);
 if(method==='OPTIONS')return {statusCode:204,headers:{'access-control-allow-origin':origin,'access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'Content-Type','vary':'Origin'},body:''};
 if(method!=='POST')return response(405,{error:'Method not allowed.'},origin);
 if(process.env.M91_SRUTI_PUBLIC_INTAKE!=='enabled')return response(503,{error:'Registrations are not enabled.'},origin);
 try{
  if(typeof event.body!=='string'||event.body.length>25000)return response(413,{error:'Registration exceeds size limit.'},origin);
  const raw=JSON.parse(event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body);
  if(raw?.website?.company) return response(202,{received:true},origin); // honeypot; no persistence
  const payload=validateSrutiSubmission(raw);
  const record=newSrutiIntakeRecord(payload);
  await db.send(new PutCommand({TableName:'sadhana-dev-m9-registrations',Item:record,ConditionExpression:'attribute_not_exists(registrationId)'}));
  return response(202,{received:true,registrationId:record.registrationId},origin);
 }catch(e:any){
  if(e?.status===400||e instanceof SyntaxError)return response(400,{error:'Please check your registration details.'},origin);
  console.error('Sruti intake unavailable', {errorType:e?.name||'Error'}); // never log PII
  return response(503,{error:'Registration service unavailable.'},origin);
 }
}
