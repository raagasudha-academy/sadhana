import {useCallback, useEffect, useState} from 'react';
import {Inbox, RefreshCw, ShieldCheck, CheckCircle2, Search, ChevronRight} from 'lucide-react';
import type {CloudSession} from './CloudAuth';
import './websiteRegistrations.css';

type IntakeSummary = {
  registrationId: string;
  institutionId?: string;
  submittedAt?: string;
  reviewStatus?: string;
  importStatus?: string;
  registrationType?: string;
  primaryName?: string;
  studentCount?: number;
  studentNames?: string[];
};
type ExistingMapping = {mode:'existing';confirmReference:string;guardianPersonId:string;students:Array<{sourcePersonId:string;personId:string}>;evidenceReference:string};
type SrutiImportPreview={preview?:boolean;alreadyImported?:boolean;registrationId:string;studentCount?:number;readyForExecute?:boolean;existingFamilyId?:string;studentMappings?:Array<{sourcePersonId:string;personId:string;rollNumber:string}>;guardianLinksToCreate?:string;noNewPeople?:boolean;noNewCognitoUsers?:boolean};
function isExistingMapping(raw:unknown,ref:string,count:number):raw is ExistingMapping {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return false;
  const m=raw as Record<string,unknown>;
  const validId=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{4,180}$/.test(v);
  if(m.mode!=='existing'||m.confirmReference!==ref||!validId(m.guardianPersonId)||!validId(m.evidenceReference)||!Array.isArray(m.students)||m.students.length!==count)return false;
  const studentIds=new Set<string>();
  for(let i=0;i<m.students.length;i++){
    const student=m.students[i];
    if(!student||typeof student!=='object'||Array.isArray(student)||student.sourcePersonId!==`sruti-child-${i+1}`||!validId(student.personId)||studentIds.has(student.personId))return false;
    studentIds.add(student.personId);
  }
  return true;
}
type IntakeDetails = IntakeSummary & {
  version?: number;
  submission?: {
    registrationType?: string;
    guardian?: {firstName?: string;lastName?: string;email?: string;phone?: string;emergencyName?: string;emergencyPhone?: string;address1?: string;address2?: string;city?: string;postcode?: string};
    students?: Array<{firstName?: string;lastName?: string;dateOfBirth?: string;applicantType?: string;school?: string;interests?: string;experience?: string;allergies?: string;medicalNotes?: string}>;
  };
};
const safeDate = (value?: string) => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'}) : '—';
const value = (s?:string) => s?.trim() || 'Not supplied';

