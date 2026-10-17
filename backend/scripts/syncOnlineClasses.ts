/** Sadhana v0.7.4 online calendar importer. Google is READ ONLY.
 * DRY RUN (default):
 *   ./backend/node_modules/.bin/tsx backend/scripts/syncOnlineClasses.ts \
 *     --table sadhana-dev-main --from 2026-09-01 --through 2027-01-01
 * APPLY only after reviewing preview fingerprint:
 *   ... --apply --confirm ONLINE-V074 --fingerprint <printed Google fingerprint>
 * `--through` is EXCLUSIVE. Re-run the same period after Google changes.
 */
import {createSign, createHash, randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {DynamoDBClient, DescribeContinuousBackupsCommand} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient, QueryCommand, PutCommand, UpdateCommand} from '@aws-sdk/lib-dynamodb';
import {GetParameterCommand, SSMClient} from '@aws-sdk/client-ssm';
import {ONLINE_CLASSES, ONLINE_CALENDAR_ID, ONLINE_SYNC_OWNER, makeOnlinePlan, markerDates, googleSnapshotHash, isISODate} from '../src/onlineClasses.ts';
import {schedulePK,scheduleSK} from '../src/scheduleModel.ts';
import type {ScheduleRecord} from '../src/scheduleModel.ts';

const argv=process.argv.slice(2);
const flag=(name:string)=>{const i=argv.indexOf(name);return i<0?'':(argv[i+1]||'');};
const apply=argv.includes('--apply');
const table=flag('--table');
const from=flag('--from');
const through=flag('--through');
if(table!=='sadhana-dev-main')throw Error('Safety stop: only --table sadhana-dev-main is supported.');
if(!isISODate(from)||!isISODate(through)||through<=from)throw Error('Provide valid --from and --through dates; through is exclusive.');
const days=(Date.parse(through+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000;
if(days>185)throw Error('Safety stop: sync windows cannot exceed 185 days. Use consecutive batches.');
if(apply&&(flag('--confirm')!=='ONLINE-V074'||!/^[a-f0-9]{64}$/.test(flag('--fingerprint'))))throw Error('Writes need --apply --confirm ONLINE-V074 --fingerprint <value from dry run>.');
const credentialParameter=flag('--credential-parameter')||'/sadhana/dev/google/middlesbrough-service-account';
const ssm=new SSMClient({});
const dynamo=new DynamoDBClient({});
const db=DynamoDBDocumentClient.from(dynamo,{marshallOptions:{removeUndefinedValues:true}});
const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');

async function accessToken():Promise<string>{
 const response=await ssm.send(new GetParameterCommand({Name:credentialParameter,WithDecryption:true}));
 if(!response.Parameter?.Value)throw Error('Google service account is not configured in SSM.');
 const sa=JSON.parse(response.Parameter.Value) as {type?:string;client_email?:string;private_key?:string};
 if(sa.type!=='service_account'||!sa.client_email||!sa.private_key)throw Error('SSM parameter must contain Google service account JSON.');
 const now=Math.floor(Date.now()/1000);
 const message=`${encode({alg:'RS256',typ:'JWT'})}.${encode({iss:sa.client_email,scope:'https://www.googleapis.com/auth/calendar.readonly',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600})}`;
 const signature=createSign('RSA-SHA256').update(message).sign(sa.private_key,'base64url');
 const res=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:`${message}.${signature}`}),signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw Error(`Google service account OAuth authentication failed (${res.status}).`);
 const data=await res.json() as {access_token?:string};
 if(!data.access_token)throw Error('Google access token is missing.');
 return data.access_token;
}
interface GoogleEvent {id?:string;summary?:string;status?:string;start?:{dateTime?:string;date?:string};end?:{dateTime?:string;date?:string};}

