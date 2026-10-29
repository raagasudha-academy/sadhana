import {useCallback,useEffect,useState} from 'react';
import {RefreshCw,Search,Inbox,Image as ImageIcon,ShieldCheck,ChevronRight} from 'lucide-react';
import type {CloudSession} from './CloudAuth';
import './websiteRegistrations.css';

type Person={personId:string;fullName?:string;dateOfBirth?:string;email?:string;phone?:string;address?:Record<string,string>;roles?:string[]};
type Student={personId:string;studentType?:string;preferredLocationId?:string;preferredClassId?:string;classEnrolmentRequested?:boolean;proposedStartDate?:string;contactPreferences?:Record<string,string>;foodAllergies?:{status?:string;allergens?:string[];otherAllergens?:string;reactionDetails?:string;emergencyInstructions?:string;carriesEmergencyMedication?:boolean};photo?:unknown};
type Registration={registrationId:string;submittedAt?:string;reviewStatus?:string;status?:string;registrationType?:string;preferredLocationId?:string;people?:Person[];students?:Student[];primaryContactPersonId?:string;relationships?:Array<{guardianPersonId:string;studentPersonId:string;verificationStatus?:string}>;sadhanaImport?:{status?:string};};
const findRows=(data:unknown):Registration[]=>{
  if(Array.isArray(data))return data as Registration[];
  if(data&&typeof data==='object'){
    const o=data as Record<string,unknown>;
    for(const key of ['registrations','records','items','results','data']){
      if(Array.isArray(o[key]))return o[key] as Registration[];
      if(o[key]&&typeof o[key]==='object'){
        const nested=findRows(o[key]);if(nested.length)return nested;
      }
    }
  }
  return [];
};
const extractRegistration=(data:unknown):Registration=>{
  if(data&&typeof data==='object'){
    const o=data as Record<string,unknown>;
    for(const key of ['registration','record','item','data'])if(o[key]&&typeof o[key]==='object'&&!Array.isArray(o[key]))return o[key] as Registration;
  }
  return data as Registration;
};
const date=(v?:string)=>v?new Date(v).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'—';
const text=(v?:string)=>v?.trim()||'Not supplied';
/** Extract a short-lived HTTPS photo URL from a backend response without logging it. */
function extractPhotoUrl(value: unknown): string {
  const keys = ['url', 'photoUrl', 'presignedUrl', 'downloadUrl', 'signedUrl'];
  const wrappers = ['data', 'photo', 'body', 'result'];
  let current: unknown = value;
  for (let depth = 0; depth < 5; depth++) {
    if (typeof current === 'string') {
      const trimmed = current.trim();
      if (trimmed.startsWith('https://')) return trimmed;
      try { current = JSON.parse(trimmed) as unknown; continue; }
      catch { return ''; }
    }
    if (!current || typeof current !== 'object' || Array.isArray(current)) return '';
    const record = current as Record<string, unknown>;
    for (const key of keys) {
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate.startsWith('https://')) return candidate;
    }
    const nested = wrappers.map(key => record[key]).find(v => v != null);
    if (nested == null) return '';
    current = nested;
  }
  return '';
}

