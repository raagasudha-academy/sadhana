/** Preview or guarded deletion of ONLY test registration records. Calendar and staff keys are never scanned for deletion. */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {DynamoDBClient,DescribeBackupCommand} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,QueryCommand,DeleteCommand} from '@aws-sdk/lib-dynamodb';
const table=process.env.SADHANA_TABLE_NAME||'sadhana-dev-main';
const db=DynamoDBDocumentClient.from(new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'}));
const kinds=['FAMILY','STUDENT','ENROLMENT','ATTENDANCE','PRACTICE','FEEDBACK','RSVP'];
const partitions=['sruti','raaga'].flatMap(inst=>kinds.map(k=>`OPS#${inst}#${k}`)).concat(kinds.map(k=>`OPS#GLOBAL#${k}`));
const mode=process.argv[2];
const file=process.argv[3]||'registration-reset-manifest.json';
if(!['preview','execute'].includes(mode))throw Error('Usage: tsx scripts/resetTestRegistration.ts preview [manifest.json] OR execute manifest.json --confirm=DELETE-TEST-REGISTRATION');
const keyString=(v:{PK:string;SK:string})=>`${v.PK}\t${v.SK}`;
async function queryAll(pk:string){let last:any;const rows:any[]=[];do{const r=await db.send(new QueryCommand({TableName:table,KeyConditionExpression:'PK = :pk',ExpressionAttributeValues:{':pk':pk},ExclusiveStartKey:last,ConsistentRead:true}));rows.push(...r.Items||[]);last=r.LastEvaluatedKey;}while(last);return rows;}
const items=(await Promise.all(partitions.map(queryAll))).flat();
const keys=items.map(({PK,SK,version})=>({PK,SK,version})).sort((a,b)=>keyString(a).localeCompare(keyString(b)));
const hash=createHash('sha256').update(JSON.stringify(keys)).digest('hex');
if(mode==='preview'){
 const manifest={table,region:process.env.AWS_REGION||'us-east-1',createdAt:new Date().toISOString(),sha256:hash,count:keys.length,counts:Object.fromEntries(partitions.map(pk=>[pk,keys.filter(k=>k.PK===pk).length]).filter(([,n])=>n)),keys};
 writeFileSync(file,JSON.stringify(manifest,null,2));
 console.log(`READ-ONLY PREVIEW: ${keys.length} registration records in ${table}. No calendar/staff records selected.\nManifest ${file}\nSHA256 ${hash}`);
 console.log(JSON.stringify(manifest.counts,null,2));
}else{
 if(!process.argv.includes('--confirm=DELETE-TEST-REGISTRATION'))throw Error('Explicit --confirm=DELETE-TEST-REGISTRATION required');
 const manifest=JSON.parse(readFileSync(file,'utf8'));
 if(manifest.table!==table||manifest.region!==(process.env.AWS_REGION||'us-east-1')||manifest.sha256!==hash||JSON.stringify(manifest.keys)!==JSON.stringify(keys))throw Error('Preview changed; regenerate and reapprove manifest. NOTHING deleted.');
 if(!keys.every(k=>partitions.includes(k.PK)&&k.SK.startsWith('ITEM#')))throw Error('Unsafe deletion scope; nothing deleted.');
 if(!process.env.SADHANA_RESET_BACKUP_ARN)throw Error('Set SADHANA_RESET_BACKUP_ARN to an AVAILABLE on-demand backup ARN before deletion');
 const verified=await new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'}).send(new DescribeBackupCommand({BackupArn:process.env.SADHANA_RESET_BACKUP_ARN}));
 if(verified.BackupDescription?.BackupDetails?.BackupStatus!=='AVAILABLE'||!verified.BackupDescription?.SourceTableDetails?.TableName||verified.BackupDescription.SourceTableDetails.TableName!==table)throw Error('Backup not AVAILABLE or does not belong to this table. Nothing deleted.');
 console.log(`APPROVED: deleting ${keys.length} test registration records only; backup: ${process.env.SADHANA_RESET_BACKUP_ARN}`);
 for(const {PK,SK,version} of keys){await db.send(new DeleteCommand({TableName:table,Key:{PK,SK},ConditionExpression:version===undefined?'attribute_exists(PK) AND attribute_not_exists(#v)':'#v = :v',ExpressionAttributeNames:{'#v':'version'},...(version===undefined?{}:{ExpressionAttributeValues:{':v':version}})}));}
 console.log(`Done. Deleted ${keys.length} registration records. All schedule/teacher/venue partitions untouched.`);
}