function eventsFromApprovedCsv(filename:string):GoogleEvent[]{
  const lines=readFileSync(filename,'utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  if(lines[0]!=='ukDate,googleEventId,title,status,start,end,calendarId')
    throw Error('Invalid CSV header.');
  if(lines.length<2||lines.length>2001)
    throw Error('Unexpected marker count.');

  const seen=new Set<string>();

  return lines.slice(1).map((line,i)=>{
    const row=i+2;
    const fields=line.split(',').map(s=>s.trim());

    if(fields.length!==7||fields.some(s=>s.includes('"')))
      throw Error('Unexpected CSV format at row '+row);

    const [date,id,title,status,start,end,calendarId]=fields;

    if(calendarId!==ONLINE_CALENDAR_ID||
       title!=='Online Session'||status!=='confirmed')
      throw Error('Unexpected Google marker at row '+row);

    if(!isISODate(date)||date<from||date>=through)
      throw Error('Date outside import window at row '+row);

    if(!id||seen.has(id))
      throw Error('Duplicate or missing event ID at row '+row);
    seen.add(id);

    if(!/(Z|[+-]\d\d:\d\d)$/.test(start)||
       !/(Z|[+-]\d\d:\d\d)$/.test(end))
      throw Error('Missing timezone at row '+row);

    const first=new Date(start),last=new Date(end);
    if(!Number.isFinite(first.getTime())||
       !Number.isFinite(last.getTime())||last<=first)
      throw Error('Invalid timestamps at row '+row);

    const parts=new Intl.DateTimeFormat('en-GB',{
      timeZone:'Europe/London',
      year:'numeric',month:'2-digit',day:'2-digit'
    }).formatToParts(first);

    const uk=Object.fromEntries(parts.map(x=>[x.type,x.value]));
    if(date!==`${uk.year}-${uk.month}-${uk.day}`)
      throw Error('UK date mismatch at row '+row);

    return {
      id,summary:title,status,
      start:{dateTime:start},
      end:{dateTime:end}
    };
  });
}

async function googleEvents():Promise<GoogleEvent[]>{
 const token=await accessToken();
 const events:GoogleEvent[]=[];
 let pageToken:string|undefined;
 for(let i=0;i<8;i++){
  const params=new URLSearchParams({
   timeMin:new Date(Date.parse(from+'T00:00:00Z')-86400000).toISOString(),
   timeMax:new Date(Date.parse(through+'T00:00:00Z')+86400000).toISOString(),
   maxResults:'250',singleEvents:'true',showDeleted:'true',timeZone:'Europe/London',
  });
  if(pageToken)params.set('pageToken',pageToken);
  const res=await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(ONLINE_CALENDAR_ID)}/events?${params}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)});
  if(!res.ok){
   if(res.status===403||res.status===404)throw Error(`Online Google Calendar not readable (${res.status}). Share that calendar with the service-account email stored in SSM; no data changed.`);
   throw Error(`Google Calendar API error (${res.status}); no data changed.`);
  }
  const result=await res.json() as {items?:GoogleEvent[];nextPageToken?:string};
  events.push(...(result.items||[]));
  pageToken=result.nextPageToken;
  if(!pageToken)return events;
 }
 throw Error('Google Calendar exceeds 2,000 events in window; narrow dates. No writes.');
}
async function queryPartition(inst:'raaga'|'sruti'):Promise<Record<string,any>[]>{
 const result:Record<string,any>[]=[];
 let key:Record<string,any>|undefined;
 do {
  const res=await db.send(new QueryCommand({TableName:table,KeyConditionExpression:'PK = :pk',ExpressionAttributeValues:{':pk':schedulePK(inst)},ConsistentRead:true,ExclusiveStartKey:key,Limit:250}));
  result.push(...(res.Items||[]));key=res.LastEvaluatedKey;
  if(result.length>6000)throw Error('Safety stop: schedule partition exceeds 6000 records.');
 }while(key);
 return result;
}
function contentDigest(item:Record<string,any>):string{
 return createHash('sha256').update(JSON.stringify([item.id,item.recordType,item.institution,item.classId||'',item.date||'',item.name,item.programme,item.teacher,item.mode,item.location,item.startTime,item.endTime,item.timezone])).digest('hex');
}
function keyOf(item:{id:string;institution:string}){return `${item.institution}/${item.id}`;}

