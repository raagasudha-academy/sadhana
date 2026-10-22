/** Side-effect-free access decisions; all mutations require a verified account and an admin review. */
export const isStudentRecordId=(v:unknown):v is string=>typeof v==='string'&&/^STUDENT-[0-9a-f-]{36}$/i.test(v);
export const isAccountSubject=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
export const canReadStudent=(link:{studentId?:string;institution?:string;status?:string}|null,studentId:string,institution:string)=>!!link&&link.status==='approved'&&link.studentId===studentId&&link.institution===institution;
export const canReviewAccess=(adminInstitutions:readonly string[],institution:string)=>adminInstitutions.includes(institution);
