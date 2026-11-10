import {VenueManager} from '../../ClassManagement';
import type {StudentPortalContext} from './useStudentPortalController';

export function StudentVenuesPage({context}:{context:StudentPortalContext}) {
 const {directory,directoryBusy,directoryError,selectedVenueQuery}=context;
 const venues=(directory?.venues||[]).map((venue,index)=>({...venue,id:`${venue.location}-${venue.name}-${index}`}));
 return <VenueManager venues={venues} audience="learner" busy={directoryBusy} error={directoryError} selectedVenue={selectedVenueQuery} hideHeading/>;
}