const google=flag('--markers-csv')?eventsFromApprovedCsv(flag('--markers-csv')):await googleEvents();
const marker=markerDates(google,from,through);
if(apply&&marker.dates.length===0&&!argv.includes('--allow-empty-window'))throw Error('Safety stop: no active Google day-markers. Run dry-run and pass --allow-empty-window only if intentionally reconciling an empty period.');
const fingerprint=googleSnapshotHash(google,from,through);
if(apply&&flag('--fingerprint')!==fingerprint)throw Error('Google snapshot fingerprint changed since preview. Run dry-run again. No writes.');
const planned=makeOnlinePlan(marker.dates);
const [raaga,sruti]=await Promise.all([queryPartition('raaga'),queryPartition('sruti')]);
const present=new Map([...raaga,...sruti].map(r=>[keyOf(r),r]));
const ownedClassIds=new Set(ONLINE_CLASSES.map(c=>c.id));
const addMasters:Record<string,any>[]=[];
const addSessions:Record<string,any>[]=[];
const flipStatus:{current:Record<string,any>;status:'cancelled'|'confirmed'}[]=[];
const blocked:string[]=[];
const wanted=new Map(planned.sessions.map(item=>[keyOf(item),item]));
let unchanged=0;
function checkExisting(desired:Record<string,any>,category:'master'|'session'){
 const current=present.get(keyOf(desired));
 if(!current){(category==='master'?addMasters:addSessions).push(desired);return;}
 if(current.syncOwner!==ONLINE_SYNC_OWNER||current.recordType!==desired.recordType||current.institution!==desired.institution){
  throw Error(`Safety stop: online ID collides with an unrelated record: ${keyOf(desired)}.`);
 }
 if(contentDigest(current)!==contentDigest(desired)){blocked.push(`${keyOf(desired)} — class details manually changed; review separately`);return;}
 if(category==='session'&&current.manualException){
  if(current.status!=='confirmed')blocked.push(`${keyOf(desired)} — manually scheduled exception is not confirmed; review manually`);
  else unchanged++;
  return;
 }
 if(category==='session'&&current.status!=='confirmed'){
  if(current.version!==current.syncVersion){blocked.push(`${keyOf(desired)} — session status edited manually`);return;}
  if(current.status==='cancelled')flipStatus.push({current,status:'confirmed'});
  else blocked.push(`${keyOf(desired)} — unexpected session status ${current.status}`);
 } else unchanged++;
}
for(const item of planned.masters)checkExisting(item,'master');
for(const item of planned.sessions)checkExisting(item,'session');
for(const current of [...raaga,...sruti]){
 if(current.syncOwner!==ONLINE_SYNC_OWNER||current.recordType!=='class-session'||!!current.manualException||!ownedClassIds.has(current.classId)||
    typeof current.date!=='string'||current.date<from||current.date>=through||wanted.has(keyOf(current))||current.status==='cancelled')continue;
 if(current.status!=='confirmed'){blocked.push(`${keyOf(current)} — unexpected state ${current.status}`);continue;}
 if(current.version!==current.syncVersion){blocked.push(`${keyOf(current)} — manually edited version; cannot auto-cancel`);continue;}
 const blueprint=ONLINE_CLASSES.find(x=>x.id===current.classId);
 if(!blueprint||contentDigest(current)!==contentDigest({...current,name:blueprint.name,programme:blueprint.programme,teacher:blueprint.teacher,mode:'Online',location:'Online',startTime:blueprint.startTime,endTime:blueprint.endTime})){
   blocked.push(`${keyOf(current)} — details edited; cannot auto-cancel`);continue;
 }
 flipStatus.push({current,status:'cancelled'});
}
const changes={newMasters:addMasters.length,newSessions:addSessions.length,cancel:flipStatus.filter(x=>x.status==='cancelled').length,restore:flipStatus.filter(x=>x.status==='confirmed').length,unchanged,blocked:blocked.length};
const summary={mode:apply?'APPLY':'READ_ONLY_PREVIEW',table,sourceMode:flag('--markers-csv')?'REVIEWED_CSV_SNAPSHOT':'LIVE_GOOGLE_API',calendar:'Online Sessions Timetable',from,through,googleEvents:google.length,activeMarkerDays:marker.dates.length,skippedOtherTitles:marker.skipped,inactiveMarkers:marker.inactive,classes:{raaga:10,sruti:5},...changes,
 fingerprint,weekendMarkerDays:marker.dates.filter(x=>[0,6].includes(new Date(x+'T12:00:00Z').getUTCDay())),
 dateSamples:marker.dates.slice(0,20),newSessionExamples:addSessions.slice(0,10).map(x=>({date:x.date,name:x.name,time:x.startTime,institution:x.institution})),blockedExamples:blocked.slice(0,15)};
