import {useState} from 'react';
import type {InstitutionId} from '../../types';

// Display only fields returned by the learner-authorized, read-only API.
export type PublishedStaff={name:string;subjects?:string[];photoUrl?:string;publicId?:string};
export type PublishedAcademy={institution:InstitutionId;teachers:PublishedStaff[];administrators:PublishedStaff[]};
type StaffRole='teachers'|'administrators';
type DirectoryPerson=PublishedStaff & {key:string;academies:InstitutionId[];subjects:string[]};

function groupAcademyStaff(academies:PublishedAcademy[],role:StaffRole){
 const grouped=new Map<string,DirectoryPerson>();
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
   }else grouped.set(identity,{...entry,subjects:[...(entry.subjects||[])],academies:[academy.institution],key:`${role}:${identity}`});
  }
 }
 return Array.from(grouped.values()).sort((a,b)=>a.name.localeCompare(b.name,'en-GB'));
}

export function ApprovedAcademiesStaffDirectory({academies,busy,error}:{academies:PublishedAcademy[];busy:boolean;error:string}){
 const [search,setSearch]=useState('');
 const [academyFilter,setAcademyFilter]=useState<'all'|InstitutionId>('all');
 const [role,setRole]=useState<StaffRole>('teachers');
 const name=(id:InstitutionId)=>id==='sruti'?'Śruti Vedam':'Raagasudha';
 const visible=academies.filter(a=>academyFilter==='all'||academyFilter===a.institution);
 const matches=(person:PublishedStaff)=>`${person.name} ${(person.subjects||[]).join(' ')}`.toLocaleLowerCase('en-GB').includes(search.toLocaleLowerCase('en-GB'));
 const people=groupAcademyStaff(visible,role).filter(matches);
 const allCount=groupAcademyStaff(academies,role).length;
 const photo=(person:PublishedStaff)=>typeof person.photoUrl==='string'&&/^https:\/\//i.test(person.photoUrl)?person.photoUrl:'';
 const label=role==='teachers'?'Teachers':'Directors / Admin';
 return <section className="sv1396c-directory" aria-label="Academy directory">
  <div className="sv1396c-heading"><div><span className="sv1396c-eyebrow">ACADEMY DIRECTORY</span></div><span className="sv1396c-count">{allCount} {allCount===1?'person':'people'}</span></div>
  <nav className="sv1396c-role-tabs" role="tablist" aria-label="Academy directory roles">
   <button type="button" role="tab" aria-selected={role==='teachers'} className={role==='teachers'?'active':''} onClick={()=>setRole('teachers')}>Teachers</button>
   <button type="button" role="tab" aria-selected={role==='administrators'} className={role==='administrators'?'active':''} onClick={()=>setRole('administrators')}>Directors / Admin</button>
  </nav>
  <div className="sv1396c-tools"><label>Find a person<input type="search" placeholder={`Search ${role==='teachers'?'teachers or subjects':'directors or administrators'}`} value={search} onChange={event=>setSearch(event.target.value)}/></label><label>Academy<select value={academyFilter} onChange={event=>setAcademyFilter(event.target.value as typeof academyFilter)}><option value="all">All my academies</option>{academies.map(academy=><option key={academy.institution} value={academy.institution}>{name(academy.institution)}</option>)}</select></label></div>
  {busy&&<p role="status">Loading academy directory…</p>}
  {error&&<p role="alert" className="sv1396c-error">{error}</p>}
  {!busy&&(people.length?<div className="sv1396c-grid" role="tabpanel" aria-label={label}>{people.map(person=><article className="sv1396c-card" key={person.key}><div className="sv1396c-monogram" aria-hidden="true">{photo(person)?<img src={photo(person)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event=>{event.currentTarget.style.display='none';}}/>:null}<span>{person.name.trim().slice(0,1).toUpperCase()||'P'}</span></div><div><h4>{person.name}</h4><div className="sv1396c-affiliations">{person.academies.map(academy=><span key={academy} className="sv1396c-role">{name(academy)} · {role==='teachers'?'Teacher':'Administrator'}</span>)}</div>{person.subjects.length>0&&<p>{person.subjects.join(' · ')}</p>}</div></article>)}</div>:<p className="sv1396c-empty" role="tabpanel">No {label.toLocaleLowerCase('en-GB')} match this selection.</p>)}
  <p className="sv1396c-footnote">Read-only directory. Only staff published by your approved academies are shown.</p>
 </section>;
}
