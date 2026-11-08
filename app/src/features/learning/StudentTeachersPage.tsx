import type {StudentPortalContext} from './useStudentPortalController';
import {ApprovedAcademiesStaffDirectory} from './StudentAcademy';

export function StudentTeachersPage({context}:{context:StudentPortalContext}) {
const {approvedStaff,approvedStaffBusy,approvedStaffError,error} = context;
return (<ApprovedAcademiesStaffDirectory academies={approvedStaff} busy={approvedStaffBusy} error={approvedStaffError}/>);
}
