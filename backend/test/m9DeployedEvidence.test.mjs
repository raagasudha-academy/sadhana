import test from 'node:test';
import assert from 'node:assert/strict';
import {M9_TABLES,isProtected,pitrEnabled,evaluateIamSim,deniedWithoutCredentials,evidenceDecision} from '../scripts/m9DeploymentEvidenceCore.mjs';
test('18 approved M9 domains exist and have unique names',()=>{
 assert.equal(M9_TABLES.length,18);assert.equal(new Set(M9_TABLES).size,18);
});
test('a table requires deletion protection and active GSIs',()=>{
 assert.equal(isProtected({Table:{TableStatus:'ACTIVE',DeletionProtectionEnabled:true,GlobalSecondaryIndexes:[{IndexStatus:'ACTIVE'}]}}),true);
 assert.equal(isProtected({Table:{TableStatus:'ACTIVE',DeletionProtectionEnabled:false}}),false);
 assert.equal(isProtected({Table:{TableStatus:'ACTIVE',DeletionProtectionEnabled:true,GlobalSecondaryIndexes:[{IndexStatus:'CREATING'}]}}),false);
});
test('PITR is only verified when explicitly enabled',()=>{
 assert.equal(pitrEnabled({ContinuousBackupsDescription:{PointInTimeRecoveryDescription:{PointInTimeRecoveryStatus:'ENABLED'}}}),true);
 assert.equal(pitrEnabled({ContinuousBackupsDescription:{PointInTimeRecoveryDescription:{PointInTimeRecoveryStatus:'DISABLED'}}}),false);
});
test('IAM simulation fails closed for missing or denied action',()=>{
 assert.equal(evaluateIamSim({EvaluationResults:[{EvalActionName:'dynamodb:GetItem',EvalDecision:'allowed'}]},['dynamodb:GetItem','dynamodb:PutItem']).complete,false);
 assert.equal(evaluateIamSim({EvaluationResults:[{EvalActionName:'dynamodb:GetItem',EvalDecision:'implicitDeny'}]},['dynamodb:GetItem']).complete,false);
 assert.equal(evaluateIamSim({EvaluationResults:[{EvalActionName:'dynamodb:GetItem',EvalDecision:'allowed'}]},['dynamodb:GetItem']).complete,true);
});
test('negative auth requires two explicit 401/403 responses',()=>{
 assert.equal(deniedWithoutCredentials([401,403]),true);
 assert.equal(deniedWithoutCredentials([200,403]),false);
 assert.equal(deniedWithoutCredentials(['REQUEST_ERROR:TimeoutError',403]),false);
});
test('read-only evidence can never approve cutover by itself',()=>{
 const tables=M9_TABLES.map(domain=>({domain,activeProtected:true,pitrEnabled:true}));
 assert.equal(evidenceDecision({tables,identity:{roleArn:'arn:example'},iam:{complete:true},anonymous:{passed:true}}).fullCutoverReady,false);
});
