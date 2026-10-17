/** Pure, read-only selectors for live academy operations. The API remains the permission authority. */
export type OpsRow={id:string;studentId?:string;classId?:string;startDate?:string;endDate?:string;archived?:boolean};
export type OpsSession={id:string;recordType:string;classId?:string;eventKind?:string;date?:string;name?:string; lifecycleStatus?:string};
export function activeClassIds(enrolments:OpsRow[]):Set<string>{
 return new Set(enrolments.filter(e=>!e.archived&&e.classId).map(e=>e.classId!));
}
export function visibleMasterClasses<T extends OpsSession>(schedule:T[],enrolments:OpsRow[],teacherMode:boolean):T[]{
 const allowed=activeClassIds(enrolments);
 return schedule.filter(s=>s.recordType==='class'&&s.lifecycleStatus!=='archived'&&(!teacherMode||allowed.has(s.id)));
}
export function visibleDatedSessions<T extends OpsSession>(schedule:T[],enrolments:OpsRow[],teacherMode:boolean):T[]{
 const allowed=activeClassIds(enrolments);
 return schedule.filter(s=>(s.recordType==='class-session'||s.recordType==='special-event'&&s.eventKind==='class')&&s.lifecycleStatus!=='archived'&&(!teacherMode||!!s.classId&&allowed.has(s.classId)));
}
export function enrolledStudentIds(enrolments:OpsRow[],classId:string,date?:string):Set<string>{
 return new Set(enrolments.filter(e=>!e.archived&&e.classId===classId&&(!date||(!e.startDate||e.startDate<=date)&&(!e.endDate||date<=e.endDate))).map(e=>e.studentId).filter((id):id is string=>!!id));
}
export function eligibleStudentIds(enrolments:OpsRow[],classId:string,date?:string):Set<string>{
 if(classId)return enrolledStudentIds(enrolments,classId,date);
 return new Set(enrolments.filter(e=>!e.archived).map(e=>e.studentId).filter((id):id is string=>!!id));
}
