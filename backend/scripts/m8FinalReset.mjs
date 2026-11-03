#!/usr/bin/env node
/** M8 guarded clean-slate cleanup. Local execution only. Defaults to read-only planning.
 *  DO NOT share generated plan: contains physical keys and content fingerprints.
 */
import {createHash, randomUUID} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {DynamoDBClient,DescribeTableCommand,ListBackupsCommand} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,ScanCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';

const REGION='us-east-1';
const ACCOUNT='627821644317';
const TABLES={calendar:'sadhana-dev-calendar',students:'sadhana-dev-students',learning:'sadhana-dev-learning',admin:'sadhana-dev-admin',audit:'sadhana-dev-audit'};
const BASELINE={calendar:454,students:23,learning:19,admin:23,audit:174};
const BACKUPS={
 calendar:'m8-precleanup-sadhana-dev-calendar-20261103-102713',
 students:'m8-precleanup-sadhana-dev-students-20261103-102713',
 learning:'m8-precleanup-sadhana-dev-learning-20261103-102713',
 admin:'m8-precleanup-sadhana-dev-admin-20261103-102713',
 audit:'m8-precleanup-sadhana-dev-audit-20261103-102713',
};
const COUNTER_PK=new Set(['OPS#raaga#COUNTERS','OPS#GLOBAL#COUNTERS']);
const SIGNOFFS=['allFiveStudentsVerifiedTest','guardianAndCognitoAccessReviewed','websiteRegistrationAndIdentityMappingsReviewed','sharedHomeworkAndS3MediaReviewed','academyEnrollmentPaused','backupRestoreProcedureReviewed'];
const CONFIRM='RESET 5 TEST REGISTRATIONS AND 51 SADHANA RECORDS';
const WEBSITE='raagasudha-student-registrations';
const WEBSITE_BACKUP='m8-precleanup-website-20261103-112840';
const dbRaw=new DynamoDBClient({region:REGION});
const db=DynamoDBDocumentClient.from(dbRaw,{marshallOptions:{removeUndefinedValues:true}});
const fail=(reason)=>{throw new Error(reason)};
const sha=(v)=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const stable=(v)=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const digest=(v)=>sha(stable(v));
const args=process.argv.slice(2);
const arg=(k)=>{const p=args.indexOf(k);return p<0?null:args[p+1]};
const mode=args.includes('--execute')?'execute':args.includes('--verify')?'verify':'preview';
if(args.includes('--apply'))fail('Use --execute, not --apply.');
const planPath=arg('--plan-file')||'./m8-cleanup-private.json';
const region=process.env.AWS_REGION||process.env.AWS_DEFAULT_REGION||REGION;
if(region!==REGION)fail(`Expected ${REGION}, got ${region}`);
if(process.env.SADHANA_DATA_MODE!=='split')fail('Set SADHANA_DATA_MODE=split');
if(!process.env.AWS_PROFILE)fail('Set AWS_PROFILE explicitly');
if(args.includes('--help')){console.log('Preview: node scripts/m8FinalReset.mjs --plan-file ./m8-cleanup-private.json\nVerify: node scripts/m8FinalReset.mjs --verify\nExecute: --execute --confirm "'+CONFIRM+'" --writes-paused --external-test-only-confirmed --recovery-reviewed');process.exit(0)}

