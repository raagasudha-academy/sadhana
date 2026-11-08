/** Fail-closed evaluation of read-only parity reports and externally executed E2E evidence.
 * This module cannot itself prove an external test really ran. For that reason,
 * attestations are only displayed; they NEVER activate full cutover readiness.
 */
export const REQUIRED_PARITY = Object.freeze([
 'raaga.schedule','sruti.schedule','shared.schedule','raaga.events','sruti.events',
 'raaga.teachers','sruti.teachers','raaga.venues','sruti.venues',
 'raaga.teacherMe','sruti.teacherMe',
]);
export const DEPLOYED_CHECKS = Object.freeze([
 'cognitoInvitationsOnM9','guardianPortalEndToEnd','websiteBothAcademies',
 'allLearningEndpointsOnM9','calendarWriteIamVerified','fullApiIamVerified',
 'rollbackExercised','negativeAuthTestsDeployed',
]);
export function validParityReport(report,{now=Date.now(),maxAgeMs=15*60_000}={}){
 if(!report||report.schema!==1||report.readOnly!==true||report.target!=='sadhana-dev-m9'||report.region!=='us-east-1')return false;
 const at=Date.parse(report.verifiedAt);
 if(!Number.isFinite(at)||at>now+60_000||now-at>maxAgeMs)return false;
 return REQUIRED_PARITY.every(key=>report.parity?.[key]?.same===true &&
  Number.isInteger(report.parity[key].legacyCount) &&
  Number.isInteger(report.parity[key].m9Count) &&
  report.parity[key].legacyCount===report.parity[key].m9Count &&
  typeof report.parity[key].legacyDigest==='string' &&
  report.parity[key].legacyDigest===report.parity[key].m9Digest);
}
export function readinessChecks({seededInstitutions=[],counts={},parityReport=null,evidence=[]}={}){
 const parity=validParityReport(parityReport);
 const checks={
  institutionsSeeded:seededInstitutions.includes('raaga')&&seededInstitutions.includes('sruti'),
  operationalCounts:counts.classes===22&&counts.sessions===423&&counts.events===6&&counts.venues===3&&counts.people>=7,
  scheduleReadParity:parity && ['raaga.schedule','sruti.schedule','shared.schedule','raaga.events','sruti.events'].every(k=>parityReport.parity[k].same),
  teacherVenueLiveParity:parity && ['raaga.teachers','sruti.teachers','raaga.venues','sruti.venues','raaga.teacherMe','sruti.teacherMe'].every(k=>parityReport.parity[k].same),
 };
 // Do not turn user-supplied assertions into independent production proof.
 for(const name of DEPLOYED_CHECKS)checks[name]=false;
 const received=Array.isArray(evidence)?evidence.filter(x=>DEPLOYED_CHECKS.includes(x?.check)&&x?.result==='pass'):[];
 return {checks,parityEvidenceAccepted:parity,reportedDeployedEvidence:received.map(x=>({check:x.check,artifact:x.artifact??null})),
  requiredDeployedEvidence:DEPLOYED_CHECKS.filter(k=>!received.some(x=>x.check===k)),
  note:'External test claims are informational only. Deployed E2E, IAM and rollback must be independently witnessed before changing fullCutoverReady.'};
}