console.log(JSON.stringify(summary,null,2));
if(!apply){console.log('DRY RUN: no DynamoDB writes. Use --apply --confirm ONLINE-V074 --fingerprint <value above> after review.');process.exit(0);}
if(blocked.length)throw Error('Safety stop: manually modified or conflicting online records found; resolve blocked entries before applying.');
const pitr=await dynamo.send(new DescribeContinuousBackupsCommand({TableName:table}));
if(pitr.ContinuousBackupsDescription?.PointInTimeRecoveryDescription?.PointInTimeRecoveryStatus!=='ENABLED')throw Error('PITR must be enabled before online imports. No writes.');
const now=new Date().toISOString();let written=0;
for(const item of [...addMasters,...addSessions]){
 const record={...item,PK:schedulePK(item.institution),SK:scheduleSK(item.id),entityType:'schedule',sourceCalendar:ONLINE_CALENDAR_ID,version:1,syncVersion:1,createdAt:now,updatedAt:now};
 await db.send(new PutCommand({TableName:table,Item:record,ConditionExpression:'attribute_not_exists(PK) AND attribute_not_exists(SK)'}));
 written++;
}
for(const change of flipStatus){
 const r=change.current;
 if(!Number.isInteger(r.version)||r.version<1)throw Error(`Missing version for ${r.id}; partial import may have occurred. Review before resuming.`);
 await db.send(new UpdateCommand({TableName:table,Key:{PK:r.PK,SK:r.SK},
  UpdateExpression:'SET #status=:next, #version=:newVersion, #syncedVersion=:newVersion, #updatedAt=:now',
  ConditionExpression:'#version=:oldVersion AND #syncedVersion=:oldVersion AND #owner=:owner AND #status=:priorStatus',
  ExpressionAttributeNames:{'#status':'status','#version':'version','#updatedAt':'updatedAt','#syncedVersion':'syncVersion','#owner':'syncOwner'},
  ExpressionAttributeValues:{':next':change.status,':newVersion':r.version+1,':now':now,':oldVersion':r.version,':owner':ONLINE_SYNC_OWNER,':priorStatus':r.status}}));
 written++;
}
if(written){await db.send(new PutCommand({TableName:table,Item:{
 PK:'AUDIT#shared',SK:`ONLINE-SYNC#${now}#${randomUUID()}`,entityType:'calendarSync',
 action:'onlineClassSync',at:now,sourceCalendar:ONLINE_CALENDAR_ID,from,through,fingerprint,changes,
 },ConditionExpression:'attribute_not_exists(PK)'}));}
console.log(JSON.stringify({result:'APPLIED',written,changes,preserved:'No existing in-person schedule IDs written; imported online sessions are owned by v0.7.4'},null,2));
