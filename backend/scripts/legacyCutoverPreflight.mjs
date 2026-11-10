/** Read-only M9 release preflight. Never changes AWS or enables M9 feature flags. */
import {execFileSync} from 'node:child_process';
import {writeFileSync,existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const argv=process.argv.slice(2);
const arg=(name,def)=>{const i=argv.indexOf(name);return i<0?def:argv[i+1]};
if(argv.some(x=>['--execute','--deploy','--cutover','--enable'].includes(x)))throw Error('Read-only preflight: no mutation flags accepted');
const region=process.env.AWS_REGION||'us-east-1',profile=process.env.AWS_PROFILE||'default';
const fn=arg('--lambda-name','sadhana-dev-SadhanaApiLambda-r891ZvuYQfPh');
const api=arg('--api-id','6n9clqr224');
const report=arg('--report','./legacy-cutover-preflight.json');
if(!fn||!api||!report||report.startsWith('--')||existsSync(report))throw Error('Supply valid --lambda-name, --api-id and a NEW --report filename');
function aws(...command){return JSON.parse(execFileSync('aws',[...command,'--profile',profile,'--region',region,'--output','json'],{encoding:'utf8',timeout:30000,maxBuffer:20e6,stdio:['ignore','pipe','pipe']}));}
const checks=[];const check=(name,pass,detail)=>checks.push({name,passed:pass===true,detail});
let identity,lambda;
try{identity=aws('sts','get-caller-identity');check('awsIdentity',Boolean(identity.Account),identity.Account)}catch(e){check('awsIdentity',false,String(e?.stderr||e.message).slice(0,300))}
try{lambda=aws('lambda','get-function-configuration','--function-name',fn);check('lambdaObserved',!!lambda.Role&&lambda.State==='Active',lambda.State||'unknown');const keys=Object.keys(lambda.Environment?.Variables||{});const expected=['M9_STRICT_DATA_FENCE','M9_FINAL_LEARNER_READS','M9_LEARNER_WRITES','M9_HOMEWORK_WRITES','M95_ONBOARDING_MODE'];check('environmentKeysInspected',true,{present:expected.filter(x=>keys.includes(x)),missing:expected.filter(x=>!keys.includes(x))});check('liveCutoverDisabled',!['enabled','pilot'].includes(lambda.Environment?.Variables?.M9_STRICT_DATA_FENCE)&&lambda.Environment?.Variables?.M95_COMPAT_MODE!=='pilot','Existing Lambda retained for legacy traffic');}catch(e){check('lambdaObserved',false,String(e?.stderr||e.message).slice(0,300))}
try{const routes=aws('apigatewayv2','get-routes','--api-id',api).Items||[];const stages=aws('apigatewayv2','get-stages','--api-id',api).Items||[];check('apiRouteAndStage',routes.some(x=>x.RouteKey==='ANY /api/{proxy+}')&&stages.some(x=>x.StageName==='dev'),{routes:routes.map(x=>x.RouteKey),stages:stages.map(x=>x.StageName)});}catch(e){check('apiRouteAndStage',false,String(e?.stderr||e.message).slice(0,300))}
const domains=['institutions','people','families','family-links','classes','venues','enrolments','sessions','attendance','practice','homework','submissions','events','rsvps','registrations','notifications','audit','counters'];
let ready=0;
for(const d of domains){try{const t=aws('dynamodb','describe-table','--table-name',`sadhana-dev-m9-${d}`).Table;const ok=t.TableStatus==='ACTIVE'&&t.DeletionProtectionEnabled===true&&(t.GlobalSecondaryIndexes||[]).every(g=>g.IndexStatus==='ACTIVE');if(ok)ready++;else check(`table:${d}`,false,{status:t.TableStatus,deletionProtection:t.DeletionProtectionEnabled})}catch(e){check(`table:${d}`,false,String(e?.stderr||e.message).slice(0,200))}}
check('m9TablesHealthy',ready===18,`${ready}/18 ACTIVE, deletion protected, indexes ACTIVE`);
let s3={configured:false,permissionsVerified:false};
const bucket=lambda?.Environment?.Variables?.SADHANA_LEARNER_MEDIA_BUCKET;
if(bucket){s3.configured=true;try{execFileSync('aws',['s3api','head-bucket','--bucket',bucket,'--profile',profile,'--region',region],{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']});s3.bucketAccessible=true}catch(e){s3.bucketAccessible=false}
 if(lambda.Role&&identity?.Account){try{const out=aws('iam','simulate-principal-policy','--policy-source-arn',lambda.Role,'--action-names','s3:GetObject','s3:PutObject','--resource-arns',`arn:aws:s3:::${bucket}/*`);s3.permissionsVerified=(out.EvaluationResults||[]).length===2&&(out.EvaluationResults||[]).every(r=>r.EvalDecision==='allowed');s3.decisions=(out.EvaluationResults||[]).map(r=>({action:r.EvalActionName,decision:r.EvalDecision}))}catch(e){s3.error=String(e?.stderr||e.message).slice(0,200)}}
}
check('mediaBucketConfigured',s3.configured,s3.configured?'Set on inspected Lambda':'Missing SADHANA_LEARNER_MEDIA_BUCKET on inspected Lambda');
check('mediaBucketAccess',s3.bucketAccessible===true,'S3 HeadBucket access (not a real upload)');
check('mediaObjectPolicy',s3.permissionsVerified===true,s3.decisions||s3.error||'Not checked');
const artifact='dist/lambda.mjs';let buildSha256=null;if(existsSync(artifact))buildSha256=createHash('sha256').update(readFileSync(artifact)).digest('hex');
check('localBuildArtifact',Boolean(buildSha256),buildSha256||'Run npm run check && npm run build first');
const decision={infrastructurePreflightPassed:checks.every(c=>c.passed),applicationE2EVerified:false,productionCutoverApproved:false};
const result={schema:1,readOnly:true,awsChangesMade:false,region,accountId:identity?.Account||null,lambdaName:fn,lambdaLastModified:lambda?.LastModified||null,localBuildSha256:buildSha256,checks,decision,pending:['isolatedM9Deployment','mediaUploadDownload','cognitoInvitationsOnM9','guardianPortalEndToEnd','raagaWebsiteE2E','srutiWebsiteE2E','learnerHomeworkEndToEnd','crossAcademyNegativeAuth','rollbackRehearsal','infrastructureIAMAsCode'],notice:'This checks configuration only. No AWS upload, mutation, migration or cutover performed.'};
writeFileSync(report,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({report,readOnly:true,infrastructurePreflightPassed:decision.infrastructurePreflightPassed,passed:checks.filter(x=>x.passed).length,failed:checks.filter(x=>!x.passed).map(x=>x.name),applicationE2EVerified:false,productionCutoverApproved:false},null,2));
