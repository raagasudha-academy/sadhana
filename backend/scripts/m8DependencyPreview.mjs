/** M8 read-only dependency preview. No mutations, no PII or raw identifiers in output. */
import {randomBytes,createHmac} from 'node:crypto';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,ScanCommand} from '@aws-sdk/lib-dynamodb';

const TABLES={calendar:'sadhana-dev-calendar',students:'sadhana-dev-students',learning:'sadhana-dev-learning',admin:'sadhana-dev-admin',audit:'sadhana-dev-audit'};
const ATTRS=['PK','SK','id','studentId','studentIds','familyId','familyIds','guardianSub','parentSub','accountSub','cognitoSub','userSub','childIds','childrenIds','linkedStudentIds','registrationId','sourceWebsiteRegistrationId','homeworkId','classId','institution','archived','entityType','type','resource','source'];
const IDENTIFIER_FIELDS=new Set(['id','studentId','studentIds','familyId','familyIds','guardianSub','parentSub','accountSub','cognitoSub','userSub','childIds','childrenIds','linkedStudentIds','registrationId','sourceWebsiteRegistrationId','homeworkId','classId']);
function classify(domain,pk,sk){
 if(domain==='calendar')return 'retain:academy-calendar';
 if(domain==='audit')return 'retain:audit';
 if(pk.startsWith('TEACHER_REGISTRY')||pk.startsWith('TEACHER_SUB#'))return 'retain:staff';
 if(pk.includes('COUNTERS'))return 'retain:counters';
 if(pk.startsWith('ACCESS#')||pk.startsWith('ACCESS_REQUEST#'))return 'review:identity-access';
 if(pk==='OPS#GLOBAL#WEB_IMPORT')return 'review:website-import';
 if(pk.startsWith('OPS#GLOBAL#FAMILY')||pk.startsWith('OPS#GLOBAL#STUDENT')||/^OPS#(?:sruti|raaga)#(?:FAMILY|STUDENT|ENROLMENT)$/.test(pk)||/^(FAMILY|STUDENT|ENROLMENT)#/.test(pk)||pk==='DIRECTORY#FAMILY'||pk==='DIRECTORY#STUDENT'||/\bENROLMENT$/.test(pk))return 'review:people-enrolments';
 if(/HOMEWORK|PRACTICE|ATTENDANCE|RSVP|FEEDBACK|SUBMISSION|MATERIAL|COMMENTS/.test(pk))return 'review:learning-attendance';
 if(pk.startsWith('PHONE#'))return 'review:directory-index';
 return 'review:unmapped';
}
function familyOfKey(pk,sk){
 const p=pk.split('#');
 if(pk.startsWith('OPS#'))return p.slice(0,pk.startsWith('OPS#GLOBAL#')?3:3).join('#')+(p.length>3?'#…':'');
 if(pk.startsWith('ACCESS_REQUEST#'))return 'ACCESS_REQUEST#…';
 if(pk.startsWith('ACCESS#'))return 'ACCESS#…';
 if(pk.startsWith('TEACHER_SUB#'))return 'TEACHER_SUB#…';
 if(pk.startsWith('TEACHER_REGISTRY'))return 'TEACHER_REGISTRY';
 return (p[0]||'unknown')+(p.length>1?'#…':'');
}
function parseArgs(args){
 let max=1000;
 for(let i=0;i<args.length;i++){
  if(args[i]==='--max-items')max=Number(args[++i]);
  else if(args[i]==='--help')return {help:true,max};
  else throw Error('Unrecognised argument: '+args[i]);
 }
 if(!Number.isSafeInteger(max)||max<1||max>10000)throw Error('--max-items must be between 1 and 10000');
 return {max};
}
export async function preview({env=process.env,args=process.argv.slice(2),send}={}){
 const opts=parseArgs(args);
 if(opts.help)return {usage:'node scripts/m8DependencyPreview.mjs [--max-items 1000] (read-only, anonymous report)'};
 if(env.SADHANA_DATA_MODE!=='split')throw Error('Requires SADHANA_DATA_MODE=split');
 const doc=send?null:DynamoDBDocumentClient.from(new DynamoDBClient({region:env.AWS_REGION}));
 const dispatch=send||((cmd)=>doc.send(cmd));
 const key=randomBytes(32);
 const token=(raw)=>'ref-'+createHmac('sha256',key).update(String(raw)).digest('hex').slice(0,12);
 const rows=[]; const scanSummary=[];
 const ProjectionExpression=ATTRS.map((_,i)=>`#a${i}`).join(', ');
 const ExpressionAttributeNames=Object.fromEntries(ATTRS.map((k,i)=>[`#a${i}`,k]));
 for(const [domain,name] of Object.entries(TABLES)){
  let start,scanned=0,complete=false;
  do{
   const result=await dispatch(new ScanCommand({TableName:name,ProjectionExpression,ExpressionAttributeNames,ExclusiveStartKey:start,Limit:Math.min(100,opts.max-scanned),ConsistentRead:true}));
   for(const item of result.Items||[]){
    const pk=String(item.PK||''),sk=String(item.SK||'');
    const category=classify(domain,pk,sk);
    const refs={};
    for(const f of IDENTIFIER_FIELDS){
      const val=item[f];
      if(typeof val==='string'&&val)refs[f]=token(val);
      else if(Array.isArray(val))refs[f]=val.filter(x=>typeof x==='string').map(token).slice(0,50);
    }
    if(category.startsWith('review:'))rows.push({record:token(`${name}\u0000${pk}\u0000${sk}`),table:domain,category,keyFamily:familyOfKey(pk,sk),sortKeyKind:sk.split('#')[0]||'(empty)',refs,hasArchivedFlag:typeof item.archived==='boolean',archived:item.archived===true,hasInstitution:typeof item.institution==='string',hasEntityType:typeof item.entityType==='string'});
    scanned++;
   }
   start=result.LastEvaluatedKey;
   if(!start){complete=true;break;}
  }while(scanned<opts.max);
  scanSummary.push({table:domain,counted:scanned,complete});
 }
 const ownerMap=new Map();
 for(const r of rows)for(const [field,value]of Object.entries(r.refs))if(field==='id'||field==='studentId'||field==='familyId'){
  const values=Array.isArray(value)?value:[value];
  for(const v of values){if(!ownerMap.has(v))ownerMap.set(v,[]);ownerMap.get(v).push(r.record);}
 }
 const links=[];
 for(const r of rows)for(const [field,value]of Object.entries(r.refs)){
  const values=Array.isArray(value)?value:[value];
  for(const v of values){const matches=(ownerMap.get(v)||[]).filter(x=>x!==r.record);
   if(matches.length)links.push({from:r.record,field,to:matches.slice(0,10)});
  }
 }
 const categories={};for(const r of rows)categories[r.category]=(categories[r.category]||0)+1;
 return {readOnly:true,containsRawIdentifiers:false,containsPersonalDetails:false,complete:scanSummary.every(x=>x.complete),region:env.AWS_REGION||'default',scanSummary,categories,reviewCount:rows.length,records:rows,possibleLinks:links,limitations:['Anonymous tokens are generated afresh for each run','Relationships are possible matches on selected ID fields, not validated authority','Some relationships may be embedded in fields not scanned','External website registrations and Cognito identities have not been checked','No record is declared safe to delete']};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 preview().then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error('Read-only dependency preview failed:',e.message);process.exitCode=1;});
}
