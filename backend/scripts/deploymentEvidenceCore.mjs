/** Pure evidence evaluators. No part of this module grants cutover readiness. */
export const M9_TABLES = Object.freeze([
  'institutions','people','families','family-links','classes','venues',
  'enrolments','sessions','attendance','practice','homework','submissions',
  'events','rsvps','registrations','notifications','audit','counters'
]);
export const REQUIRED_ACTIONS = Object.freeze([
  'dynamodb:DescribeTable','dynamodb:GetItem','dynamodb:Query',
  'dynamodb:Scan','dynamodb:PutItem','dynamodb:UpdateItem',
  'dynamodb:TransactWriteItems'
]);
export const isProtected = status => status?.Table?.TableStatus === 'ACTIVE'
  && status.Table.DeletionProtectionEnabled === true
  && (status.Table.GlobalSecondaryIndexes || []).every(i=>i.IndexStatus==='ACTIVE');
export const pitrEnabled = data => data?.ContinuousBackupsDescription?.PointInTimeRecoveryDescription?.PointInTimeRecoveryStatus === 'ENABLED';
export function evaluateIamSim(simulation, actions=REQUIRED_ACTIONS){
  const records=simulation?.EvaluationResults||[];
  const results=Object.fromEntries(actions.map(a=>[a,{checked:0,allowed:0,denied:0}]));
  for(const rec of records){
    const key=rec.EvalActionName;
    if(!(key in results))continue;
    results[key].checked++;
    if(rec.EvalDecision==='allowed')results[key].allowed++;
    else results[key].denied++;
  }
  const complete=actions.every(a=>results[a].checked>0&&results[a].denied===0);
  return {complete,actions:results,caveat:'IAM simulation does not prove deployed code behavior, SCP permissions or real write authorization.'};
}
export const deniedWithoutCredentials = codes => codes.length===2&&codes.every(c=>c===401||c===403);
export function evidenceDecision({tables=[],identity=null,iam=null,anonymous=null}={}){
  return {
    infrastructureObserved:tables.length===18&&tables.every(t=>t.activeProtected),
    pitrObserved:tables.length===18&&tables.every(t=>t.pitrEnabled),
    lambdaIdentityObserved:Boolean(identity?.roleArn),
    iamSimulationObserved:Boolean(iam?.complete),
    negativeAuthSmokeObserved:Boolean(anonymous?.passed),
    fullCutoverReady:false,
    reason:'This report is evidence only; it does not verify Cognito invitation, guardian, website, learning, rollback or all deployed authorisation paths.'
  };
}
