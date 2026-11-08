/** Pure helpers for fail-closed M9 deployment-security evidence. */
export const M9_DOMAINS=Object.freeze(['institutions','people','families','family-links','classes','venues','enrolments','sessions','attendance','practice','homework','submissions','events','rsvps','registrations','notifications','audit','counters']);
export const M9_TABLE_ACTIONS=Object.freeze(['dynamodb:DescribeTable','dynamodb:GetItem','dynamodb:BatchGetItem','dynamodb:Query','dynamodb:Scan','dynamodb:PutItem','dynamodb:UpdateItem','dynamodb:ConditionCheckItem','dynamodb:DeleteItem','dynamodb:BatchWriteItem']);
export const M9_INDEX_ACTIONS=Object.freeze(['dynamodb:Query','dynamodb:Scan']);
export const M9_E2E_BLOCKERS=Object.freeze(['cognitoInvitationsOnM9','guardianPortalEndToEnd','websiteBothAcademies','allLearningEndpointsOnM9','rollbackExercised','crossInstitutionNegativeAuthDeployed']);
export function targetArns({region,account,environment='dev'}={}){
 if(!/^\d{12}$/.test(account??'')||!/^[-a-z0-9]+$/.test(region??'')||!/^[-a-z0-9]+$/.test(environment))throw Error('Invalid AWS scope');
 return M9_DOMAINS.map(d=>({domain:d,table:`arn:aws:dynamodb:${region}:${account}:table/sadhana-${environment}-m9-${d}`,index:`arn:aws:dynamodb:${region}:${account}:table/sadhana-${environment}-m9-${d}/index/*`}));
}
export function simulateDecision(response,action,resource){
 const results=response?.EvaluationResults;
 if(!Array.isArray(results)||results.length!==1) return {passed:false,error:'AMBIGUOUS_RESULT'};
 const result=results[0];
 if(result.EvalActionName!==action||result.EvalResourceName!==resource) return {passed:false,error:'WRONG_ACTION_OR_RESOURCE'};
 return {passed:result.EvalDecision==='allowed',decision:result.EvalDecision||'unknown',missingContext:result.MissingContextValues??[]};
}
/** Current IAM simulator format: one EvaluationResult per action, and a
 * ResourceSpecificResults entry for each requested ARN. Do not look for table
 * ARNs in the top-level EvalResourceName, which may be a template or "*". */
export function simulateResourceDecision(response,action,resource){
 const top=(response?.EvaluationResults??[]).filter(x=>x.EvalActionName===action);
 if(top.length!==1)return {passed:false,error:top.length===0?'MISSING_ACTION_RESULT':'AMBIGUOUS_ACTION_RESULT'};
 const entries=top[0].ResourceSpecificResults;
 if(!Array.isArray(entries))return {passed:false,error:'MISSING_RESOURCE_SPECIFIC_RESULTS'};
 const matches=entries.filter(x=>x.EvalResourceName===resource);
 if(matches.length!==1)return {passed:false,error:matches.length===0?'MISSING_RESOURCE_RESULT':'DUPLICATE_RESOURCE_RESULT'};
 const item=matches[0];
 return {passed:item.EvalResourceDecision==='allowed',decision:item.EvalResourceDecision??'unknown',missingContext:item.MissingContextValues??[]};
}
export function authSmokePassed(statuses){
 return Array.isArray(statuses)&&statuses.length===2&&statuses.every(x=>x===401||x===403);
}
export function securityDecision({scans=[],apiProbe=null,iamError=null,tableCount=0}={}){
 const failed=scans.filter(x=>!x.passed);
 const iamVerified=tableCount===18&&!iamError&&scans.length>0&&failed.length===0;
 const anonymousVerified=authSmokePassed(apiProbe?.statuses);
 return {iamVerified,anonymousVerified,cutoverReady:false,failedSimulations:failed.length,reason:'Security smoke tests do not establish Cognito provisioning, guardian revocation, website intake, learning mutations, or rollback.'};
}
