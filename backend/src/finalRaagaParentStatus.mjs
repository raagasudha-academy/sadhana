/** Safe canonical registration -> existing parent-access widget projection.
 * An account link is NOT independent guardian-child access approval.
 * No names, emails, Cognito subjects or legacy PK/SK data leave this function.
 */
import {markerId} from './websiteImportCore.mjs';
const error=(status,message)=>{throw Object.assign(new Error(message),{status});};
const externalId=v=>typeof v==='string' && /^RS-[A-Za-z0-9_-]{1,110}$/.test(v);
export function finalRaagaParentStatusProjection(id,record){
 if(!externalId(id))error(400,'Invalid Raagasudha registration reference.');
 if(!record)error(404,'Canonical registration marker not found. Reconcile the import before enabling final reads.');
 if(record.registrationId!==markerId('raaga',id)||record.institutionId!=='raaga'||
    record.externalRegistrationId!==id||record.source!=='website')
   error(409,'Registration identity mismatch. Reconciliation required.');
 if(record.importStatus!=='imported'||typeof record.familyId!=='string'||!record.familyId||
    !Array.isArray(record.studentIds)||record.studentIds.length<1||
    !record.studentIds.every(s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,150}$/.test(s))||
    new Set(record.studentIds).size!==record.studentIds.length)
   error(409,'Registration import is not complete or identity mapping is incomplete.');
 // Do not expose ACTIVE based on a provisioning status alone. Guardian access
 // must be evaluated separately against independently approved family links.
 const states={
  EXISTING_ACCOUNT_LINKED:'ACCOUNT_FOUND',
  EXISTING_ACCOUNT_REVIEW_REQUIRED:'NEEDS_VERIFICATION',
  NOT_INVITED:'NOT_INVITED',
  NEEDS_VERIFICATION:'NEEDS_VERIFICATION',
  ACCOUNT_FOUND:'ACCOUNT_FOUND',
  INVITATION_SENT:'INVITATION_SENT',
  ACTIVE:'ACCOUNT_FOUND',
 };
 const raw=record.provisioningStatus;
 const status=typeof raw==='string'&&Object.hasOwn(states,raw)?states[raw]:'NEEDS_VERIFICATION';
 return {
  registrationId:id,
  imported:true,
  status,
  // No dedicated provisioning timestamp exists in the current canonical model.
  updatedAt:typeof record.provisioningUpdatedAt==='string'?record.provisioningUpdatedAt:null,
 };
}
