/** READ-ONLY AWS IAM and HTTPS authentication smoke verification. No feature flags, writes, or credentials are changed. */
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {M9_DOMAINS,M9_TABLE_ACTIONS,M9_INDEX_ACTIONS,targetArns,simulateResourceDecision,securityDecision} from './finalSecurityCore.mjs';
const args=process.argv.slice(2);
const option=(k)=>{const n=args.indexOf(k);return n<0?null:args[n+1]||null;};
if(args.some(x=>['--execute','--deploy','--enable','--cutover'].includes(x)))throw Error('Read-only checker; execution flags are prohibited.');
const reportPath=option('--report');
const functionName=option('--lambda-name');
const apiUrl=option('--api-base-url');
if(!reportPath||reportPath.startsWith('--')||!functionName||functionName.startsWith('--'))throw Error('Usage: node scripts/finalSecurityVerify.mjs --lambda-name NAME --report PATH [--api-base-url https://...]');
if(apiUrl && (!/^https:\/\//i.test(apiUrl)||new URL(apiUrl).username||new URL(apiUrl).password))throw Error('Only HTTPS API URL without embedded credentials allowed.');
const region=process.env.AWS_REGION||'us-east-1',profile=process.env.AWS_PROFILE||'default';
function aws(service,operation,extra=[]){
 const p=[service,operation,...extra,'--region',region,'--profile',profile,'--output','json'];
 try{return JSON.parse(execFileSync('aws',p,{encoding:'utf8',timeout:30000,maxBuffer:8_000_000,stdio:['ignore','pipe','pipe']}));}
 catch(e){const message=String(e?.stderr||e?.message||'AWS CLI failure');throw Error(`${service} ${operation}: ${message.slice(0,500)}`);}
}
const account=aws('sts','get-caller-identity').Account;
const config=aws('lambda','get-function-configuration',['--function-name',functionName]);
if(!config.Role||!config.FunctionArn)throw Error('Lambda role / ARN unavailable');
const scopes=targetArns({region,account});
const scans=[];let iamError=null;
// Invoke one action and one resource per IAM request: some DynamoDB operations
// cannot be simulated together, which caused a previous false diagnostic error.
for(const [kind,actions] of [['table',M9_TABLE_ACTIONS],['index',M9_INDEX_ACTIONS]]){
 for(const action of actions){
  const resources=scopes.map(x=>x[kind]);
  try{
   // One IAM action per request avoids incompatible mixed-action simulation.
   const response=aws('iam','simulate-principal-policy',['--policy-source-arn',config.Role,'--action-names',action,'--resource-arns',...resources,'--max-items','1000']);
   for(const {domain,...arns} of scopes){
    const resource=arns[kind];
    const outcome=simulateResourceDecision(response,action,resource);
    scans.push({domain,kind,action,...outcome});
   }
   if(response.IsTruncated||response.Marker){
    scans.filter(x=>x.kind===kind&&x.action===action).forEach(x=>{x.passed=false;x.error='TRUNCATED_IAM_RESULTS';});
    if(!iamError)iamError=`IAM simulation truncated for ${action}`;
   }
  }catch(e){
   scans.push(...scopes.map(({domain})=>({domain,kind,action,passed:false,error:'IAM_SIMULATION_ERROR'})));
   if(!iamError)iamError=String(e.message).slice(0,500);
  }
 }
}
let apiProbe=null;
if(apiUrl){
 const url=new URL('schedule?institution=raaga',apiUrl.endsWith('/')?apiUrl:apiUrl+'/');
 const statuses=[];
 for(const headers of [{},{Authorization:'Bearer intentionally-invalid-m9-test-token'}]){
  try{
   const r=await fetch(url,{method:'GET',headers,redirect:'manual',signal:AbortSignal.timeout(12000)});
   statuses.push(r.status);await r.body?.cancel();
  }catch(e){statuses.push(`REQUEST_ERROR:${e?.name||'Unknown'}`);}
 }
 apiProbe={probePath:'/schedule?institution=raaga',statuses,warning:'Tests anonymous and invalid-token rejection only, not role-specific or cross-academy access.'};
}
const decision=securityDecision({scans,apiProbe,iamError,tableCount:scopes.length});
const result={schema:1,milestone:'M9_SECURITY_EVIDENCE',readOnly:true,canExecute:false,region,accountId:account,lambda:{name:config.FunctionName,roleArn:config.Role,lastModified:config.LastModified},tableCount:scopes.length,scans,iamError,apiProbe,decision,
  unverifiedWorkflows:['cognitoInvitationsOnM9','guardianPortalEndToEnd','websiteBothAcademies','allLearningEndpointsOnM9','rollbackExercised','crossInstitutionNegativeAuthDeployed'],
  notice:'Do not enable M9 pilot or cut over. This read-only report is evidence, not workflow validation.'};
writeFileSync(reportPath,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({report:reportPath,readOnly:true,simulationCount:scans.length,iamVerified:decision.iamVerified,denied:decision.failedSimulations,anonymousVerified:decision.anonymousVerified,remainingWorkflows:result.unverifiedWorkflows,iamError},null,2));
