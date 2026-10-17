import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DirectoryDataMenu, StudentCardBadges } from '../../src/DirectoryComponents';
import { filterFamiliesByLocation, filterStudentsByLocation, sortDirectoryStudents } from '../../src/directorySelectors';
import '../../src/styles.css';

type Student = {id:string;name:string;roll:string;location:string;archived:boolean};
const initial: Student[] = [
  {id:'fixture-1',name:'Asha Rao',roll:'RS-2',location:'Carlisle',archived:false},
  {id:'fixture-2',name:'Dev Shah',roll:'RS-10',location:'Newcastle',archived:true},
  {id:'fixture-3',name:'Meera Iyer',roll:'RS-1',location:'Carlisle',archived:false},
];
const families=[{id:'f1',name:'Rao Family',location:'Carlisle'},{id:'f2',name:'Shah Family',location:'Newcastle'}];
function App(){
  const [rows,setRows]=useState(initial);
  const [view,setView]=useState<'students'|'families'>('students');
  const [location,setLocation]=useState('All');
  const [status,setStatus]=useState('All');
  const [sort,setSort]=useState<'roll'|'name'>('roll');
  const [direction,setDirection]=useState<'asc'|'desc'>('asc');
  const [action,setAction]=useState('None');
  const visible=sortDirectoryStudents(filterStudentsByLocation(rows,location,r=>r.location).filter(r=>status==='All'||(status==='Archived'?r.archived:!r.archived)),sort,direction,r=>r.roll);
  const familyRows=filterFamiliesByLocation(families,location,r=>r.location);
  return <main className="fixture-shell">
    <header><h1>Sadhana — Directory visual fixture</h1><p>Synthetic data only · Browser regression harness</p></header>
    <section className="fixture-controls" aria-label="Directory filters">
      <label>Directory <select aria-label="Directory" value={view} onChange={e=>{setView(e.target.value as typeof view);setLocation('All')}}><option value="students">Students</option><option value="families">Families</option></select></label>
      <label>Location <select aria-label="Location" value={location} onChange={e=>setLocation(e.target.value)}><option value="All">All locations</option><option>Carlisle</option><option>Newcastle</option></select></label>
      <label>Status <select aria-label="Status" value={status} onChange={e=>setStatus(e.target.value)}><option>All</option><option>Active</option><option>Archived</option></select></label>
      <label>Sort <select aria-label="Sort" value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="roll">Roll number</option><option value="name">Student name</option></select></label>
      <button onClick={()=>setDirection(d=>d==='asc'?'desc':'asc')} aria-label="Reverse sort">{direction==='asc'?'Ascending':'Descending'}</button>
      <DirectoryDataMenu onImport={()=>setAction('Import CSV')} onExport={()=>setAction('Export CSV')}/>
    </section>
    <output aria-label="Last CSV action">Last action: {action}</output>
    <section aria-label="Directory results"><h2>{view==='students'?'Students':'Families'}</h2>
      {view==='students'?<table><thead><tr><th>Roll</th><th>Name</th><th>Location</th><th>Status</th><th>Action</th></tr></thead><tbody>{visible.map(r=><tr key={r.id}><td>{r.roll}</td><td>{r.name}</td><td>{r.location}</td><td><StudentCardBadges archived={r.archived} activeEnrolmentCount={r.archived?0:1} enrolmentStatus={r.archived?'Archived':'Enrolled'}/></td><td><button onClick={()=>setRows(current=>current.map(m=>m.id===r.id?{...m,archived:!m.archived}:m))}>{r.archived?'Restore':'Archive'}</button></td></tr>)}</tbody></table>:<table><thead><tr><th>Family</th><th>Location</th></tr></thead><tbody>{familyRows.map(r=><tr key={r.id}><td>{r.name}</td><td>{r.location}</td></tr>)}</tbody></table>}
      <p data-testid="count">{view==='students'?visible.length:familyRows.length} results</p>
    </section>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
