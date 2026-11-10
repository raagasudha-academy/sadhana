/** Pure M9.5 cutover decision: never flips feature flags or writes to AWS. */
export const EXPECTED_M95={classes:22,sessions:423,events:6,venues:3,people:7};
export const REQUIRED_PARITY=['raaga.schedule','sruti.schedule','shared.schedule','raaga.events','sruti.events'];
export function evaluateM95Cutover({transfer,parity,tableStatuses,workflowCoverage}={}) {
 const blockers=[];
 if(!transfer||transfer.readyForExecute!==true||transfer.selectedRecords!==461||transfer.plannedNewWrites!==0||transfer.referenceBlockers!==0||transfer.timeResolutionIssues!==0)blockers.push('TRANSFER_RECONCILIATION_NOT_CLEAN');
 for(const [entity,count] of Object.entries(EXPECTED_M95)) {
  const actual=transfer?.destinationCounts?.[`sadhana-dev-m9-${entity}`];
  if(actual!==count)blockers.push(`TARGET_COUNT_${entity.toUpperCase()}`);
  if(tableStatuses?.[`sadhana-dev-m9-${entity}`]!=='ACTIVE')blockers.push(`TABLE_NOT_ACTIVE_${entity.toUpperCase()}`);
 }
 const mismatches=[];
 for(const key of REQUIRED_PARITY){
  const info=parity?.[key];
  if(!info||info.same!==true){blockers.push(`PARITY_${key.replaceAll('.','_').toUpperCase()}`);mismatches.push(key);}
 }
 if(!workflowCoverage?.teacherDirectory)blockers.push('TEACHER_DIRECTORY_API_NOT_CUT_OVER');
 if(!workflowCoverage?.venueDirectory)blockers.push('VENUE_DIRECTORY_API_NOT_CUT_OVER');
 if(!workflowCoverage?.classMutations)blockers.push('CLASS_WRITE_WORKFLOW_NOT_CUT_OVER');
 if(!workflowCoverage?.calendarMutations)blockers.push('CALENDAR_WRITE_WORKFLOW_NOT_CUT_OVER');
 if(!workflowCoverage?.guardianAndRegistration)blockers.push('GUARDIAN_REGISTRATION_NOT_CUT_OVER');
 if(!workflowCoverage?.studentAndLearning)blockers.push('STUDENT_LEARNING_NOT_CUT_OVER');
 if(!workflowCoverage?.iamAndRollback)blockers.push('IAM_AND_ROLLBACK_NOT_PROVEN');
 return {milestone:'M9.5',readOnly:true,canExecute:false,operationalReadPilotEligible:mismatches.length===0&&Boolean(transfer?.readyForExecute)&&transfer?.plannedNewWrites===0,fullCutoverReady:blockers.length===0,blockerCount:blockers.length,blockers};
}
