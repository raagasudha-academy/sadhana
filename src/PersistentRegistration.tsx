import {useCallback,useEffect,useState} from 'react';
import RegistrationModule from './RegistrationModule';
import type {CloudSession} from './CloudAuth';
import type {InstitutionId} from './types';

const calendarCache = new Map<string,{at:number,records:any[]}>();
/** UI adapter for the original registration experience.
 * Never use the old local setters as a persistence substitute.
 */
export default function PersistentRegistration({cloud,workspace,initialClass='',initialStudent=''}:{cloud:CloudSession;workspace:InstitutionId;initialClass?:string;initialStudent?:string}) {
  const [families,setFamilies]=useState<any[]>([]);
  const [members,setMembers]=useState<any[]>([]);
  const [enrolments,setEnrolments]=useState<any[]>([]);
  const [classes,setClasses]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [loadedOnce,setLoadedOnce]=useState(false);
  const [error,setError]=useState('');
  const [reloadNumber,setReloadNumber]=useState(0);
  const reload=useCallback(async()=>{setReloadNumber(n=>n+1);},[]);
  useEffect(()=>{
    let current=true;
    if(!loadedOnce)setLoading(true);setError('');
    // All reads are dispatched via the shared concurrency limiter in the API client.
    Promise.all([
      cloud.api.listOperations('family',workspace),
      cloud.api.listOperations('student',workspace),
      cloud.api.listOperations('enrolment',workspace),
      (()=>{const cached=calendarCache.get(workspace);if(cached&&Date.now()-cached.at<120000)return Promise.resolve({records:cached.records});return cloud.api.listSchedule(workspace).then((result:any)=>{calendarCache.set(workspace,{at:Date.now(),records:result.records});return result;});})(),
    ]).then(([f,s,e,calendar])=>{
      if(!current)return;
      setFamilies(f.records.map((r:any)=>({...r,createdIn:workspace})));
      setMembers(s.records.map((r:any)=>({...r,createdIn:workspace,familyId:r.familyId||null,isIndependent:!r.familyId})));
      setEnrolments((e.records||[]).map((record:any)=>({...record,institution:record.institution||workspace})));
      setClasses(calendar.records.filter((r:any)=>r.recordType==='class'&&r.lifecycleStatus!=='archived').map((r:any)=>{
        // Legacy EnrolModal expects time, day and duration, while master records
        // use startTime/endTime. Capture weekday from linked dated sessions.
        const linked=calendar.records.find((x:any)=>x.recordType==='class-session'&&x.classId===r.id);
        const day=linked?.date?new Date(`${linked.date}T12:00:00Z`).getUTCDay():0;
        const mins=(t:string)=>{const [h,m]=String(t||'00:00').split(':').map(Number);return h*60+m;};
        return {...r,day,time:r.startTime||'00:00',duration:Math.max(0,mins(r.endTime)-mins(r.startTime)),venue:r.location||'',institution:workspace};
      }));
    }).catch(err=>{if(current)setError(err instanceof Error?err.message:'Unable to load registration records.');})
      .finally(()=>{if(current){setLoading(false);setLoadedOnce(true);}});
    return()=>{current=false;};
  },[cloud.api,workspace,reloadNumber]);
  return <div>
    {error&&<div className="reg-error" role="alert">{error} <button type="button" onClick={()=>void reload()}>Retry</button></div>}
    {loading&&<p className="reg-footnote" role="status">Loading families and students from DynamoDB…</p>}
    {(!loading||loadedOnce)&&<RegistrationModule
      workspace={workspace} families={families} members={members} enrolments={enrolments}
      classes={classes} setFamilies={setFamilies} setMembers={setMembers}
      setEnrolments={setEnrolments} initialClass={initialClass||null} initialStudent={initialStudent||null}
      operationsApi={cloud.api} reload={reload}/>
    }
  </div>;
}
