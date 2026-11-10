/** M8 read-only DynamoDB inventory. No write commands, no student PII output. */
import {DynamoDBClient,DescribeTableCommand} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,ScanCommand} from '@aws-sdk/lib-dynamodb';

export const SPLIT_TABLES = Object.freeze({
  calendar:'sadhana-dev-calendar',students:'sadhana-dev-students',
  learning:'sadhana-dev-learning',admin:'sadhana-dev-admin',audit:'sadhana-dev-audit',
});
export function classify(pk,sk='') {
  pk=String(pk||''); sk=String(sk||'');
  if (pk.startsWith('AUDIT#')) return 'retain:audit';
  if (pk.startsWith('TEACHER_REGISTRY')||pk.startsWith('TEACHER_SUB#')) return 'retain:staff';
  if (pk.startsWith('SCHEDULE#')||pk.startsWith('SCHEDULE_SERIES#')||pk.startsWith('CALENDAR#')||pk.startsWith('CLASS#')||pk.startsWith('VENUE#')||pk==='DIRECTORY#VENUE'||/^INST#[^#]+#CLASS$/.test(pk)) return 'retain:academy-calendar';
  if (pk.includes('COUNTERS')) return 'retain:counters';
  if (pk.startsWith('ACCESS#')||pk.startsWith('ACCESS_REQUEST#')) return 'review:identity-access';
  if (pk==='OPS#GLOBAL#WEB_IMPORT') return 'review:website-import';
  if (pk.startsWith('OPS#GLOBAL#FAMILY')||pk.startsWith('OPS#GLOBAL#STUDENT')||/^OPS#(?:sruti|raaga)#(?:FAMILY|STUDENT|ENROLMENT)$/.test(pk)|| /^(FAMILY|STUDENT|ENROLMENT)#/.test(pk)||pk==='DIRECTORY#FAMILY'||pk==='DIRECTORY#STUDENT'||/\bENROLMENT$/.test(pk)) return 'review:people-enrolments';
  if (/HOMEWORK|PRACTICE|ATTENDANCE|RSVP|FEEDBACK|SUBMISSION|MATERIAL|COMMENTS/.test(pk)) return 'review:learning-attendance';
  if (pk.startsWith('PHONE#')) return 'review:directory-index';
  return 'review:unmapped';
}
export function resolveTables(env=process.env){
  if(env.SADHANA_DATA_MODE==='split')return Object.entries(SPLIT_TABLES).map(([domain,name])=>({domain,name}));
  if(!env.SADHANA_TABLE_NAME)throw Error('Set SADHANA_TABLE_NAME for legacy mode or SADHANA_DATA_MODE=split for split mode');
  return [{domain:'legacy',name:env.SADHANA_TABLE_NAME}];
}
function parseArgs(args){
  const opts={scan:false,maxItems:10000};
  for(let i=0;i<args.length;i++){
    if(args[i]==='--scan')opts.scan=true;
    else if(args[i]==='--max-items'){
      opts.maxItems=Number(args[++i]);
      if(!Number.isSafeInteger(opts.maxItems)||opts.maxItems<1||opts.maxItems>100000)throw Error('--max-items must be 1..100000');
    }else if(args[i]==='--help')opts.help=true;
    else throw Error('Unexpected argument: '+args[i]);
  }
  return opts;
}
export async function inventory({env=process.env,args=process.argv.slice(2),client}={}){
  const options=parseArgs(args);
  if(options.help)return {help:'node scripts/databaseInventory.mjs [--scan] [--max-items 10000]  (read-only)'};
  const tables=resolveTables(env);
  const raw=client||new DynamoDBClient({region:env.AWS_REGION});
  const doc=DynamoDBDocumentClient.from(raw,{marshallOptions:{removeUndefinedValues:true}});
  const output={readOnly:true,mode:env.SADHANA_DATA_MODE==='split'?'split':'legacy',region:env.AWS_REGION||'AWS default',scanned:options.scan,maxItemsPerTable:options.scan?options.maxItems:0,tables:[]};
  for(const {domain,name} of tables){
    const described=await raw.send(new DescribeTableCommand({TableName:name}));
    const info=described.Table||{};
    const entry={domain,name,status:info.TableStatus||'unknown',keySchema:(info.KeySchema||[]).map(k=>({attribute:k.AttributeName,type:k.KeyType})),indexes:(info.GlobalSecondaryIndexes||[]).map(i=>i.IndexName),approximateItems:info.ItemCount??null};
    if(options.scan){
      const counts={};let scanned=0;let cursor;let complete=false;
      // Only key fields are requested, to avoid reading or returning student contact information.
      do{
        const page=await doc.send(new ScanCommand({TableName:name,ProjectionExpression:'PK,SK',ExclusiveStartKey:cursor,Limit:Math.min(200,options.maxItems-scanned)}));
        for(const item of page.Items||[]){const category=classify(item.PK,item.SK);counts[category]=(counts[category]||0)+1;}
        scanned+=(page.Items||[]).length;
        cursor=page.LastEvaluatedKey;
        if(!cursor){complete=true;break;}
      }while(scanned<options.maxItems);
      entry.scan={counted:scanned,complete,counts,warning:complete?'Complete key-only scan; no deletion eligibility inferred':'PARTIAL SCAN — counts are incomplete; no deletion eligibility inferred'};
    }
    output.tables.push(entry);
  }
  return output;
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  inventory().then(report=>{console.log(JSON.stringify(report,null,2));}).catch(error=>{console.error('Read-only inventory failed:',error.message);process.exitCode=1;});
}
