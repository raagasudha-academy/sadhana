/** Source-only M9 readiness inventory. No AWS access, no deployment, no writes. */
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=(relative)=>readFileSync(resolve(root,relative),'utf8');
export function auditM9Source(read=source){
 const lambda=read('src/lambda.ts');
 const learning=read('src/routes/learningRoutes.ts');
 const guardian=read('src/routes/m95GuardianRegistrationRoutes.ts');
 const learner=read('src/routes/m9FinalLearnerRoutes.ts');
 const fence=read('src/m9CutoverFence.mjs');
 const homework=read('src/routes/m9HomeworkRoutes.ts');
 const statuses={
  m9LearnerDashboardRouteWired:lambda.includes('m9FinalLearnerRoutes(routeContext)')&&learner.includes('m9FinalLearner().dashboard'),
  m9LearnerWriteRoutesWired:lambda.includes('m9FinalLearnerRoutes(routeContext)')&&learner.includes('m9LearnerWrites().savePractice'),
  m9HomeworkWriteRoutesWired:lambda.includes('m9HomeworkRoutes(routeContext)')&&homework.includes('m9Homework()'),
  m9HomeworkMediaWriteRoutesWired:false,
  m9GuardianAndOnboardingRouteWired:lambda.includes('m95GuardianRegistrationRoutes(routeContext)')&&guardian.includes("parts[0]!=='m9-onboarding'"),
  bothWebsitesDeployedAndTested:false,
  cognitoInvitationsDeployedAndTested:false,
  crossInstitutionNegativeAuthDeployed:false,
  rollbackExercised:false,
  strictLegacyLearnerFenceAvailable:lambda.includes('m9CutoverFence(parts,method')&&fence.includes('M9_STRICT_DATA_FENCE'),
  legacyLearnerWritesStillPresent:learning.includes('saveLearnerPractice')&&learning.includes('saveHomeworkSubmission'),
 };
 const blockers=[
  !statuses.m9LearnerWriteRoutesWired&&'M9_LEARNER_WRITES_NOT_IMPLEMENTED',
  !statuses.m9HomeworkWriteRoutesWired&&'M9_HOMEWORK_WRITES_NOT_IMPLEMENTED',
  !statuses.m9HomeworkMediaWriteRoutesWired&&'M9_HOMEWORK_MEDIA_NOT_IMPLEMENTED',
  statuses.legacyLearnerWritesStillPresent&&'LEGACY_LEARNER_WRITE_ROUTES_PRESENT',
  !statuses.bothWebsitesDeployedAndTested&&'BOTH_WEBSITES_NOT_E2E_VERIFIED',
  !statuses.cognitoInvitationsDeployedAndTested&&'COGNITO_INVITATIONS_NOT_E2E_VERIFIED',
  !statuses.crossInstitutionNegativeAuthDeployed&&'CROSS_INSTITUTION_NEGATIVE_AUTH_NOT_VERIFIED',
  !statuses.rollbackExercised&&'ROLLBACK_NOT_EXERCISED',
 ].filter(Boolean);
 return {schema:1,mode:'source-only',readOnly:true,deployPerformed:false,fullCutoverReady:false,statuses,blockers};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=auditM9Source();
 const i=process.argv.indexOf('--report');
 if(i>=0){if(!process.argv[i+1])throw Error('Missing --report path');writeFileSync(resolve(process.argv[i+1]),JSON.stringify(result,null,2)+'\n');}
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
