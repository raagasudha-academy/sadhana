import {useEffect,useState} from 'react';
import {CheckCircle2,Link2,ShieldCheck,X} from 'lucide-react';
import {institutions} from './institutions';
import type {InstitutionId} from './types';
import type {SadhanaApiClient,TeacherLinkRow,TeacherLinkList} from './api/sadhanaClient';

interface Props {
 api:SadhanaApiClient;
 institution:InstitutionId|'combined';
 adminInstitutions:InstitutionId[];
 onClose:()=>void;
 onLinked:()=>void;
}
const keyFor=(r:TeacherLinkRow)=>`${r.scope}:${r.classId}:${r.effectiveFrom}`;
export default function TeacherLinksManager({api,institution,adminInstitutions,onClose,onLinked}:Props){
 const [academy,setAcademy]=useState<InstitutionId>(institution==='combined'?adminInstitutions[0]:institution);
 const [data,setData]=useState<TeacherLinkList|null>(null);
 const [selected,setSelected]=useState<Record<string,string>>({});
 const [confirm,setConfirm]=useState<TeacherLinkRow|null>(null);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const [revision,setRevision]=useState(0);
 useEffect(()=>{
  let alive=true;setLoading(true);setError('');setData(null);setConfirm(null);
  api.listTeacherLinks(academy).then(result=>{
   if(!alive)return;
   setData(result);
   setSelected(Object.fromEntries(result.rows.map(r=>[keyFor(r),r.suggestedIds.length===1?r.suggestedIds[0]:''])));
  }).catch(e=>{if(alive)setError(e instanceof Error?e.message:'Unable to load teacher links.');})
   .finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;};
 },[academy,api,revision]);
 const linked=data?.rows.filter(r=>!!r.teacherId).length||0;
 const remaining=data?.rows.filter(r=>r.teacher&&!r.teacherId).length||0;
 const ready=confirm&&selected[keyFor(confirm)]&&confirm.suggestedIds.includes(selected[keyFor(confirm)]);
 const chosen=confirm?data?.teachers.find(t=>t.id===selected[keyFor(confirm)]):null;
 const apply=async()=>{
  if(!confirm||!ready)return;
  setSaving(true);setError('');
  try{
   await api.linkTeacherIdentity(academy,confirm.classId,{
    teacherId:selected[keyFor(confirm)],expectedVersion:confirm.version,
    ...(confirm.scope==='series'?{effectiveFrom:confirm.effectiveFrom}:{})
   });
   setConfirm(null);setRevision(n=>n+1);onLinked();
  }catch(e){setError(e instanceof Error?e.message:'Could not link teacher. Refresh and review.');}
  finally{setSaving(false);}
 };
 return <div className="reg-shade" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)onClose();}}>
  <section className="reg-modal v077-links-modal" role="dialog" aria-modal="true" aria-label="Link registered teachers">
   <div className="reg-modal-head"><div><h2>Link registered teachers</h2><p>Connect master classes and effective-dated changes to registered teacher profiles. No sessions will be rewritten.</p></div>
    <button type="button" className="reg-icon-btn" onClick={onClose} disabled={saving} aria-label="Close"><X size={19}/></button>
   </div>
   <div className="v077-link-body">
    <label className="reg-field"><span>Institution</span><select value={academy} onChange={e=>setAcademy(e.target.value as InstitutionId)} disabled={saving}>
     {adminInstitutions.map(i=><option key={i} value={i}>{institutions[i].name}</option>)}
    </select></label>
    <p className="reg-footnote"><ShieldCheck size={15}/> Each link requires confirmation, matches the existing teacher name and uses the latest master version. Linking does not grant a teacher permission to edit classes.</p>
    {loading?<p>Loading master classes and teacher registry…</p>:data&&<>
     <p className="v077-link-count">{linked} linked · {remaining} ready to review · {data.rows.length} assignment entries</p>
     <div className="v077-link-list">
      {data.rows.map(row=>{
       const selectedId=selected[keyFor(row)]||'';
       const canLink=!!row.teacher&&!row.teacherId&&row.suggestedIds.includes(selectedId);
       const assigned=data.teachers.find(t=>t.id===row.teacherId);
       return <article className="v077-link-row" key={keyFor(row)}>
        <div className="v077-link-summary"><strong>{row.className}</strong>
         <small>{row.scope==='series'?`From ${row.effectiveFrom} · existing series rule`:'Master class baseline'} · version {row.version}</small>
         <span>{row.teacher||'No baseline teacher — preserved'}</span>
        </div>
        <div className="v077-link-controls">
         {row.teacherId?<span className="v077-linked"><CheckCircle2 size={15}/> Linked: {assigned?.displayName||row.teacherId}</span>
          :!row.teacher?<small>Cannot link an empty baseline</small>
          :<><select aria-label={`Registered teacher for ${row.className} ${row.effectiveFrom||'baseline'}`}
             value={selectedId} onChange={e=>setSelected(v=>({...v,[keyFor(row)]:e.target.value}))}>
             <option value="">{row.suggestedIds.length?'Select teacher':'No matching registered teacher'}</option>
             {data.teachers.map(t=><option value={t.id} key={t.id} disabled={!row.suggestedIds.includes(t.id)}>{t.displayName}</option>)}
           </select>
           <button type="button" className="reg-secondary" disabled={!canLink||saving} onClick={()=>{setError('');setConfirm(row);}}>Preview link</button></>}
        </div>
       </article>;
      })}
     </div>
    </>}
    {error&&<p className="reg-error" role="alert">{error}</p>}
   </div>
   <div className="reg-modal-actions"><button type="button" className="reg-secondary" onClick={onClose} disabled={saving}>Close</button></div>
  </section>
  {confirm&&<div className="reg-shade v077-confirm-shade" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setConfirm(null);}}>
   <section className="reg-modal v077-confirm-modal" role="alertdialog" aria-modal="true" aria-label="Confirm teacher identity link">
    <div className="reg-modal-head"><div><h2>Review teacher identity link</h2><p>{confirm.className}</p></div><Link2 size={22}/></div>
    <div className="v077-confirm-details"><p><strong>Existing teacher name:</strong> {confirm.teacher}</p><p><strong>Registered teacher:</strong> {chosen?.displayName}</p>
     <p><strong>Applies to:</strong> {confirm.scope==='series'?`Existing rule from ${confirm.effectiveFrom}`:'Master class baseline'}</p>
     <p>Only a stable <code>teacherId</code> will be attached to this assignment. Session dates, displayed teacher names and historical exceptions will not be changed.</p></div>
    {error&&<p className="reg-error" role="alert">{error}</p>}
    <div className="reg-modal-actions"><button type="button" className="reg-secondary" disabled={saving} onClick={()=>setConfirm(null)}>Cancel</button>
     <button type="button" className="reg-primary" disabled={!ready||saving} onClick={()=>void apply()}>{saving?'Linking…':'Confirm identity link'}</button></div>
   </section>
  </div>}
 </div>;
}
