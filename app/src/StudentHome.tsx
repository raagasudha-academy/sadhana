import './studentFamilyDashboard.css';
import './studentTimetablePolish.css';
import './studentUiFinish.css'; // sv-student-ui-finish
import './studentExperience.css';
import './studentPracticeRefined.css';
import './practiceInsights.css';
import './practiceUX.css';
import './studentCompactHeader.css';
import './homeworkInstructions.css';
import './roleWorkspace.css';
import './accountAccess.css';
import './studentPortal.css';
import './studentWorkspace.css';
import './studentAccessRequest.css';
import './learningExperience.css';
import './studentNavigationLayout.css';
import './embeddedCalendar.css';
import './studentHomework.css';
import './foundation.css';
import './unifiedLayout.css';
import './handoverLayout.css';
import './workspaceLayout.css';
import './shellPolish.css';
import './academyDirectory.css';
import './studentDashboardTypography.css';
import {useStudentPortalController} from './features/learning/useStudentPortalController';
import {StudentPortalView} from './features/learning/StudentPortalView';
import type {StudentPortalProps} from './features/learning/useStudentPortalController';
export type LearnerChoice={id:string;name:string;rollNumber:string;kind:string};
export type LearnerPage='overview'|'classes'|'calendar'|'homework'|'practice'|'attendance'|'teachers'|'venues'|'profile'|'privacy';
export default function StudentHome(props:StudentPortalProps){
 const context=useStudentPortalController(props);
 return <StudentPortalView context={context}/>;
}
