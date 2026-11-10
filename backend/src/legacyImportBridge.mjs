/** Pure validation and conversion of an ALREADY IMPORTED legacy website registration.
 * This must never rewrite the website's existing import mapping or implicitly approve access.
 */
import {prepareWebsiteImport} from './websiteImportCore.mjs';

const fail=(message)=>{throw Object.assign(new Error(message),{status:409});};
const validId=(v)=>typeof v==='string' && /^[A-Za-z0-9_-]{1,180}$/.test(v);

export function prepareLegacyImportBridge(remote,institution,actorSub,counters,now){
 if(institution!=='raaga')fail('Only the verified Raagasudha website source is supported.');
 // The independently verified Raagasudha website stores its institution as RAAGASUDHA.
 // Accept only that source value or the canonical internal raaga identifier.
 if(!remote || !['RAAGASUDHA','raaga'].includes(remote.institution) || remote.reviewStatus!=='approved')fail('Approved source registration required.');
 const legacy=remote.sadhanaImport;
 if(legacy?.status!=='imported'||!validId(legacy.familyId))fail('Source has no verified prior import mapping.');
 const students=remote.students;
 if(!Array.isArray(students)||!students.length)fail('Source students are missing.');
 const mapping=legacy.studentIds;
 if(!mapping||typeof mapping!=='object'||Array.isArray(mapping))fail('Legacy student mapping is missing.');
 const ids=students.map(s=>s?.personId);
 if(ids.some(id=>!validId(id))||new Set(ids).size!==ids.length)fail('Invalid source student identities.');
 if(Object.keys(mapping).length!==ids.length||ids.some(id=>!validId(mapping[id])))fail('Legacy student mapping disagrees with source people.');
 if(new Set(Object.values(mapping)).size!==ids.length)fail('Duplicate legacy student identifiers.');
 // Only strip the *prior-import marker* for the existing side-effect-free planner.
 // All person/contact/student validation, counter guards and independent approval
 // requirements remain in force.
 const plan=prepareWebsiteImport({...remote,institution:'raaga',sadhanaImport:undefined},institution,actorSub,counters,now);
 // The legacy bridge is a reconciliation workflow, not a fresh import. Keep
 // its links pending so the new-registration policy cannot approve old mappings.
 const legacyLinks=plan.items.filter(x=>x.table==='family-links');
 for(const {item} of legacyLinks){
  item.relationship='unverified';item.accessStatus='pending';item.relationshipVerified=false;
  delete item.verificationSource;delete item.evidenceReference;delete item.reviewedBy;delete item.reviewedAt;
 }
 plan.verifiedGuardianLinks=0;
 plan.pendingGuardianLinks=legacyLinks.length;
 const record=plan.items.find(x=>x.table==='registrations')?.item;
 if(!record)fail('Registration planner produced no registration marker.');
 record.websiteSyncStatus='legacy-authoritative';
 record.provisioningStatus='EXISTING_ACCOUNT_REVIEW_REQUIRED';
 record.legacyFamilyId=legacy.familyId;
 record.legacyStudentIds=Object.fromEntries(ids.map(id=>[id,mapping[id]]));
 record.bridgeOrigin='approved-legacy-website-import';
 record.identityResolutionStatus='pending_guardian_verification';
 return {...plan,legacyFamilyId:legacy.familyId,legacyStudentIds:record.legacyStudentIds,bridgeOrigin:record.bridgeOrigin};
}
