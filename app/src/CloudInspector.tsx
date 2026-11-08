/** Read-only smoke test: proves the signed-in user can query institution-scoped DynamoDB data. */
import { useEffect, useState } from 'react';
import { Cloud, X, RefreshCw, ShieldCheck, Database } from 'lucide-react';
import type { CloudSession } from './CloudAuth';
import type { InstitutionId } from './types';

type Summary = {institution:InstitutionId;counts: Record<string,number>;more:boolean};
const resources=['families','students','classes','enrolments','venues'] as const;
export default function CloudInspector({cloud,onClose}: {cloud:CloudSession;onClose:()=>void}) {
  const [summaries,setSummaries]=useState<Summary[]>([]);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [refresh,setRefresh]=useState(0);
  useEffect(()=>{
    let alive=true;
    setLoading(true);setError('');setSummaries([]);
    Promise.all(cloud.staff.institutions.map(async institution=>{
      const results=await Promise.all(resources.map(resource=>cloud.api.list(resource,institution)));
      return {institution, counts:Object.fromEntries(resources.map((resource,i)=>[resource,results[i].records.length])),more:results.some(result=>result.more)};
    })).then(data=>{if(alive)setSummaries(data);}).catch(e=>{if(alive)setError(e instanceof Error?e.message:'Cloud read failed.');}).finally(()=>{if(alive)setLoading(false);});
    return ()=>{alive=false;};
  },[cloud.api,cloud.staff.institutions.join(','),refresh]);
  return <div className="cloud-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="cloud-modal" role="dialog" aria-modal="true" aria-label="Live AWS connection check">
    <div className="cloud-modal-head"><div><span className="eyebrow">LIVE CONNECTION · READ ONLY</span><h2><Cloud size={20}/> AWS connection</h2><p>Verified Cognito identity · DynamoDB test queries</p></div><button type="button" onClick={onClose} aria-label="Close"><X size={20}/></button></div>
    <div className="cloud-note"><ShieldCheck size={18}/><span>Signed in with access to {cloud.staff.institutions.map(x=>x==='raaga'?'Raagasudha':'Śruti Vedam').join(' and ')}. Access is checked on the server.</span></div>
    {loading?<p className="cloud-progress"><RefreshCw size={18}/> Querying Sadhana's real DynamoDB table…</p>:error?<p role="alert" className="cloud-error">{error}</p>:<div className="cloud-results">{summaries.map(entry=><section key={entry.institution}><h3><Database size={17}/>{entry.institution==='raaga'?'Raagasudha':'Śruti Vedam'}</h3><div className="cloud-stats">{resources.map(resource=><div key={resource}><strong>{entry.counts[resource]}</strong><span>{resource}</span></div>)}</div>{entry.more&&<small>Some results are paginated. Counts are limited to the first page.</small>}</section>)}</div>}
    <p className="cloud-disclaimer">These counts come from the live AWS API. The portal now starts without any seeded records. Middlesbrough calendar events are saved separately; registration, class, venue and practice CRUD screens are not yet connected to DynamoDB.</p>
    <div className="cloud-actions"><button onClick={()=>setRefresh(x=>x+1)} disabled={loading}><RefreshCw size={16}/> Refresh</button><button onClick={onClose}>Close</button></div>
  </section></div>;
}
