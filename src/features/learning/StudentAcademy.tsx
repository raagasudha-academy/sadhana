import {useState} from 'react';
import type {InstitutionId} from '../../types';
// Display ONLY fields already returned by the student-authorized, read-only API.
// A global cross-academy endpoint needs separate backend authorization review.
export type PublishedStaff={name:string;subjects?:string[];photoUrl?:string;publicId?:string};
export type PublishedAcademy={institution:InstitutionId;teachers:PublishedStaff[];administrators:PublishedStaff[]};
// Only existing learner-authorized endpoints may populate this directory.
// Photos appear only when the backend explicitly publishes an approved signed photoUrl.
// Stable public IDs take precedence; older backend responses use name-only display grouping.
// This legacy fallback is temporary until the upgraded backend is deployed.
function groupPublishedStaff(academies:PublishedAcademy[],role:'teachers'|'administrators'){
 type Group=PublishedStaff & {key:string;academies:InstitutionId[];subjects:string[]};
 const grouped=new Map<string,Group>();
 for(const academy of academies){
  const seen=new Set<string>();
  for(const entry of academy[role]){
   const identity=entry.publicId?`id:${entry.publicId}`:`legacy:${entry.name.trim().replace(/\s+/g,' ').toLocaleLowerCase('en-GB')}`;
   if(!identity||seen.has(identity))continue;
   seen.add(identity);
   const current=grouped.get(identity);
   if(current){
    if(!current.academies.includes(academy.institution))current.academies.push(academy.institution);
    if(!current.photoUrl&&entry.photoUrl)current.photoUrl=entry.photoUrl;
    for(const subject of entry.subjects||[])if(!current.subjects.includes(subject))current.subjects.push(subject);
   }else grouped.set(identity,{name:entry.name,photoUrl:entry.photoUrl,subjects:[...(entry.subjects||[])],academies:[academy.institution],key:`${role}:${identity}`});
  }
 }
 return Array.from(grouped.values()).sort((a,b)=>a.name.localeCompare(b.name,'en-GB'));
}
export function ApprovedAcademiesStaffDirectory({academies,busy,error}:{academies:PublishedAcademy[];busy:boolean;error:string}){
 const [search,setSearch]=useState('');
 const [academyFilter,setAcademyFilter]=useState<'all'|InstitutionId>('all');
 const name=(id:InstitutionId)=>id==='sruti'?'Śruti Vedam':'Raagasudha';
 const visible=academies.filter(a=>academyFilter==='all'||academyFilter===a.institution);
 const matches=(person:PublishedStaff)=>`${person.name} ${(person.subjects||[]).join(' ')}`.toLocaleLowerCase('en-GB').includes(search.toLocaleLowerCase('en-GB'));
 const teachers=groupPublishedStaff(visible,'teachers').filter(p=>matches(p));
 const administrators=groupPublishedStaff(visible,'administrators').filter(p=>matches(p));
 const photo=(p:PublishedStaff)=>typeof p.photoUrl==='string'&&/^https:\/\//i.test(p.photoUrl)?p.photoUrl:'';
 return <section className="sv1396c-directory" aria-label="Academy staff directory">
  <div className="sv1396c-heading"><div><span className="sv1396c-eyebrow">ACADEMY DIRECTORY</span><h3>All teachers &amp; administrators</h3><p>Published staff from your approved academies, whether or not they teach your class.</p></div><span className="sv1396c-count">{groupPublishedStaff(academies,'teachers').length+groupPublishedStaff(academies,'administrators').length} people</span></div>
  <div className="sv1396c-tools"><label>Find a person<input type="search" placeholder="Search teacher, administrator or subject" value={search} onChange={e=>setSearch(e.target.value)}/></label><label>Academy<select value={academyFilter} onChange={e=>setAcademyFilter(e.target.value as typeof academyFilter)}><option value="all">All my academies</option>{academies.map(a=><option key={a.institution} value={a.institution}>{name(a.institution)}</option>)}</select></label></div>
  {busy&&<p role="status">Loading published staff for your approved academies…</p>}
  {error&&<p role="alert" className="sv1396c-error">{error}</p>}
  {!busy&&<>
   <div className="sv1396c-group-heading"><h4>All Teachers</h4><span>{visible.map(a=>name(a.institution)).join(' · ')||'No approved academies'}</span></div>
   {teachers.length?<div className="sv1396c-grid">{teachers.map(p=><article className="sv1396c-card" key={p.key}><div className="sv1396c-monogram" aria-hidden="true">{photo(p)?<img src={photo(p)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={e=>{e.currentTarget.style.display='none';}}/>:null}<span>{p.name.trim().slice(0,1).toUpperCase()||'T'}</span></div><div><h4>{p.name}</h4><div className="sv1396c-affiliations">{p.academies.map(a=><span key={a} className="sv1396c-role">{name(a)} · Teacher</span>)}</div>{p.subjects.length>0&&<p>{p.subjects.join(' · ')}</p>}</div></article>)}</div>:<p className="sv1396c-empty">No published teachers match this selection.</p>}
   <div className="sv1396c-group-heading"><h4>All Administrators</h4><span>{visible.map(a=>name(a.institution)).join(' · ')||'No approved academies'}</span></div>
   {administrators.length?<div className="sv1396c-grid">{administrators.map(p=><article className="sv1396c-card" key={p.key}><div className="sv1396c-monogram" aria-hidden="true">{photo(p)?<img src={photo(p)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={e=>{e.currentTarget.style.display='none';}}/>:null}<span>{p.name.trim().slice(0,1).toUpperCase()||'A'}</span></div><div><h4>{p.name}</h4><div className="sv1396c-affiliations">{p.academies.map(a=><span key={a} className="sv1396c-role">{name(a)} · Administrator</span>)}</div></div></article>)}</div>:<p className="sv1396c-empty">No published administrators match this selection.</p>}
  </>}
  <p className="sv1396c-footnote">Read-only directory. Only published staff information is displayed. Profile pictures appear when approved by the academy.</p>
 </section>;
}

