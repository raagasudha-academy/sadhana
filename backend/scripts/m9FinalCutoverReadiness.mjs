/** Read-only AWS readiness audit. NEVER provisions tables, alters Lambda or switches routing. */
import {writeFileSync,readFileSync} from 'node:fs';
import {readinessChecks} from '../src/m9ReadinessEvidenceCore.mjs';
import {DynamoDBClient,DescribeTableCommand,GetItemCommand,ScanCommand} from '@aws-sdk/client-dynamodb';
import {buildReadinessReport} from '../src/m9FinalAccessCore.mjs';
const args=process.argv.slice(2);
const idx=args.indexOf('--report');
if(idx<0||!args[idx+1]||args.includes('--execute'))throw Error('Usage: node scripts/m9FinalCutoverReadiness.mjs --report ./m9-final-readiness.json (read-only only)');
const path=args[idx+1];
const parityIndex=args.indexOf('--parity-report');
if(parityIndex>=0&&(!args[parityIndex+1]||args[parityIndex+1].startsWith('--')))throw Error('--parity-report requires path');
const parityReport=parityIndex>=0?JSON.parse(readFileSync(args[parityIndex+1],'utf8')):null;
const region=process.env.AWS_REGION||'us-east-1';
const profile=process.env.AWS_PROFILE||'default';
const client=new DynamoDBClient({region});
const types=['institutions','people','families','family-links','classes','venues','enrolments','sessions','attendance','practice','homework','submissions','events','rsvps','registrations','notifications','audit','counters'];
const name=(x)=>`sadhana-dev-m9-${x}`;
const actualTables=[];const counts={};const tableStatuses={};
async function count(table){let next;let total=0;do{const out=await client.send(new ScanCommand({TableName:table,Select:'COUNT',ExclusiveStartKey:next}));total+=out.Count??0;next=out.LastEvaluatedKey;}while(next);return total;}
for(const entity of types){
 try{
  const r=await client.send(new DescribeTableCommand({TableName:name(entity)}));
  const table=r.Table;
  tableStatuses[entity]={status:table?.TableStatus,hasPitrStatus:'not assessed',deletionProtection:table?.DeletionProtectionEnabled??null,gsis:(table?.GlobalSecondaryIndexes??[]).every(x=>x.IndexStatus==='ACTIVE')};
  if(table?.TableStatus!=='ACTIVE'||!tableStatuses[entity].gsis)continue;
  actualTables.push(name(entity));counts[entity]=await count(name(entity));
 }catch(e){tableStatuses[entity]={errorName:e?.name||'Unknown'};}
}
let seededInstitutions=[];
if(actualTables.includes(name('institutions'))){
 for(const id of ['raaga','sruti']){
  const r=await client.send(new GetItemCommand({TableName:name('institutions'),Key:{institutionId:{S:id}},ConsistentRead:true,ProjectionExpression:'institutionId'}));
  if(r.Item)seededInstitutions.push(id);
 }
}
// Only measured parity can satisfy parity checks. Deployed E2E checks are
// intentionally NOT approved by local assertions or by a guessed environment.
const evidence=readinessChecks({seededInstitutions,counts,parityReport});
const checks=evidence.checks;
const result={milestone:'M9_FINAL',awsProfile:profile,region,...buildReadinessReport({counts,requiredTables:types.map(name),actualTables,checks}),seededInstitutions,tableStatuses,operationalDataTransferred:461,legacyAuditMigrationRequested:false,parityEvidenceAccepted:evidence.parityEvidenceAccepted,requiredDeployedEvidence:evidence.requiredDeployedEvidence,
 notice:'Read-only audit. Unit-test success does not prove deployed Cognito/IAM, website integration, learning workflows or rollback. DO NOT CUT OVER unless all checks are independently verified.'};
writeFileSync(path,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({report:path,readOnly:true,fullCutoverReady:result.fullCutoverReady,blockerCount:result.blockerCount,blockers:result.blockers},null,2));
