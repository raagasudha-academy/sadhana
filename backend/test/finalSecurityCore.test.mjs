import test from 'node:test';
import assert from 'node:assert/strict';
import {M9_DOMAINS,targetArns,simulateDecision,simulateResourceDecision,authSmokePassed,securityDecision,M9_TABLE_ACTIONS} from '../scripts/finalSecurityCore.mjs';
test('all 18 intended table ARNs and index scopes are well-formed',()=>{
 const all=targetArns({region:'us-east-1',account:'627821644317'});
 assert.equal(all.length,18);assert.equal(new Set(all.map(x=>x.table)).size,18);
 assert.ok(all.every(x=>x.table.startsWith('arn:aws:dynamodb:us-east-1:627821644317:table/sadhana-dev-m9-')));
 assert.ok(all.every(x=>x.index.endsWith('/index/*')));
});
test('every domain in final schema is present',()=>assert.deepEqual([...M9_DOMAINS].sort(),['institutions','people','families','family-links','classes','venues','enrolments','sessions','attendance','practice','homework','submissions','events','rsvps','registrations','notifications','audit','counters'].sort()));
test('table checks include DynamoDB transaction condition checks',()=>assert.ok(M9_TABLE_ACTIONS.includes('dynamodb:ConditionCheckItem')));
test('simulation fails closed when action or resource is not exact',()=>{
 const out={EvaluationResults:[{EvalActionName:'dynamodb:GetItem',EvalResourceName:'arn:example',EvalDecision:'allowed'}]};
 assert.equal(simulateDecision(out,'dynamodb:GetItem','arn:example').passed,true);
 assert.equal(simulateDecision(out,'dynamodb:Query','arn:example').passed,false);
 assert.equal(simulateDecision(out,'dynamodb:GetItem','arn:other').passed,false);
});
test('simulation rejects missing, denied and ambiguous responses',()=>{
 assert.equal(simulateDecision({},'a','r').passed,false);
 assert.equal(simulateDecision({EvaluationResults:[{EvalActionName:'a',EvalResourceName:'r',EvalDecision:'implicitDeny'}]},'a','r').passed,false);
 assert.equal(simulateDecision({EvaluationResults:[{},{}]},'a','r').passed,false);
});
test('invalid token and anonymous requests must both fail with 401/403',()=>{
 assert.equal(authSmokePassed([401,403]),true);
 for(const statuses of [[200,401],[302,401],[500,401],[401],[401,'REQUEST_ERROR:TimeoutError']])assert.equal(authSmokePassed(statuses),false);
});
test('cutover remains blocked even if IAM and anonymous smoke tests pass',()=>{
 const r=securityDecision({scans:[{passed:true}],tableCount:18,apiProbe:{statuses:[401,403]}});
 assert.equal(r.iamVerified,true);assert.equal(r.anonymousVerified,true);assert.equal(r.cutoverReady,false);
});
test('any IAM denial blocks verification',()=>{
 assert.equal(securityDecision({scans:[{passed:true},{passed:false}],tableCount:18}).iamVerified,false);
 assert.equal(securityDecision({scans:[{passed:true}],tableCount:17}).iamVerified,false);
});

test('IAM simulator resource-specific results are used for every table',()=>{
 const action='dynamodb:GetItem',a='arn:aws:dynamodb:us-east-1:123456789012:table/a',b='arn:aws:dynamodb:us-east-1:123456789012:table/b';
 const response={EvaluationResults:[{EvalActionName:action,EvalResourceName:'*',EvalDecision:'implicitDeny',ResourceSpecificResults:[
  {EvalResourceName:a,EvalResourceDecision:'allowed'},
  {EvalResourceName:b,EvalResourceDecision:'implicitDeny',MissingContextValues:['aws:TagKeys']}
 ]}]};
 assert.deepEqual(simulateResourceDecision(response,action,a),{passed:true,decision:'allowed',missingContext:[]});
 assert.equal(simulateResourceDecision(response,action,b).passed,false);
 assert.equal(simulateResourceDecision(response,action,'missing').error,'MISSING_RESOURCE_RESULT');
 assert.equal(simulateResourceDecision(response,'dynamodb:PutItem',a).error,'MISSING_ACTION_RESULT');
});
test('fail closed when AWS omits or duplicates per-resource results',()=>{
 const action='dynamodb:Query',arn='arn:example';
 assert.equal(simulateResourceDecision({EvaluationResults:[{EvalActionName:action,EvalDecision:'allowed'}]},action,arn).passed,false);
 assert.equal(simulateResourceDecision({EvaluationResults:[{EvalActionName:action,ResourceSpecificResults:[{EvalResourceName:arn,EvalResourceDecision:'allowed'},{EvalResourceName:arn,EvalResourceDecision:'allowed'}]}]},action,arn).error,'DUPLICATE_RESOURCE_RESULT');
});
