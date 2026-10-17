import {makeRoutedClient} from './tableRouter.ts';
/** Administrator-only, Google-read-only Middlesbrough import. Credentials stay in SSM SecureString. */
import { createSign, randomUUID } from 'node:crypto';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { MIDDLESBROUGH_GOOGLE_CALENDAR_ID, MIDDLESBROUGH_PARTITION, batchHash, calendarSyncWindow, diffCalendarSessions, projectGoogleEvents, sessionHash } from './calendarModel.ts';
import type { CalendarSession, GoogleCalendarEvent } from './calendarModel.ts';

const ssm=new SSMClient({});
const db=makeRoutedClient();
const table=()=>{const name=process.env.SADHANA_TABLE_NAME;if(!name)throw new Error('DynamoDB is not configured');return name;};
const paramName=()=>process.env.MIDDLESBROUGH_CREDENTIAL_PARAMETER || '/sadhana/dev/google/middlesbrough-service-account';
const googleScope='https://www.googleapis.com/auth/calendar.readonly';
let cachedToken: {value:string;expires:number}|null=null;
const base64url=(value: unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');

async function getGoogleToken(): Promise<string> {
  if(cachedToken&&cachedToken.expires>Date.now()+120_000)return cachedToken.value;
  let result;
  try { result=await ssm.send(new GetParameterCommand({Name:paramName(),WithDecryption:true})); }
  catch (error) {
    if ((error as Error).name==='ParameterNotFound') {
      throw Object.assign(new Error('Google Calendar connection is not configured. Set up the SSM SecureString described in README.'),{status:503});
    }
    throw error;
  }
  if(!result.Parameter?.Value)throw Object.assign(new Error('Google Calendar connection is not configured.'),{status:503});
  const sa=JSON.parse(result.Parameter.Value) as {client_email?:string;private_key?:string;type?:string};
  if(sa.type!=='service_account'||!sa.client_email||!sa.private_key)throw new Error('Invalid Google service account JSON');
  const issuedAt=Math.floor(Date.now()/1000);
  const header=base64url({alg:'RS256',typ:'JWT'});
  const payload=base64url({iss:sa.client_email,scope:googleScope,aud:'https://oauth2.googleapis.com/token',iat:issuedAt,exp:issuedAt+3600});
  const content=`${header}.${payload}`;
  const signature=createSign('RSA-SHA256').update(content).sign(sa.private_key,'base64url');
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:`${content}.${signature}`}),signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error(`Google service account token rejected (${response.status}). Check account and calendar sharing.`);
  const data=await response.json() as {access_token?:string;expires_in?:number};
  if(!data.access_token)throw new Error('Google token unavailable');
  cachedToken={value:data.access_token,expires:Date.now()+(data.expires_in??3600)*1000};
  return data.access_token;
}

async function fetchGoogleSessions(): Promise<{sessions:CalendarSession[];skipped:number;window:{from:string;through:string}}> {
  const token=await getGoogleToken();
  const window=calendarSyncWindow();
  const all:GoogleCalendarEvent[]=[];
  let next: string|undefined;
  for(let page=0;page<5;page++){
    const params=new URLSearchParams({timeMin:window.from,timeMax:window.through,singleEvents:'true',showDeleted:'true',maxResults:'250'});
    if(next)params.set('pageToken',next);
    const response=await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(MIDDLESBROUGH_GOOGLE_CALENDAR_ID)}/events?${params}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error(`Google Calendar read failed (${response.status}). Check Calendar API and sharing.`);
    const data=await response.json() as {items?:GoogleCalendarEvent[];nextPageToken?:string};
    all.push(...(data.items??[]));
    next=data.nextPageToken;
    if(!next)break;
    if(page===4)throw new Error('More than 1,250 Google events; import window must be narrowed. Nothing was written.');
  }
  const projected=projectGoogleEvents(all);
  return {...projected,window};
}

async function storedSessions():Promise<Array<CalendarSession & {syncHash?:string}>> {
  let next:Record<string,unknown>|undefined;
  const items:Array<CalendarSession&{syncHash?:string}>=[];
  do {
    const response=await db.send(new QueryCommand({TableName:table(),KeyConditionExpression:'PK = :pk',ExpressionAttributeValues:{':pk':MIDDLESBROUGH_PARTITION},ExclusiveStartKey:next,Limit:200}));
    for (const x of response.Items??[])items.push(x as CalendarSession&{syncHash?:string});
    next=response.LastEvaluatedKey;
    if(items.length>1500)throw new Error('Too many stored Middlesbrough events; refusing unbounded scan');
  } while(next);
  return items;
}

export async function listMiddlesbrough():Promise<{events:CalendarSession[];source:string}> {
  const events=await storedSessions();
  const projected = events.map<CalendarSession>(x => ({
    id:x.id,summary:x.summary,start:x.start,end:x.end,
    location:x.location,status:x.status,
    institution:'raaga',calendar:'middlesbrough',source:'google'
  }));
  return {events:projected.sort((a,b)=>a.start.localeCompare(b.start)),source:'DynamoDB mirror · Middlesbrough Google Calendar'};
}

/** The initial preview does not write; confirm requires an unchanged Google snapshot fingerprint. */
export async function syncMiddlesbrough(mode:'preview'|'apply', expectedFingerprint:unknown, actor:string) {
  const {sessions,skipped,window}=await fetchGoogleSessions();
  const fingerprint=batchHash(sessions);
  if(mode==='apply'&&expectedFingerprint!==fingerprint) {
    const err=new Error('Google Calendar changed since preview. Preview again before importing.') as Error&{status:number};err.status=409;throw err;
  }
  const current=await storedSessions();
  const changes=diffCalendarSessions(sessions,current,item=>item.start>=window.from&&item.start<window.through);
  const counts={add:changes.additions.length,update:changes.changes.length,cancel:changes.removed.length,unchanged:changes.unchanged,skipped};
  if(mode==='preview')return {mode:'preview',calendar:'Middlesbrough Timetable',fingerprint,window,counts,examples:[...changes.additions,...changes.changes,...changes.removed].slice(0,20)};
  let written=0;
  const now=new Date().toISOString();
  for(const record of [...changes.additions,...changes.changes,...changes.removed]) {
    const normalized:CalendarSession={id:record.id,summary:record.summary,start:record.start,end:record.end,location:record.location,status:record.status,institution:'raaga',calendar:'middlesbrough',source:'google'};
    await db.send(new PutCommand({TableName:table(),Item:{PK:MIDDLESBROUGH_PARTITION,SK:`EVENT#${record.id}`,entityType:'calendarEvent',...normalized,syncHash:sessionHash(normalized),syncedAt:now}}));
    written++;
  }
  await db.send(new PutCommand({TableName:table(),Item:{PK:'AUDIT#raaga',SK:`CALSYNC#${now}#${randomUUID()}`,entityType:'calendarSync',calendar:'middlesbrough',actor,at:now,counts,window,source:'Google Calendar API'}}));
  return {mode:'applied',calendar:'Middlesbrough Timetable',window,counts,written};
}