function Photo({cloud,registrationId,personId}:{cloud:CloudSession;registrationId:string;personId:string}){
  const [url,setUrl]=useState('');
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  // Resolve the short-lived private photo URL only when requested.
  const load=async()=>{
    setLoading(true);setError('');
    try {
      const response:unknown=await cloud.api.websiteRegistrationPhoto(registrationId,personId);
      const candidate=extractPhotoUrl(response);
      if (!candidate) throw new Error('Photo service returned no usable URL.');
      const parsed=new URL(candidate);
      if(parsed.protocol!=='https:')throw new Error('Photograph URL must use HTTPS.');
      setUrl(parsed.href);
    } catch(e) {
      setError(e instanceof Error?e.message:'Could not load photograph.');
    } finally {setLoading(false);}
  };
  return <div className="wr-photo">{url?<img src={url} alt="Student submitted photograph" referrerPolicy="no-referrer" onError={()=>{setUrl('');setError('Unable to display photograph. Please try again.');}}/>:<button type="button" onClick={()=>void load()} disabled={loading}><ImageIcon size={15}/>{loading?'Loading…':'View photo'}</button>}{error&&<small role="alert">{error}</small>}</div>;
}
export default function WebsiteRegistrations({cloud}:{cloud:CloudSession}){
  const [filter,setFilter]=useState('pending');const [search,setSearch]=useState('');const [items,setItems]=useState<Registration[]>([]);
  const [selected,setSelected]=useState<string|null>(null);const [detail,setDetail]=useState<Registration|null>(null);
  const [reviewBusy,setReviewBusy]=useState(false);const [reviewError,setReviewError]=useState('');
  const [confirmReview,setConfirmReview]=useState<null|'approved'|'discarded'>(null);
  const [confirmImport,setConfirmImport]=useState(false);
  const [familyMatch,setFamilyMatch]=useState<{familyId:string;familyNumber:string;parentName:string;phone:string}|null>(null);
  const [correctedName,setCorrectedName]=useState('');
  const [correctionConfirmed,setCorrectionConfirmed]=useState(false);
  const [revokePreview,setRevokePreview]=useState<{registrationId:string;canRevoke:boolean;familyId:string|null;students:Array<{id:string;name:string|null;rollNumber:string|null;owned:boolean}>;blockers:string[];examinedRecords:number}|null>(null);
  const [revokeError,setRevokeError]=useState('');
  const [revokeConfirm,setRevokeConfirm]=useState(false);
  const [revokePhrase,setRevokePhrase]=useState('');
  const [revokeBusy,setRevokeBusy]=useState(false);
  const [revokeOutcome,setRevokeOutcome]=useState<''|'completed'|'pending'>('');
  const [parentAccess,setParentAccess]=useState<{registrationId:string;imported:boolean;status:string;updatedAt:string|null}|null>(null);
  const [accessBusy,setAccessBusy]=useState(false);const [accessError,setAccessError]=useState('');
  const [importBusy,setImportBusy]=useState(false);
  const [importResult,setImportResult]=useState<{familyId:string;studentRollNumbers:Record<string,string>;websiteSynced:boolean;warning?:string}|null>(null);
  const [busy,setBusy]=useState(false);const [detailBusy,setDetailBusy]=useState(false);const [error,setError]=useState('');const [detailError,setDetailError]=useState('');
  const load=useCallback(async()=>{setBusy(true);setError('');try{const response=await cloud.api.listWebsiteRegistrations(filter==='all'?{}:{status:filter});setItems(findRows(response));}catch(e){setError(e instanceof Error?e.message:'Unable to load registrations.');setItems([]);}finally{setBusy(false);}},[cloud.api,filter]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{let alive=true;if(!selected){setDetail(null);return;}setDetail(null);setDetailBusy(true);setDetailError('');
    cloud.api.getWebsiteRegistration(selected).then(raw=>{if(alive)setDetail(extractRegistration(raw));}).catch(e=>{if(alive)setDetailError(e instanceof Error?e.message:'Unable to open registration.');}).finally(()=>{if(alive)setDetailBusy(false);});
    return()=>{alive=false;};},[selected,cloud.api]);
  // v11.2: read access state independently; never blocks registration review/import.
  useEffect(()=>{let active=true;setParentAccess(null);setAccessError('');if(!selected)return;
    cloud.api.getParentAccessStatus(selected).then(x=>{if(active)setParentAccess(x);}).catch(()=>{if(active)setAccessError('Access status unavailable; registration remains unaffected.');});
    return()=>{active=false;};},[selected,cloud.api]);
  const refreshParentAccess=async(id:string)=>{setAccessBusy(true);setAccessError('');try{setParentAccess(await cloud.api.getParentAccessStatus(id));}catch(e){setAccessError(e instanceof Error?e.message:'Unable to refresh access status.');}finally{setAccessBusy(false);}};
  const retryParentAccess=async(id:string)=>{setAccessBusy(true);setAccessError('');try{const result=await cloud.api.retryParentProvisioning(id);await refreshParentAccess(id);if(result.disabled)setAccessError('Parent provisioning is disabled in Lambda configuration. No invitation was sent.');else if(result.reason)setAccessError(result.reason);else if(result.status==='NEEDS_VERIFICATION')setAccessError('Manual identity verification is required before linking this parent.');}catch(e){setAccessError(e instanceof Error?e.message:'Could not request parent access.');}finally{setAccessBusy(false);}};
  const shown=items.filter(r=>[r.registrationId,r.preferredLocationId,...(r.people||[]).map(p=>p.fullName||'')].join(' ').toLowerCase().includes(search.toLowerCase()));
  const review=async(status:'approved'|'discarded')=>{
    if(!detail||reviewBusy)return;
    setConfirmReview(null);
    setReviewBusy(true);setReviewError('');
    try{
      await cloud.api.reviewWebsiteRegistration(detail.registrationId,status);
      const fresh=await cloud.api.getWebsiteRegistration(detail.registrationId);
      setDetail(extractRegistration(fresh));
      await load();
    }catch(e){setReviewError(e instanceof Error?e.message:'Unable to change review status.');}
    finally{setReviewBusy(false);}
  };
  const correctedIdentity = () => {
    if (!detail) return undefined;
    const students = detail.students||[];
    const people = detail.people||[];
    const seen = new Map<string,string>();
    for (const student of students) {
      const person = people.find(p=>p.personId===student.personId);
      const key = `${(person?.fullName||'').trim().toLocaleLowerCase('en-GB')}|${person?.dateOfBirth||''}`;
      if (seen.has(key) && person) {
        if (!correctionConfirmed || !correctedName.trim()) return undefined;
        return {personId:student.personId, originalName:person.fullName||'', correctedName:correctedName.trim()};
      }
      seen.set(key,student.personId);
    }
    return undefined;
  };
  const duplicateSourcePerson = (() => {
    const seen = new Set<string>();
    for (const student of detail?.students||[]) {
      const person = (detail?.people||[]).find(p=>p.personId===student.personId);
      const key = `${(person?.fullName||'').trim().toLocaleLowerCase('en-GB')}|${person?.dateOfBirth||''}`;
      if (seen.has(key)) return person;
      seen.add(key);
    }
    return null;
  })();
  const importApplication=async(linkFamilyId?:string)=>{
    if(!detail||importBusy)return;setConfirmImport(false);setImportBusy(true);setReviewError('');
    try{const outcome=await cloud.api.importWebsiteRegistration(detail.registrationId,{linkFamilyId,identityCorrection:correctedIdentity()});if(!outcome.studentRollNumbers)throw new Error('Activation did not return student records.');setFamilyMatch(null);setImportResult({familyId:outcome.familyId||'',studentRollNumbers:outcome.studentRollNumbers,websiteSynced:Boolean(outcome.websiteSynced),warning:outcome.warning});const fresh=await cloud.api.getWebsiteRegistration(detail.registrationId);setDetail(extractRegistration(fresh));await load();}
    catch(e){setReviewError(e instanceof Error?e.message:'Import failed.');}
    finally{setImportBusy(false);}
  };
  const previewImport=async()=>{
    if(!detail||importBusy)return;setConfirmImport(false);setImportBusy(true);setReviewError('');
    try{const response=await cloud.api.importWebsiteRegistration(detail.registrationId,{preview:true,identityCorrection:correctedIdentity()});
      if(response.requiresFamilyConfirmation&&response.candidate){setFamilyMatch(response.candidate);}
      else {setFamilyMatch(null);setConfirmImport(true);}
    }catch(e){setReviewError(e instanceof Error?e.message:'Could not check existing family.');}
    finally{setImportBusy(false);}
  };
  const people=detail?.people||[];const contact=people.find(p=>p.personId===detail?.primaryContactPersonId);
  return <section className="wr-page">
    <div className="wr-heading"><div><p className="wr-kicker">RAAGASUDHA · ADMINISTRATOR</p><h1>Website Registrations</h1><p>Review and approve applications, then activate approved students in the academy portal.</p></div><button className="wr-refresh" onClick={()=>void load()} disabled={busy}><RefreshCw size={16}/> Refresh</button></div>
    <div className="wr-banner"><ShieldCheck size={18}/><span>Review and approval are separate from activating student records in Sadhana.</span></div>
    <div className="wr-toolbar"><label>Status <select value={filter} onChange={e=>{setFilter(e.target.value);setSelected(null);}}><option value="pending">Pending</option><option value="under_review">Under review</option><option value="approved">Approved</option><option value="discarded">Discarded</option><option value="all">All</option></select></label><label className="wr-search"><Search size={16}/><input aria-label="Search applications" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search names, location or ID"/></label></div>
    {error&&<div className="wr-error" role="alert">{error}<p>Check the Sadhana backend's website API configuration and IAM invoke permission.</p></div>}
    <div className="wr-layout"><div className="wr-list"><div className="wr-list-title">Applications <span>{busy?'Loading…':shown.length}</span></div>
      {!busy&&!error&&!shown.length&&<div className="wr-empty"><Inbox size={24}/><strong>No applications to show</strong><p>Try another status or refresh.</p></div>}
      {shown.map(r=>{const applicant=r.people?.find(p=>p.personId===r.primaryContactPersonId);return <button key={r.registrationId} type="button" className={'wr-item '+(selected===r.registrationId?'wr-selected':'')} onClick={()=>{setSelected(r.registrationId);setCorrectedName('');setCorrectionConfirmed(false);}}><span className="wr-item-body"><strong>{applicant?.fullName||r.people?.[0]?.fullName||r.registrationId}</strong><small>{r.students?.length??'—'} student(s) · {r.preferredLocationId||'Location not supplied'}</small><small>{date(r.submittedAt)} · {r.reviewStatus||r.status||'Pending'}</small></span><ChevronRight size={18}/></button>;})}
    </div><div className="wr-detail">{!selected?<div className="wr-empty"><Inbox size={27}/><strong>Select a registration</strong><p>Open an application to review the parent and student information.</p></div>:detailBusy?<p className="wr-loading">Loading registration…</p>:detailError?<div className="wr-error" role="alert">{detailError}</div>:detail?<>
      <div className="wr-detail-header"><div><p className="wr-kicker">APPLICATION · {detail.registrationId}</p><h2>{contact?.fullName||people[0]?.fullName||'Registration review'}</h2><p>Submitted {date(detail.submittedAt)}</p></div><span className="wr-state">{detail.reviewStatus||detail.status||'Pending'}</span></div>
      <div className="wr-facts"><div><small>Registration type</small><strong>{text(detail.registrationType)}</strong></div><div><small>Location</small><strong>{text(detail.preferredLocationId)}</strong></div><div><small>Import status</small><strong>{detail.sadhanaImport?.status||'Not imported'}</strong></div></div>
      {detail.sadhanaImport?.status==='imported'&&<section className="wr-v112-parent-access-panel" aria-label="Parent portal access"><div><strong>Parent portal access</strong><p>Account invitation is separate from registration approval. Child access still requires verified guardian linking.</p></div><div className="wr-v112-access-status" role="status">{!parentAccess?'Checking…':({NOT_INVITED:'Not invited',INVITATION_SENT:'Invitation requested',ACCOUNT_FOUND:'Existing account found',NEEDS_VERIFICATION:'Needs verification',ACTIVE:'Active'} as Record<string,string>)[parentAccess.status]||parentAccess.status}</div><details className="wr-v118-parent-actions"><summary>Account actions</summary><div className="wr-v112-actions"><button type="button" className="reg-secondary" disabled={accessBusy} onClick={()=>void refreshParentAccess(detail.registrationId)}>{accessBusy?'Working…':'Refresh access'}</button><button type="button" className="reg-secondary" disabled={accessBusy||!parentAccess||!['INVITATION_SENT','ACCOUNT_FOUND','ACTIVE'].includes(parentAccess.status)} onClick={async()=>{setAccessBusy(true);setAccessError('');try{const result=await cloud.api.queueImportedParentLinks(detail.registrationId);setAccessError(`${result.queued} guardian request(s) queued; ${result.alreadyExists} already exist. Approve only after independently verifying the relationship in Account Access.`);}catch(e){setAccessError(e instanceof Error?e.message:'Unable to queue guardian links.');}finally{setAccessBusy(false);}}}>Queue guardian link review</button><button type="button" className="reg-secondary" disabled={accessBusy||parentAccess?.status!=='INVITATION_SENT'} onClick={async()=>{setAccessBusy(true);setAccessError('');try{const result=await cloud.api.resendParentInvitation(detail.registrationId);setAccessError(result.message+' A new temporary password replaces the previous one.');await refreshParentAccess(detail.registrationId);}catch(e){setAccessError(e instanceof Error?e.message:'Unable to resend invitation.');}finally{setAccessBusy(false);}}}>Resend invitation</button><button type="button" className="reg-secondary" disabled={accessBusy||!parentAccess||['ACTIVE','INVITATION_SENT','NEEDS_VERIFICATION'].includes(parentAccess.status)} onClick={()=>void retryParentAccess(detail.registrationId)}>Request invitation / retry</button></div></details>{accessError&&<p className="wr-v112-error" role="alert">{accessError}</p>}<small>An invitation request does not confirm email delivery or grant access to children.</small></section>}
      <div className="wr-card" style={{marginTop:16,display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
        <details className="wr-v118-main-actions"><summary>Registration actions</summary><div className="wr-v118-main-actions-body">
        {detail.reviewStatus!=='approved'&&detail.reviewStatus!=='discarded'&&<button className="reg-primary" type="button" disabled={reviewBusy} onClick={()=>setConfirmReview('approved')}>Approve application</button>}
        {detail.reviewStatus!=='discarded'&&detail.reviewStatus!=='approved'&&<button className="reg-secondary" type="button" disabled={reviewBusy} onClick={()=>setConfirmReview('discarded')}>Discard</button>}
        {detail.reviewStatus==='approved'&&detail.sadhanaImport?.status!=='imported'&&duplicateSourcePerson&&<div className="wr-allergy" style={{width:'100%'}}>
        <strong>Repeated student name and DOB — administrator correction required</strong>
        <p>The website submission contains two student entries with the same name and DOB. Confirm the second student's correct name against the original form or guardian before activation. The website record will not be edited by this action.</p>
        <p>Second source person ID: <code>{duplicateSourcePerson.personId}</code></p>
        <label>Verified second student's name <input aria-label="Verified second student's name" value={correctedName} onChange={e=>{setCorrectedName(e.target.value);setCorrectionConfirmed(false);}} placeholder="Enter verified full name"/></label>
        <label style={{display:'block',marginTop:8}}><input type="checkbox" checked={correctionConfirmed} onChange={e=>setCorrectionConfirmed(e.target.checked)}/> I have verified the second student's identity and name with the family.</label>
      </div>}
        {detail.reviewStatus==='approved'&&detail.sadhanaImport?.status!=='imported'&&<button className="reg-primary" type="button" disabled={importBusy||(Boolean(duplicateSourcePerson)&&(!correctionConfirmed||!correctedName.trim()))} onClick={()=>void previewImport()}>{importBusy?'Activating…':'Activate in Sadhana'}</button>}
        {detail.sadhanaImport?.status==='imported'&&<div className="wr-revoke-entry"><ShieldCheck size={18}/><div><strong>Activated in Sadhana</strong><p>Review affected records before revoking.</p></div><button className="reg-secondary" type="button" disabled={revokeBusy} onClick={async()=>{setRevokeBusy(true);setRevokeError('');setRevokeOutcome('');setRevokePreview(null);try{setRevokePreview(await cloud.api.previewWebsiteRevocation(detail.registrationId));}catch(e){setRevokeError(e instanceof Error?e.message:'Safety check failed');}finally{setRevokeBusy(false);}}}>{revokeBusy?'Checking safety…':'Review revocation'}</button></div>}
        </div></details>
        {revokeError&&<p role="alert" className="wr-error">{revokeError}</p>}
        {revokeOutcome&&<div role="status" className={revokeOutcome==='completed'?'wr-revoke-success':'wr-revoke-warning'}><strong>{revokeOutcome==='completed'?'Revocation completed':'Website reset needs attention'}</strong><p>{revokeOutcome==='completed'?'The activation was revoked. The website application has been refreshed; confirm Pending status before reactivation.':'Sadhana may have removed the records, but website reset is not confirmed. Do not reactivate. Retry the same operation or contact an administrator.'}</p>{revokeOutcome==='completed'&&<button type="button" className="reg-secondary" onClick={()=>{setRevokeOutcome('');setFilter('pending');}}>View pending registrations</button>}</div>}
        {revokePreview&&!revokeConfirm&&<div className="wr-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!revokeBusy)setRevokePreview(null);}}><div role="dialog" aria-modal="true" aria-labelledby="wr-v102-heading" className="wr-modal wr-revoke-modal wr-v102-review"><div className="wr-revoke-title"><ShieldCheck size={20}/><h2 id="wr-v102-heading">Review revocation</h2></div><p className="wr-modal-reference">Application: <strong>{detail.registrationId}</strong></p><p>This review does not change any records.</p><h3>Affected students ({revokePreview.students.length})</h3><ul className="wr-revoke-students">{revokePreview.students.map(s=><li key={s.id}><strong>{s.name||s.id}</strong><small>{s.rollNumber||s.id}{!s.owned?' · Ownership unverified':''}</small></li>)}</ul><p className="wr-revoke-family">Family: {revokePreview.familyId||'Not found'} · Shared family records are protected.</p>{revokePreview.blockers.filter(reason=>!reason.includes('Revocation execution remains disabled')).length>0?<div className="wr-revoke-blockers"><strong>Safety checks require attention</strong><ul>{revokePreview.blockers.filter(reason=>!reason.includes('Revocation execution remains disabled')).map((reason,i)=><li key={i}>{reason}</li>)}</ul></div>:<p className="wr-revoke-ready">Student and family safety checks passed.</p>}{revokePreview.blockers.some(reason=>reason.includes('Revocation execution remains disabled'))&&<p role="status" className="wr-v102-disabled">Revocation is disabled by the administrator. Review is available, but deletion cannot be started.</p>}<div className="wr-modal-actions"><button type="button" className="wr-modal-cancel" onClick={()=>setRevokePreview(null)}>Close review</button><button className="wr-revoke-danger" type="button" disabled={!revokePreview.canRevoke||revokeBusy} onClick={()=>{setRevokePhrase('');setRevokeConfirm(true);}}>Continue to confirmation</button></div></div></div>}
        {revokeConfirm&&revokePreview&&<div className="wr-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!revokeBusy)setRevokeConfirm(false);}}><div role="alertdialog" aria-modal="true" aria-labelledby="wr-revoke-heading" aria-describedby="wr-revoke-description" className="wr-modal wr-revoke-modal"><div className="wr-modal-icon"><ShieldCheck size={22}/></div><h2 id="wr-revoke-heading">Revoke student activation?</h2><p id="wr-revoke-description">This removes the listed imported records from Sadhana and returns the website application to Pending. Audit history remains; roll numbers are not reused.</p><p className="wr-modal-reference">Application: <strong>{detail.registrationId}</strong></p><strong>Affected students</strong><ul className="wr-revoke-students">{revokePreview.students.map(s=><li key={s.id}><strong>{s.name||s.id}</strong><small>{s.rollNumber||s.id}</small></li>)}</ul><p className="wr-revoke-family">Family: {revokePreview.familyId||'Not found'} · Shared family records remain protected.</p><label className="wr-revoke-confirm-label">Type <strong>REVOKE</strong> to confirm<input autoFocus value={revokePhrase} aria-label="Type REVOKE" autoComplete="off" disabled={revokeBusy} onChange={e=>setRevokePhrase(e.target.value)}/></label>{revokeBusy&&<p role="status" className="wr-revoke-progress">Revoking in Sadhana and synchronizing the website. Please wait…</p>}<div className="wr-modal-actions"><button className="wr-modal-cancel" type="button" disabled={revokeBusy} onClick={()=>setRevokeConfirm(false)}>Keep activation</button><button className="wr-modal-discard" type="button" disabled={revokeBusy||revokePhrase!=='REVOKE'||!revokePreview.canRevoke} onClick={async()=>{if(!detail)return;setRevokeBusy(true);setRevokeError('');try{const result=await cloud.api.revokeWebsiteRegistration(detail.registrationId,revokePhrase);setRevokeConfirm(false);setRevokePreview(null);setRevokeOutcome(result.status==='completed'?'completed':'pending');if(result.status!=='completed')setRevokeError(result.warning||'Website reset not yet confirmed. Retry safely before reactivating.');const fresh=await cloud.api.getWebsiteRegistration(detail.registrationId);setDetail(extractRegistration(fresh));await load();}catch(e){setRevokeError(e instanceof Error?e.message:'Revocation failed');}finally{setRevokeBusy(false);}}}>{revokeBusy?'Processing…':'Revoke activation'}</button></div></div></div>}
        {importResult&&<div role="status" style={{width:'100%'}}><strong>Family: {importResult.familyId}</strong><p>Student roll numbers: {Object.values(importResult.studentRollNumbers).join(', ')}</p>{importResult.warning&&<p>{importResult.warning}</p>}</div>}
        {reviewBusy&&<span>Saving review…</span>}
        {reviewError&&<p role="alert" className="wr-error">{reviewError}</p>}
       </div>
      <h3>Primary contact</h3><div className="wr-card"><strong>{contact?.fullName||'Not supplied'}</strong><p>Email: {text(contact?.email)}</p><p>Phone: {text(contact?.phone)}</p>{contact?.address&&<p>Address: {Object.values(contact.address).filter(Boolean).join(', ')||'Not supplied'}</p>}</div>
      <h3>Students ({detail.students?.length||0})</h3>{(detail.students||[]).map((student,i)=>{const person=people.find(p=>p.personId===student.personId);const a=student.foodAllergies;return <article className="wr-card" key={student.personId}><div className="wr-student-head"><div><strong>{person?.fullName||`Student ${i+1}`}</strong><small>DOB: {date(person?.dateOfBirth)} · {student.studentType||'Student'}</small></div>{student.photo&&<Photo cloud={cloud} registrationId={detail.registrationId} personId={student.personId}/>}</div>
      <p>Preferred class: {text(student.preferredClassId)}</p><p>Location: {text(student.preferredLocationId)}</p><p>Start date: {date(student.proposedStartDate)}</p><p>Email: {student.contactPreferences?.emailSource==='guardian'?'Uses guardian contact':text(person?.email)} · Phone: {student.contactPreferences?.phoneSource==='guardian'?'Uses guardian contact':text(person?.phone)}</p><p>Address: {student.contactPreferences?.addressSource==='guardian'?'Uses guardian address':Object.values(person?.address||{}).filter(Boolean).join(', ')||'Not supplied'}</p>
      <div className="wr-allergy"><strong>Food allergy information</strong><p>Status: {a?.status==='yes'?'Known food allergies':a?.status==='none'?'No known food allergies':'Unknown / not confirmed'}</p>{a?.status==='yes'&&<><p>Allergens: {[...(a.allergens||[]),a.otherAllergens||''].filter(Boolean).join(', ')||'Not specified'}</p>{a.reactionDetails&&<p>Reactions: {a.reactionDetails}</p>}{a.emergencyInstructions&&<p>Emergency instructions: {a.emergencyInstructions}</p>}<p>Emergency medication: {a.carriesEmergencyMedication?'Yes':'No / not specified'}</p></>}</div>
    </article>;})}
      <div className="wr-banner"><ShieldCheck size={16}/> Reported family relationships are unverified until independently checked by academy staff.</div>
    </>:null}</div></div>
    {confirmImport && detail && <div className="wr-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!importBusy)setConfirmImport(false);}}><div className="wr-modal" role="alertdialog" aria-modal="true" aria-labelledby="wr-import-heading"><div className="wr-modal-icon"><ShieldCheck size={22}/></div><h2 id="wr-import-heading">Activate approved application?</h2><p>Activate this approved registration in Sadhana. Possible duplicate students are blocked for administrator review. Independent adult roll numbers use the 000 prefix. The website API currently requires a technical family mapping; this does not grant portal login. Classes are not enrolled automatically.</p><p className="wr-modal-reference">Application: <strong>{detail.registrationId}</strong> · Students: {detail.students?.length||0}</p><div className="wr-modal-actions"><button type="button" className="wr-modal-cancel" autoFocus onClick={()=>setConfirmImport(false)}>Cancel</button><button type="button" className="wr-modal-approve" onClick={()=>void importApplication()}>Yes, activate</button></div></div></div>}
    {familyMatch && detail && <div className="wr-modal-backdrop"><div className="wr-modal" role="alertdialog" aria-modal="true" aria-labelledby="wr-family-match"><div className="wr-modal-icon"><ShieldCheck size={22}/></div><h2 id="wr-family-match">Confirm existing family relationship</h2><p>The primary contact phone matches an existing Raagasudha family. Confirm the relationship before activating these students.</p><p><strong>{familyMatch.parentName}</strong> · Family {familyMatch.familyNumber} · {familyMatch.phone}</p><p>Students: {(detail.students||[]).map(s=>people.find(p=>p.personId===s.personId)?.fullName||s.personId).join(', ')}</p><p>No new family or duplicate parent will be created. Students retain distinct student identities.</p><div className="wr-modal-actions"><button type="button" className="wr-modal-cancel" onClick={()=>setFamilyMatch(null)} disabled={importBusy}>Cancel</button><button type="button" className="wr-modal-approve" disabled={importBusy} onClick={()=>void importApplication(familyMatch.familyId)}>Confirm relationship &amp; activate</button></div></div></div>}
    {confirmReview && detail && <div className="wr-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!reviewBusy)setConfirmReview(null);}}>
      <div className="wr-modal" role="alertdialog" aria-modal="true" aria-labelledby="wr-confirm-heading" aria-describedby="wr-confirm-message">
        <div className="wr-modal-icon"><ShieldCheck size={22}/></div>
        <h2 id="wr-confirm-heading">{confirmReview==='approved'?'Approve application?':'Discard application?'}</h2>
        <p id="wr-confirm-message">{confirmReview==='approved'?'This marks the website application as approved. Importing its students into Sadhana is a separate, later step.':'This marks the website application as discarded. No Sadhana student or family records will be changed.'}</p>
        <p className="wr-modal-reference">Application: <strong>{detail.registrationId}</strong></p>
        <div className="wr-modal-actions">
          <button type="button" className="wr-modal-cancel" disabled={reviewBusy} autoFocus onClick={()=>setConfirmReview(null)}>Cancel</button>
          <button type="button" className={confirmReview==='approved'?'wr-modal-approve':'wr-modal-discard'} disabled={reviewBusy} onClick={()=>void review(confirmReview)}>{reviewBusy?'Saving…':confirmReview==='approved'?'Yes, approve':'Yes, discard'}</button>
        </div>
      </div>
    </div>}
  </section>;
}