/** Sruti administrator review surface. Never reuse Raagasudha workflows. */
export default function SrutiWebsiteRegistrations({cloud}:{cloud:CloudSession}) {
  const [records,setRecords] = useState<IntakeSummary[]>([]);
  const [selected,setSelected] = useState('');
  const [detail,setDetail] = useState<IntakeDetails|null>(null);
  const [filter,setFilter] = useState('pending');
  const [search,setSearch] = useState('');
  const [loading,setLoading] = useState(false);
  const [detailLoading,setDetailLoading] = useState(false);
  const [error,setError] = useState('');
  const [detailError,setDetailError] = useState('');
  const [more,setMore] = useState(false);
  const [reviewAvailable,setReviewAvailable] = useState(false);
  const [decision,setDecision] = useState<'approved'|'discarded'|null>(null);
  const [reviewBusy,setReviewBusy] = useState(false);
  const [reviewError,setReviewError] = useState('');
  const [reviewMessage,setReviewMessage] = useState('');
  const [detailRefresh,setDetailRefresh] = useState(0);
  const [importPreview,setImportPreview]=useState<SrutiImportPreview|null>(null);
  const [existingMapping,setExistingMapping]=useState<ExistingMapping|null>(null);
  const [importBusy,setImportBusy]=useState(false);
  const [importError,setImportError]=useState('');
  const [importMessage,setImportMessage]=useState('');
  const [confirmImport,setConfirmImport]=useState(false);
  const [typedReference,setTypedReference]=useState('');
  const [duplicateCheck,setDuplicateCheck]=useState(false);


  const reload=useCallback(async()=>{
    setLoading(true);setError('');
    try {
      const result=await cloud.api.listSrutiWebsiteRegistrations() as {records?:IntakeSummary[];more?:boolean};
      setRecords((result.records||[]).filter(r=>r.institutionId==='sruti'));
      setMore(Boolean(result.more));
    } catch(e) {setRecords([]);setError(e instanceof Error?e.message:'Could not load Sruti registrations.');}
    finally {setLoading(false);}
  },[cloud.api]);
  useEffect(()=>{void reload();},[reload]);
  useEffect(()=>{
    let active=true;setDetail(null);setDetailError('');setReviewAvailable(false);setDecision(null);setImportPreview(null);setExistingMapping(null);setImportError('');setConfirmImport(false);setTypedReference('');setDuplicateCheck(false);
    if(!selected)return;
    setDetailLoading(true);
    cloud.api.getSrutiWebsiteRegistration(selected).then(raw=>{
      const response=raw as {record?:IntakeDetails;reviewAvailable?:boolean};
      if(!active)return;
      if(response.record?.institutionId!=='sruti')throw new Error('Unexpected institution on registration.');
      setDetail(response.record||null);
      setReviewAvailable(response.reviewAvailable===true);
    }).catch(e=>{if(active)setDetailError(e instanceof Error?e.message:'Could not open Sruti registration.');})
      .finally(()=>{if(active)setDetailLoading(false);});
    return ()=>{active=false;};
  },[selected,cloud.api,detailRefresh]);
  async function confirmDecision(){
    if(!decision||!detail||!reviewAvailable||reviewBusy)return;
    if(detail.reviewStatus!=='pending'||!Number.isSafeInteger(detail.version)||Number(detail.version)<1){
      setReviewError('This registration is not eligible for review. Refresh its details.');
      setDecision(null);return;
    }
    setReviewBusy(true);setReviewError('');setReviewMessage('');
    try{
      const result=await cloud.api.reviewSrutiWebsiteRegistration(detail.registrationId,decision,detail.version!);
      setReviewMessage(result.reviewStatus==='approved'?'Registration approved. Importing learners into Sadhana is a separate step.':'Registration rejected. No students or families were changed.');
      setFilter('all');
      setDecision(null);
      await reload();
      setDetailRefresh(v=>v+1);
    }catch(e){
      setDecision(null);
      setReviewError(e instanceof Error?e.message:'Could not save the review decision.');
      setDetailRefresh(v=>v+1);
    }finally{setReviewBusy(false);}
  }
  async function loadMapping(file:File|undefined){
    setExistingMapping(null);setImportPreview(null);setConfirmImport(false);setImportError('');
    if(!file)return;
    if(file.size>16*1024){setImportError('Mapping file exceeds 16 KB.');return;}
    try{
      const parsed:unknown=JSON.parse(await file.text());
      if(!detail||!isExistingMapping(parsed,detail.registrationId,detail.submission?.students?.length||0))
        throw new Error('Invalid verified identity mapping for this registration. Generate the mapping using the read-only Sadhana identity checker.');
      setExistingMapping(parsed);
    }catch(e){setImportError(e instanceof Error?e.message:'Could not read the identity mapping file.');}
  }
  async function previewImport(){
    if(!detail||detail.reviewStatus!=='approved'||importBusy||!existingMapping)return;
    setImportBusy(true);setImportError('');setImportPreview(null);setConfirmImport(false);
    try{
      const result=await cloud.api.previewSrutiWebsiteImport(detail.registrationId,existingMapping);
      if(result.registrationId && result.registrationId!==detail.registrationId && !result.registrationId.startsWith('web_'))
        throw new Error('Unexpected import reference.');
      setImportPreview(result);
    }catch(e){setImportError(e instanceof Error?e.message:'Import preview failed. No records were changed.');}
    finally{setImportBusy(false);}
  }
  async function executeImport(){
    if(!detail||!existingMapping||!importPreview?.readyForExecute||importPreview.alreadyImported||
       !duplicateCheck||typedReference!==detail.registrationId||importBusy)return;
    setImportBusy(true);setImportError('');
    try{
      const result=await cloud.api.executeSrutiWebsiteImport(detail.registrationId,existingMapping);
      if(!result.imported&&!result.alreadyImported)throw new Error('Import result could not be confirmed. Check before retrying.');
      setImportMessage(result.alreadyImported?'Registration was already imported; no duplicates were created.':
        `Imported into Sruti. ${result.studentIds?.length||0} student(s) linked to a family with verified relationships.`);
      setImportPreview(null);setExistingMapping(null);setConfirmImport(false);setTypedReference('');setDuplicateCheck(false);setFilter('all');
      await reload();setDetailRefresh(v=>v+1);
    }catch(e){setImportError(e instanceof Error?e.message:'Import could not be completed. Refresh before retrying.');setConfirmImport(false);}
    finally{setImportBusy(false);}
  }
  useEffect(()=>{setReviewError('');setReviewMessage('');setImportMessage('');},[selected]);
  const displayed=records.filter(r=>(filter==='all'||(r.reviewStatus||'pending')===filter) &&
    [r.registrationId,r.primaryName||'',...(r.studentNames||[])].join(' ').toLowerCase().includes(search.trim().toLowerCase()));
  const g=detail?.submission?.guardian;
  const learnerCount=detail?.submission?.students?.length||0;
  const primaryName=value([g?.firstName,g?.lastName].filter(Boolean).join(' '));
  const reviewEligible=detail?.reviewStatus==='pending' && reviewAvailable &&
    Number.isSafeInteger(detail?.version) && Number(detail?.version)>=1;
  return <section className="wr-page">
    <div className="wr-heading">
      <div><h1>Website Registrations</h1><p>Review applications and activate approved learners.</p></div>
      <button type="button" className="wr-refresh" disabled={loading} onClick={()=>void reload()}><RefreshCw size={16}/> Refresh</button>
    </div>
    <div className="wr-banner"><ShieldCheck size={18}/><span>Approval and portal activation are separate steps.</span></div>
    <div className="wr-toolbar">
      <label>Status <select value={filter} onChange={e=>{setFilter(e.target.value);setSelected('');}}>
        <option value="pending">Pending</option><option value="approved">Approved</option><option value="discarded">Discarded</option><option value="all">All</option>
      </select></label>
      <label className="wr-search"><Search size={16}/><input aria-label="Search applications" placeholder="Search names or ID" value={search} onChange={e=>setSearch(e.target.value)}/></label>
    </div>
    {error&&<div className="wr-error" role="alert">{error}</div>}
    {reviewMessage&&<div className="wr-banner" role="status"><CheckCircle2 size={18}/>{reviewMessage}</div>}
    {importMessage&&<div className="wr-banner" role="status"><CheckCircle2 size={18}/>{importMessage}</div>}
    {more&&<p role="status">Showing the first 100 registrations. More records exist; pagination is not yet enabled.</p>}
    <div className="wr-layout">
      <div className="wr-list">
        <div className="wr-list-title">Applications <span>{loading?'Loading…':displayed.length}</span></div>
        {!loading&&!error&&!displayed.length&&<div className="wr-empty"><Inbox size={24}/><strong>No applications to show</strong><p>Try another status or refresh.</p></div>}
        {displayed.map(r=><button type="button" key={r.registrationId} className={'wr-item '+(selected===r.registrationId?'wr-selected':'')} onClick={()=>setSelected(r.registrationId)}>
          <span className="wr-item-body">
            <strong>{r.primaryName||r.registrationId}</strong>
            <small>{r.primaryName?r.registrationId+' · ':''}{r.studentCount!=null?`${r.studentCount} learner(s) · `:''}Śruti</small>
            <small>{safeDate(r.submittedAt)} · {r.reviewStatus||'pending'}</small>
          </span><ChevronRight size={18}/>
        </button>)}
      </div>
      <div className="wr-detail">
        {!selected?<div className="wr-empty"><Inbox size={27}/><strong>Select a registration</strong><p>Open an application to review the parent and learner information.</p></div>
        :detailLoading?<p className="wr-loading">Loading registration…</p>
        :detailError?<div className="wr-error" role="alert">{detailError}</div>
        :detail?<>
          <div className="wr-detail-header">
            <div><p className="wr-kicker">APPLICATION · {detail.registrationId}</p><h2>{primaryName}</h2><p>Submitted {safeDate(detail.submittedAt)}</p></div>
            <span className="wr-state">{detail.reviewStatus||'pending'}</span>
          </div>
          <div className="wr-facts">
            <div><small>Registration type</small><strong>{value(detail.submission?.registrationType||detail.registrationType)}</strong></div>
            <div><small>Learners</small><strong>{learnerCount}</strong></div>
            <div><small>Import status</small><strong>{detail.importStatus||'Pending'}</strong></div>
          </div>
          <div className="wr-card">
            <details className="wr-v118-main-actions">
              <summary>Registration actions</summary>
              <div className="wr-v118-main-actions-body">
                {detail.reviewStatus==='pending'?<>
                  <button type="button" className="reg-primary" disabled={!reviewEligible||reviewBusy} onClick={()=>setDecision('approved')}>Approve application</button>
                  <button type="button" className="reg-secondary" disabled={!reviewEligible||reviewBusy} onClick={()=>setDecision('discarded')}>Discard</button>
                  {!reviewAvailable&&<p role="status">Review actions are awaiting activation of the protected Sruti review API.</p>}
                  {!Number.isSafeInteger(detail.version)&&<p role="alert">Registration version is missing. Refresh before approving.</p>}
                </>:detail.reviewStatus==='approved' && detail.importStatus!=='imported'?<>
                  <p>Approved. Existing Sadhana students must be linked using independently verified canonical person IDs. A new-family import is not available in final mode.</p>
                  <label style={{display:'block',margin:'12px 0'}}>Verified existing-identity mapping (JSON file from the read-only Sadhana checker)
                    <input type="file" accept=".json,application/json" disabled={importBusy} onChange={e=>void loadMapping(e.target.files?.[0])}/>
                  </label>
                  {existingMapping&&<p role="status">Verified mapping loaded for {existingMapping.students.length} existing student(s). No identities have been changed.</p>}
                  <button type="button" className="reg-primary" disabled={importBusy||!existingMapping} onClick={()=>void previewImport()}>{importBusy?'Checking…':'Preview existing-student link'}</button>
                  {importPreview?.alreadyImported&&<p role="status">Already imported. Refresh to see the updated status.</p>}
                </>:<p role="status">Review status: {detail.reviewStatus||'Pending'}. Import: {detail.importStatus||'pending'}.</p>}
              </div>
            </details>
            {reviewBusy&&<p role="status">Saving review…</p>}
            {reviewError&&<div className="wr-error" role="alert">{reviewError}</div>}
            {importError&&<div className="wr-error" role="alert">{importError}</div>}
            {importPreview?.readyForExecute&&<div className="wr-card" role="status">
              <strong>Import preview</strong>
              <p>Existing family: {importPreview.existingFamilyId||'Not supplied'}</p>
              <p>Existing students: {importPreview.studentCount??0} · Family links will be verified from the approved registration.</p>
              <p>No new person, family or Cognito account is created. Raagasudha membership and learning data remain unchanged.</p>
              {importPreview.studentMappings?.map(m=><p key={m.sourcePersonId}>{m.sourcePersonId} → existing person {m.personId} · Sruti roll {m.rollNumber}</p>)}
              <p><strong>Review the identity mapping before continuing.</strong> The approved registration supplies the family relationship; this import verifies the exact existing people and records that evidence.</p>
              <button type="button" className="reg-primary" disabled={importBusy} onClick={()=>setConfirmImport(true)}>Continue to confirmation</button>
            </div>}
          </div>
          <h3>Primary contact</h3>
          <div className="wr-card">
            <strong>{primaryName}</strong>
            <p>Email: {value(g?.email)}</p><p>Phone: {value(g?.phone)}</p>
            <p>Address: {[g?.address1,g?.address2,g?.city,g?.postcode].filter(Boolean).join(', ')||'Not supplied'}</p>
          </div>
          <h3>Emergency contact</h3>
          <div className="wr-card">
            <strong>{value(g?.emergencyName)}</strong><p>Phone: {value(g?.emergencyPhone)}</p>
          </div>
          <h3>Students ({learnerCount})</h3>
          {(detail.submission?.students||[]).map((s,i)=><article className="wr-card" key={i}>
            <div className="wr-student-head"><div><strong>{value([s.firstName,s.lastName].filter(Boolean).join(' '))}</strong><small>DOB: {safeDate(s.dateOfBirth)} · {value(s.applicantType)}</small></div></div>
            <p>School: {value(s.school)}</p><p>Area of interest: {value(s.interests)}</p>
            <p>Previous learning or experience: {value(s.experience)}</p>
            <p>Medical or support notes: {value(s.medicalNotes)}</p>
            <div className="wr-allergy"><strong>Food allergy information</strong><p>{s.allergies?.trim().toLowerCase()==='none'?'No food allergies reported':value(s.allergies)}</p></div>
          </article>)}
        </>:null}
      </div>
    </div>
    {confirmImport&&detail&&importPreview?.readyForExecute&&<div className="wr-modal-backdrop">
      <div className="wr-modal" role="alertdialog" aria-modal="true" aria-labelledby="sruti-import-confirm-title">
        <div className="wr-modal-icon"><ShieldCheck size={22}/></div>
        <h2 id="sruti-import-confirm-title">Import approved learners into Sruti?</h2>
        <p>Registration: <strong>{detail.registrationId}</strong> · Students: {importPreview.studentCount}</p>
        <p>This adds the confirmed existing people to Sruti, verifies the submitted family links and assigns Sruti roll numbers. No new people or accounts are created.</p>
        <label style={{display:'block',margin:'12px 0'}}>
          <input type="checkbox" checked={duplicateCheck} onChange={e=>setDuplicateCheck(e.target.checked)}/>
          {' '}I verified the existing person IDs and checked that these students are not already linked to Sruti.
        </label>
        <label style={{display:'block',margin:'12px 0'}}>Type registration reference to confirm
          <input style={{display:'block',width:'100%'}} value={typedReference} onChange={e=>setTypedReference(e.target.value)} placeholder={detail.registrationId}/>
        </label>
        <div className="wr-modal-actions">
          <button type="button" className="wr-modal-cancel" disabled={importBusy} onClick={()=>setConfirmImport(false)}>Cancel</button>
          <button type="button" className="wr-modal-approve" disabled={importBusy||!duplicateCheck||typedReference!==detail.registrationId} onClick={()=>void executeImport()}>{importBusy?'Importing…':'Confirm import'}</button>
        </div>
      </div>
    </div>}
    {decision&&detail&&<div className="wr-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!reviewBusy)setDecision(null);}}>
      <div className="wr-modal" role="alertdialog" aria-modal="true" aria-labelledby="sruti-decision-title">
        <div className="wr-modal-icon"><ShieldCheck size={22}/></div>
        <h2 id="sruti-decision-title">{decision==='approved'?'Approve application?':'Discard application?'}</h2>
        <p>{decision==='approved'?'This marks the application as approved. Importing learners into Sadhana is a separate step.':'This marks the application as discarded. No student or family records will be changed.'}</p>
        <p className="wr-modal-reference">Application: <strong>{detail.registrationId}</strong></p>
        <div className="wr-modal-actions">
          <button type="button" className="wr-modal-cancel" disabled={reviewBusy} onClick={()=>setDecision(null)}>Cancel</button>
          <button type="button" className={decision==='approved'?'wr-modal-approve':'wr-modal-discard'} disabled={reviewBusy} onClick={()=>void confirmDecision()}>{reviewBusy?'Saving…':decision==='approved'?'Yes, approve':'Yes, discard'}</button>
        </div>
      </div>
    </div>}
  </section>;
}
