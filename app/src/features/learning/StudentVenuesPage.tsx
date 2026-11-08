import type {StudentPortalContext} from './useStudentPortalController';

export function StudentVenuesPage({context}:{context:StudentPortalContext}) {
const {directory,directoryBusy,directoryError} = context;
return (<section className="sv-academy-directory"><h3>Academy venues</h3><p>Teaching venues shared by the academy.</p>{directoryBusy&&<p role="status">Loading academy venues…</p>}{directoryError&&<p role="alert">{directoryError}</p>}{directory&&(directory.venues.length?<ul>{directory.venues.map((v,i)=><li key={`${v.name}-${i}`}><strong>{v.name}</strong>{v.address&&<span> · {v.address}</span>}{!v.address&&v.location&&<span> · {v.location}</span>}</li>)}</ul>:<p>No venues are published.</p>)}</section>);
}
