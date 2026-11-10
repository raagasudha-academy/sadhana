#!/usr/bin/env node
/** M8 guarded clean-slate cleanup. Local execution only. Defaults to read-only planning.
 *  DO NOT share generated plan: contains physical keys and content fingerprints.
 */
import {createHash, randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,chmodSync,existsSync} from 'node:fs';
import {DynamoDBClient,DescribeBackupCommand} from '@aws-sdk/client-dynamodb';
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
const CONFIRM='DELETE 49 TEST RECORDS AND RESET 2 COUNTERS';
const dbRaw=new DynamoDBClient({region:REGION});
const db=DynamoDBDocumentClient.from(dbRaw,{marshallOptions:{removeUndefinedValues:true}});
const fail=(reason)=>{throw new Error(reason)};
const sha=(v)=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const stable=(v)=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const digest=(v)=>sha(stable(v));
const args=process.argv.slice(2);
const arg=(k)=>{const p=args.indexOf(k);return p<0?null:args[p+1]};
const mode=args.includes('--apply')?'apply':'plan';
const planPath=arg('--plan-file')||'./cleanup-private.json';
const region=process.env.AWS_REGION||process.env.AWS_DEFAULT_REGION||REGION;
if(region!==REGION)fail(`Expected ${REGION}, got ${region}`);
if(process.env.SADHANA_DATA_MODE!=='split')fail('Set SADHANA_DATA_MODE=split');
if(!process.env.AWS_PROFILE)fail('Set AWS_PROFILE explicitly');
if(args.includes('--help')){console.log('Plan: node scripts/guardedCleanup.mjs --plan-file ./cleanup-private.json\nApply: --apply --plan-file ... --confirm "'+CONFIRM+'"');process.exit(0)}

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
 const {ListBackupsCommand}=await import('@aws-sdk/client-dynamodb');
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
async function main(){
 await verifyBackups();
 const snap=await snapshot();
 if(mode==='plan'){
  if(existsSync(planPath))fail('Plan file exists; refusing to overwrite prior decisions. Choose a new --plan-file path.');
  const p=planShape(snap);p.planDigest=planDigest(p);p.createdAt=new Date().toISOString();
  writeFileSync(planPath,JSON.stringify(p,null,2)+'\n',{mode:0o600,flag:'wx'});chmodSync(planPath,0o600);
  console.log(JSON.stringify({mode:'READ_ONLY_PLAN',output:planPath,reviewRows:p.rows.length,counts:snap.counts,backupVerified:true,applyEnabled:false,notice:'Private file. Inspect every HOLD and external dependency before approval.'},null,2));return;
 }
 if(arg('--confirm')!==CONFIRM)fail('Explicit confirmation phrase missing');
 if(!existsSync(planPath))fail('Approval plan missing');
 const p=JSON.parse(readFileSync(planPath,'utf8'));
 if(p.schema!==1||p.planDigest!==planDigest(p))fail('Plan integrity check failed');
 if(p.planDigest!==planDigest(planShape(snap)))fail('Live key/fingerprint/protected baseline drifted. STOP and regenerate plan.');
 if(p.rows.length!==51||p.rows.some(r=>r.approved!==true||typeof r.verificationNote!=='string'||r.verificationNote.trim().length<12))fail('All 51 rows need explicit approval and an informative verificationNote');
 if(SIGNOFFS.some(k=>p.signoffs?.[k]!==true))fail('External approvals/signoffs incomplete');
 const targets=snap.records.filter(r=>r.kind!=='PROTECTED');
 if(targets.length!==51)fail('Target mismatch');
 // Recheck backup and re-scan immediately before the transaction. This is a single atomic deletion of 51 rows.
 await verifyBackups();
 const again=await snapshot();
 if(planDigest(planShape(again))!==p.planDigest)fail('Data changed before execution');
 const tx=targets.map(r=>{
  const names={'#pk':'PK','#sk':'SK'};const values={};
  const conditions=['attribute_exists(#pk)','attribute_exists(#sk)'];
  for(const [i,k] of ['id','studentId','familyId','classId','homeworkId','registrationId','version','updatedAt','value'].entries()){
   if(r.raw[k]===undefined)continue;
   names[`#f${i}`]=k;values[`:f${i}`]=r.raw[k];conditions.push(`#f${i} = :f${i}`);
  }
  const deletion={TableName:TABLES[r.table],Key:{PK:r.PK,SK:r.SK},ConditionExpression:conditions.join(' AND '),ExpressionAttributeNames:names};
  if(Object.keys(values).length)deletion.ExpressionAttributeValues=values;
  return {Delete:deletion};
 });
 // Extra safety: do not permit transaction over 100 items or beyond 4 MB, and preserve protected rows by construction.
 if(tx.length!==51||Buffer.byteLength(JSON.stringify(tx))>3_000_000)fail('Transaction size guard');
 await db.send(new TransactWriteCommand({TransactItems:tx,ClientRequestToken:randomUUID()}));
 console.log(JSON.stringify({result:'ATOMIC_CLEANUP_COMMITTED',deleted:51,studentRecordsDeleted:5,countersRemoved:2,protectedRecordsUntouched:true,note:'This does not delete S3 objects, Cognito users or external website records. Verify those systems separately.'},null,2));
}
main().catch(e=>{console.error('M8 SAFE STOP:',e.message);process.exitCode=1});
