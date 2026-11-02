import {UserRound} from 'lucide-react';
import type {StudentPortalContext} from './useStudentPortalController';

export function StudentDashboardIntro({context}:{context:StudentPortalContext}) {
const {inst,students,showFamilyDashboard,activeId,detail} = context;
return (<div className="sv116-intro sv-family-dash-v1"><span className="sv116-eyebrow">YOUR ACADEMY · YOUR LEARNING</span><h1>{showFamilyDashboard?'Family Dashboard':'My Learning Dashboard'}</h1><p>Manage your family's classes, attendance and learning.</p><div className="svfd-viewing"><UserRound size={17}/><span>Viewing as — <strong>{students.find(s=>s.id===activeId)?.name||detail?.student.name||'Selected student'}</strong> · {inst==='raaga'?'Raagasudha':'Śruti Vedam'}</span></div></div>);
}