async function scan(table){
 const items=[];let start;
 do{const page=await db.send(new ScanCommand({TableName:TABLES[table],ConsistentRead:true,ExclusiveStartKey:start,Limit:200}));items.push(...page.Items||[]);start=page.LastEvaluatedKey;if(items.length>10000)fail('More than 10000 items: stop');}while(start);
 return items;
}
const classOf=(t,r)=>{
 const pk=String(r.PK||'');const sk=String(r.SK||'');
 if(t==='calendar'||t==='audit')return 'PROTECTED';
 if(t==='students'){
  if(COUNTER_PK.has(pk)&&['STUDENT','FAMILY'].includes(sk))return 'COUNTER';
  if(pk==='OPS#GLOBAL#STUDENT'&&sk.startsWith('ITEM#'))return 'CANDIDATE';
  if(pk==='OPS#GLOBAL#STUDENT'&&sk.startsWith('MEDIA#'))return 'HOLD';
  if(pk==='OPS#GLOBAL#FAMILY'&&sk.startsWith('ITEM#'))return 'CANDIDATE';
  if(/^OPS#(raaga|sruti)#ENROLMENT$/.test(pk)&&sk.startsWith('ITEM#'))return 'CANDIDATE';
  if(pk==='OPS#GLOBAL#WEB_IMPORT')return 'HOLD';
  return 'PROTECTED';
 }
 if(t==='learning'){
  if(/^OPS#(raaga|sruti)#(PRACTICE|ATTENDANCE|RSVP|HOMEWORK_COMPLETION)$/.test(pk))return 'CANDIDATE';
  if(/^OPS#(raaga|sruti)#HOMEWORK_SUBMISSION#/.test(pk))return 'CANDIDATE';
  if(/^OPS#(raaga|sruti)#(HOMEWORK|HOMEWORK_MATERIAL)$/.test(pk))return 'HOLD';
  return 'PROTECTED';
 }
 if(t==='admin'){if(pk.startsWith('ACCESS#')&&sk.startsWith('STUDENT#'))return 'HOLD';return 'PROTECTED'}
 return 'PROTECTED';
};
const expected={CANDIDATE:30,HOLD:19,COUNTER:2,PROTECTED:642};
async function snapshot(){
 const all={};for(const t of Object.keys(TABLES)){all[t]=await scan(t);if(all[t].length!==BASELINE[t])fail(`Table ${t} count ${all[t].length} != baseline ${BASELINE[t]}; fresh assessment required`)}
 const records=[];
 for(const [table,items] of Object.entries(all))for(const r of items){
  if(typeof r.PK!=='string'||typeof r.SK!=='string')fail(`Bad key in ${table}`);
  records.push({table,kind:classOf(table,r),PK:r.PK,SK:r.SK,fingerprint:digest(r),raw:r});
 }
 const counts={};for(const r of records)counts[r.kind]=(counts[r.kind]||0)+1;
 for(const [k,v] of Object.entries(expected))if(counts[k]!==v)fail(`Classification ${k}=${counts[k]||0}; expected ${v}. STOP for review.`);
 const students=records.filter(r=>r.table==='students'&&r.kind==='CANDIDATE'&&r.PK==='OPS#GLOBAL#STUDENT');
 const families=records.filter(r=>r.table==='students'&&r.kind==='CANDIDATE'&&r.PK==='OPS#GLOBAL#FAMILY');
 if(students.length!==5||families.length!==1)fail('Unexpected student/family cohort');
 const familyId=families[0].raw.id;
 if(!familyId||students.some(r=>r.raw.familyId!==familyId))fail('Not all students belong to verified test family');
 const ids=new Set(students.map(r=>r.raw.id));
 if(ids.size!==5||ids.has(undefined))fail('Invalid student IDs');
 const enrolments=records.filter(r=>r.kind==='CANDIDATE'&&r.PK.endsWith('#ENROLMENT'));
 if(enrolments.length!==9||enrolments.some(r=>!ids.has(r.raw.studentId)))fail('Unexpected enrolment references');
 const learning=records.filter(r=>r.table==='learning'&&r.kind==='CANDIDATE');
 if(learning.length!==15||learning.some(r=>!ids.has(r.raw.studentId)))fail('Learning dependencies are not confined to five students');
 const links=records.filter(r=>r.table==='admin'&&r.kind==='HOLD');
 if(links.length!==9||links.some(r=>!ids.has(r.raw.studentId)))fail('Guardian links are not confined to five students');
 const imports=records.filter(r=>r.table==='students'&&r.PK==='OPS#GLOBAL#WEB_IMPORT');
 if(imports.length!==5)fail('Unexpected website import count');
 const counters=records.filter(r=>r.kind==='COUNTER');
 if(counters.length!==2||counters.some(r=>r.PK!=='OPS#raaga#COUNTERS'&&r.PK!=='OPS#GLOBAL#COUNTERS'))fail('Unexpected counter keys');
 const protectedRecords=records.filter(r=>r.kind==='PROTECTED');
 return {records,all,counts,protectedDigest:digest(protectedRecords.map(r=>[r.table,r.PK,r.SK,r.fingerprint]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))))};
}
async function verifyBackups(){
 
 for(const [name,table] of Object.entries(TABLES)){
  let start;let found;
  do{const resp=await dbRaw.send(new ListBackupsCommand({TableName:table,BackupType:'USER',ExclusiveStartBackupArn:start}));found=resp.BackupSummaries?.find(b=>b.BackupName===BACKUPS[name]);if(found)break;start=resp.LastEvaluatedBackupArn;}while(start);
  if(!found||found.BackupStatus!=='AVAILABLE'||!String(found.BackupArn||'').includes(`:${ACCOUNT}:`))fail(`Backup not AVAILABLE in expected AWS account: ${BACKUPS[name]}`);
 }
}
const planShape=(snapshot)=>({schema:1,stage:'APPROVAL_REQUIRED',accountRegion:REGION,tables:TABLES,backups:BACKUPS,baselineCounts:BASELINE,classificationCounts:snapshot.counts,protectedDigest:snapshot.protectedDigest,
 rows:snapshot.records.filter(r=>r.kind!=='PROTECTED').map(r=>({table:r.table,kind:r.kind,PK:r.PK,SK:r.SK,fingerprint:r.fingerprint,approved:false,verificationNote:''})).sort((a,b)=>`${a.table}\t${a.PK}\t${a.SK}`.localeCompare(`${b.table}\t${b.PK}\t${b.SK}`)),
 signoffs:Object.fromEntries(SIGNOFFS.map(x=>[x,false])),notice:'PRIVATE FILE: physical keys and record hashes; never upload or commit. Set every row approved=true and signoffs=true only after independent checks. No automatic decisions.'});
function planDigest(p){return digest({schema:p.schema,rows:p.rows.map(({table,kind,PK,SK,fingerprint})=>({table,kind,PK,SK,fingerprint})),protectedDigest:p.protectedDigest,backups:p.backups,baselineCounts:p.baselineCounts})}
async function websiteSnapshot(){
 const info=await dbRaw.send(new DescribeTableCommand({TableName:WEBSITE}));
 const keyNames=(info.Table?.KeySchema||[]).map(k=>k.AttributeName);
 if(info.Table?.TableStatus!=='ACTIVE'||keyNames.length<1||keyNames.length>2)fail('Unexpected website table schema');
 const rows=[];let cursor;
 do{
  const page=await db.send(new ScanCommand({TableName:WEBSITE,ConsistentRead:true,ExclusiveStartKey:cursor,Limit:100}));
  rows.push(...(page.Items||[]));cursor=page.LastEvaluatedKey;
  if(rows.length>5)fail('Website table has more than 5 records: STOP');
 }while(cursor);
 if(rows.length!==5)fail(`Website count ${rows.length} != expected test cohort 5`);
 const statuses={};const reviews={};const imports={};
 const keyed=rows.map(item=>{
  const key=Object.fromEntries(keyNames.map(k=>[k,item[k]]));
  if(Object.values(key).some(v=>v===undefined))fail('Missing website key attribute');
  const status=item.status;const review=item.reviewStatus;const imp=item.sadhanaImport?.status;
  statuses[status]=(statuses[status]||0)+1;
  reviews[review]=(reviews[review]||0)+1;
  imports[imp]=(imports[imp]||0)+1;
  return {key,item,fingerprint:digest(item)};
 });
 if(statuses.SUBMITTED!==5||Object.keys(statuses).length!==1||reviews.approved!==3||reviews.pending!==2||imports.imported!==3||imports['not-imported']!==2)
   fail('Website registration states no longer match reviewed five-test baseline');
 return {keyNames,rows:keyed,counts:{status:statuses,reviewStatus:reviews,importStatus:imports}};
}
async function verifyWebsiteBackup(){
 let cursor,found;
 do{
  const page=await dbRaw.send(new ListBackupsCommand({TableName:WEBSITE,BackupType:'USER',ExclusiveStartBackupArn:cursor}));
  found=page.BackupSummaries?.find(x=>x.BackupName===WEBSITE_BACKUP);
  if(found)break;
  cursor=page.LastEvaluatedBackupArn;
 }while(cursor);
 if(!found||found.BackupStatus!=='AVAILABLE'||!String(found.BackupArn||'').includes(`:${ACCOUNT}:`))fail('Website backup missing, not AVAILABLE or in unexpected account');
}
function deleteCondition(table,key,item){
 const names={'#pk':Object.keys(key)[0]};
 const values={};
 const conditions=['attribute_exists(#pk)'];
 // Conditional equality of every current top-level attribute prevents stale record modification during cleanup.
 let i=0;
 for(const [field,value] of Object.entries(item)){
  const alias=`#f${i}`;const val=`:v${i}`;i++;
  names[alias]=field;values[val]=value;conditions.push(`${alias} = ${val}`);
 }
 const cond=conditions.join(' AND ');
 if(cond.length>3800)fail(`Conditional expression too large for ${table}`);
 return {Delete:{TableName:table,Key:key,ConditionExpression:cond,ExpressionAttributeNames:names,ExpressionAttributeValues:values}};
}
async function main(){
 // STS identity check blocks incorrect AWS accounts, even if a user has similarly named backups.
 const identity=JSON.parse(execFileSync('aws',['sts','get-caller-identity','--profile',process.env.AWS_PROFILE,'--region',REGION,'--output','json'],{encoding:'utf8'}));
 if(identity.Account!==ACCOUNT)fail('AWS account mismatch; STOP');
 await verifyBackups();await verifyWebsiteBackup();
 if(mode==='verify'){
  const counts={};
  for(const [domain,table] of Object.entries(TABLES)){
   let cursor;let n=0;do{const page=await db.send(new ScanCommand({TableName:table,ConsistentRead:true,Select:'COUNT',ExclusiveStartKey:cursor}));n+=page.Count||0;cursor=page.LastEvaluatedKey;}while(cursor);
   counts[domain]=n;
  }
  let cursor,websiteCount=0;do{const page=await db.send(new ScanCommand({TableName:WEBSITE,ConsistentRead:true,Select:'COUNT',ExclusiveStartKey:cursor}));websiteCount+=page.Count||0;cursor=page.LastEvaluatedKey;}while(cursor);
  const passed=counts.calendar===454&&counts.audit===174&&counts.admin===14&&counts.students===0&&counts.learning===0&&websiteCount===0;
  console.log(JSON.stringify({readOnly:true,mode:'POST_RESET_VERIFY',counts,websiteCount,expected:{calendar:454,students:0,learning:0,admin:14,audit:174,website:0},passed,legacyTableNotInspected:true,s3AndCognitoNotInspected:true},null,2));
  if(!passed)process.exitCode=2;return;
 }
 const snap=await snapshot();
 if(!existsSync(planPath))fail('Existing private plan is required');
 const p=JSON.parse(readFileSync(planPath,'utf8'));
 if(p.schema!==1||p.planDigest!==planDigest(p)||p.planDigest!==planDigest(planShape(snap)))fail('Private plan invalid or live database drifted');
 const website=await websiteSnapshot();
 const targets=snap.records.filter(r=>r.kind!=='PROTECTED');
 if(targets.length!==51||website.rows.length!==5)fail('Unexpected target count');
 const result={mode:mode==='preview'?'READ_ONLY_FINAL_PREVIEW':'EXECUTION_PREFLIGHT',awsAccount:ACCOUNT,region:REGION,
   sadhana:{targets:51,candidates:30,holdTestRecords:19,countersToReset:2,protected:642},
   website:{targets:5,states:website.counts},transactionActions:56,
   legacyTableUntouched:true,staffCalendarAuditUntouched:true,
   cognitoAccountsUntouched:true,s3ObjectsUntouched:true,
   note:'S3 objects and Cognito accounts are NOT deleted. This resets DynamoDB test data only.'};
 if(mode==='preview'){console.log(JSON.stringify(result,null,2));return;}
 if(arg('--confirm')!==CONFIRM)fail('Exact final confirmation phrase required');
 if(!args.includes('--writes-paused'))fail('Explicit --writes-paused attestation required: disable both website intake and academy import/enrolment writers');
 if(!args.includes('--external-test-only-confirmed'))fail('Explicit --external-test-only-confirmed attestation required');
 if(!args.includes('--recovery-reviewed'))fail('Explicit --recovery-reviewed attestation required: understand backups restore into separate tables');
 // Re-read all data and backups just before building the atomic transaction.
 await verifyBackups();await verifyWebsiteBackup();
 const again=await snapshot();const wAgain=await websiteSnapshot();
 if(planDigest(planShape(again))!==p.planDigest||digest(wAgain.rows.map(x=>[x.key,x.fingerprint]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))))!==digest(website.rows.map(x=>[x.key,x.fingerprint]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))))fail('Data changed between preview and execution');
 const tx=[...targets.map(r=>deleteCondition(TABLES[r.table],{PK:r.PK,SK:r.SK},r.raw)),...website.rows.map(r=>deleteCondition(WEBSITE,r.key,r.item))];
 if(tx.length!==56||Buffer.byteLength(JSON.stringify(tx))>3_000_000)fail('Transaction size limit exceeded');
 // AWS DynamoDB TransactWriteItems is atomic across these six physical tables.
 await db.send(new TransactWriteCommand({TransactItems:tx,ClientRequestToken:randomUUID()}));
 console.log(JSON.stringify({result:'DYNAMODB_ATOMIC_RESET_COMMITTED',deletedSadhana:51,deletedWebsite:5,countersRemoved:2,protectedRecordsPreservedBySelection:true,legacyUntouched:true,cognitoUntouched:true,s3ObjectsUntouched:true,next:'Run post-reset read-only verification and check S3/Cognito test resources separately'},null,2));
}
main().catch(e=>{console.error('M8 FINAL RESET SAFE STOP:',e.message);process.exitCode=1});
