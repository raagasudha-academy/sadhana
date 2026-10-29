/** Typed client for the deployed Cognito-protected Sadhana API.
 * Requires a verified Cognito access token. Never embed AWS credentials in Vite.
 * The calendar is live; other CRUD screens remain browser-only for now.
 */
import type { InstitutionId } from '../types';

export type ResourceName = 'families' | 'students' | 'classes' | 'venues' | 'enrolments' | 'practice';
export type ResourcePayload = Record<string, unknown>;
export type ScheduleInstitution = 'raaga' | 'sruti' | 'shared';
export interface ScheduleRecord {
  id: string; recordType: 'class'|'class-session'|'holiday'|'special-event';
  institution:ScheduleInstitution; name:string;programme:string;teacher:string;
  mode:string;location:string;venueId?:string;date?:string;endDate?:string;startTime:string;endTime:string;
  teacherId?:string;allDay?:boolean;status?:'confirmed'|'tentative'|'cancelled';classId?:string;sessionOverrideFields?:string[];
  timezone:'Europe/London';version?:number;affectsClasses?:boolean;lifecycleStatus?:'active'|'paused'|'archived';
}

export type ApiRecord = ResourcePayload & { id?: string; version?: number };
export interface ListResponse { records: ApiRecord[]; more: boolean }
export interface SearchResponse {
  families: Array<{id:string;parentName:string;phoneLast4:string}>;
  students: Array<{id:string;name:string;familyId:string|null}>;
  more: boolean;
}
export interface TeacherRecord {
  id:string; displayName:string;
  institutions:InstitutionId[]; subjects:string[];
  aliases:string[]; cognitoSub?:string;
  active:boolean; version:number; photoUrl?:string;
}
export interface TeacherLinkRow {
 classId:string;className:string;version:number;scope:'master'|'series';effectiveFrom:string;
 teacher:string;teacherId:string;suggestedIds:string[];
}
export interface TeacherLinkList {
 institution:InstitutionId;teachers:Array<Pick<TeacherRecord,'id'|'displayName'|'subjects'|'photoUrl'>>;
 rows:TeacherLinkRow[];more:boolean;
}
export interface AdministratorRecord {
  username:string; sub:string; displayName:string; title?:string; firstName:string; lastName:string; photo:string; email:string; enabled:boolean;
  institution:InstitutionId; status:string; photoUrl?:string;
}
export interface AdministratorListResponse {
  records:AdministratorRecord[]; canManage:boolean;
}
export interface StaffResponse { subject: string; institutions: InstitutionId[]; adminInstitutions?: InstitutionId[]; teacherInstitutions?: InstitutionId[]; role: 'admin' | 'viewer' | 'learner'; displayName?: string; photoUrl?:string }
export interface SadhanaApiOptions {
  baseUrl: string;
  getAccessToken: () => Promise<string | null> | string | null;
}
interface RequestOptions { institution?: InstitutionId; body?: ResourcePayload; params?: Record<string,string> }

// Share a small concurrency budget across every API client and component.
// AWS development account currently has a 10-execution Lambda limit.
const READ_LIMIT = 3;
let activeReads = 0;
const waitingReads: Array<() => void> = [];
async function limitRead<T>(work: () => Promise<T>): Promise<T> {
  if (activeReads >= READ_LIMIT) await new Promise<void>(resolve => waitingReads.push(resolve));
  activeReads++;
  try { return await work(); }
  finally { activeReads--; waitingReads.shift()?.(); }
}
const retryDelay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export function createSadhanaApi({baseUrl,getAccessToken}: SadhanaApiOptions) {
  if (!/^https:\/\//.test(baseUrl)) throw new Error('The API must use HTTPS.');
  if (typeof getAccessToken !== 'function') throw new Error('Provide a Cognito access-token function.');
  const request = async <T>(method: string, path: string, {institution,body,params}: RequestOptions = {}): Promise<T> => {
    const token=await getAccessToken();
    if(!token) throw new Error('Please sign in to Sadhana.');
    const query=new URLSearchParams(params||{});
    if(institution) query.set('institution',institution);
    const suffix=query.toString()?`?${query}`:'';
    const fetchOptions = {
      method,
      headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),
      cache:'no-store' as const,
    };
    const url=`${baseUrl.replace(/\/$/,'')}${path}${suffix}`;
    const perform = async (): Promise<T> => {
      // GET requests are safe to retry; never replay a create/update/delete.
      const attempts = method === 'GET' ? 3 : 1;
      for (let attempt = 0; attempt < attempts; attempt++) {
        let res: Response;
        try { res = await fetch(url,fetchOptions); }
        catch (error) {
          if (attempt + 1 < attempts) { await retryDelay(300 * (2 ** attempt)); continue; }
          throw error;
        }
        if ((res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) && attempt + 1 < attempts) {
          await retryDelay(300 * (2 ** attempt));
          continue;
        }
        const payload: unknown=await res.json().catch(()=>({}));
        if(!res.ok) throw new Error(typeof payload==='object'&&payload!==null&&'error' in payload ? String(payload.error):`Request failed (${res.status})`);
        return payload as T;
      }
      throw new Error('The request could not be completed.');
    };
    return method === 'GET' ? limitRead(perform) : perform();
  };
  return {
    listOperations:(kind:'family'|'student'|'enrolment'|'attendance'|'practice'|'feedback'|'rsvp',institution:InstitutionId)=>request<{records:any[]}>('GET',`/operations/${kind}`,{institution}),
    createOperation:(kind:'family'|'student'|'enrolment'|'attendance'|'practice'|'feedback'|'rsvp',institution:InstitutionId,data:ResourcePayload)=>request<{record:any}>('POST',`/operations/${kind}`,{institution,body:data}),
    deleteFamily:(institution:InstitutionId,id:string,expectedVersion:number)=>request<{deleted:boolean;familyId:string;studentsDeleted:number}>('DELETE',`/operations/family/${encodeURIComponent(id)}`,{institution,body:{confirm:'DELETE',expectedVersion}}),
    deleteEnrolment:(institution:InstitutionId,id:string,expectedVersion:number)=>request<{deleted:boolean;enrolmentId:string}>('DELETE',`/operations/enrolment/${encodeURIComponent(id)}`,{institution,body:{confirm:'DELETE',expectedVersion}}),
    updateOperation:(kind:'family'|'student'|'enrolment'|'attendance'|'practice'|'feedback'|'rsvp',institution:InstitutionId,id:string,data:ResourcePayload,expectedVersion:number)=>request<{record:any}>('PATCH',`/operations/${kind}/${encodeURIComponent(id)}`,{institution,body:{...data,expectedVersion}}),
    uploadMyPhoto:(base64:string)=>request<{photoUrl:string;updated:boolean}>('POST','/photos/me',{body:{base64}}),
    uploadAdministratorPhoto:(username:string,base64:string)=>request<{photoUrl:string;updated:boolean}>('POST','/photos/administrator',{body:{username,base64}}),
    uploadTeacherPhoto:(teacherId:string,base64:string)=>request<{photoUrl:string;updated:boolean}>('POST','/photos/teacher',{body:{teacherId,base64}}),
    listAdministrators:(institution:InstitutionId)=>request<AdministratorListResponse>('GET','/administrators',{institution}),
    updateAdministratorProfile:(username:string,firstName:string,lastName:string,title:string)=>request<{username:string;updated:boolean}>('PATCH','/administrators/profile',{body:{username,firstName,lastName,title}}),
    inviteAdministrator:(displayName:string,email:string,institution:InstitutionId)=>request<{username:string;institution:InstitutionId;invited:boolean}>('POST','/administrators/invite',{body:{displayName,email,institution}}),
    changeAdministratorAccess:(username:string,institution:InstitutionId,grant:boolean)=>request<{username:string;institution:InstitutionId;granted:boolean;unchanged:boolean}>('POST','/administrators/access',{body:{username,institution,grant}}),
    teacherPracticeComments:(institution:InstitutionId,practiceId:string)=>request<{records:Array<{id:string;practiceId:string;comment:string;createdAt:string}>}>('GET',`/teacher-practice/${encodeURIComponent(practiceId)}/comments`,{institution}),
    addTeacherPracticeComment:(institution:InstitutionId,practiceId:string,comment:string)=>request<{record:any}>('POST',`/teacher-practice/${encodeURIComponent(practiceId)}/comments`,{institution,body:{comment}}),
    listClassHomework:(institution:InstitutionId,classId:string)=>request<{records:Array<{id:string;classId:string;title:string;instructions:string;dueDate:string}>}>('GET',`/homework/${encodeURIComponent(classId)}`,{institution}),
    republishClassHomework:(institution:InstitutionId,classId:string,homeworkId:string,title:string,instructions:string,dueDate:string,expectedVersion:number)=>request<{record:any}>('PUT',`/homework/${encodeURIComponent(classId)}/${encodeURIComponent(homeworkId)}`,{institution,body:{title,instructions,dueDate,expectedVersion}}),
    publishClassHomework:(institution:InstitutionId,classId:string,title:string,instructions:string,dueDate:string)=>request<{record:any}>('POST',`/homework/${encodeURIComponent(classId)}`,{institution,body:{title,instructions,dueDate}}),
    beginTeacherHomeworkMaterial:(institution:InstitutionId,classId:string,id:string,mime:string,size:number)=>request<{key:string;uploadUrl:string;headers:Record<string,string>}>('POST',`/homework/${encodeURIComponent(classId)}/materials/${encodeURIComponent(id)}/start`,{institution,body:{mime,size}}),
    finishTeacherHomeworkMaterial:(institution:InstitutionId,classId:string,id:string,key:string)=>request<{record:{id:string;mime:string;size:number}}>('POST',`/homework/${encodeURIComponent(classId)}/materials/${encodeURIComponent(id)}/finish`,{institution,body:{key}}),
    setTeacherHomeworkMaterials:(institution:InstitutionId,classId:string,id:string,ids:string[],expectedVersion:number)=>request<{saved:boolean}>('POST',`/homework/${encodeURIComponent(classId)}/materials/${encodeURIComponent(id)}/selection`,{institution,body:{ids,expectedVersion}}),
    teacherHomeworkMaterialLinks:(institution:InstitutionId,classId:string,id:string)=>request<{records:Array<{id:string;mime:string;size:number;url:string}>}>('GET',`/homework/${encodeURIComponent(classId)}/materials/${encodeURIComponent(id)}/links`,{institution}),
    learnerHomeworkMaterialLinks:(institution:InstitutionId,studentId:string,id:string)=>request<{records:Array<{id:string;mime:string;size:number;url:string}>}>('GET',`/learner/${encodeURIComponent(studentId)}/homework/${encodeURIComponent(id)}/materials`,{institution}),
    beginHomeworkEvidence:(institution:InstitutionId,studentId:string,homeworkId:string,mime:string,size:number)=>request<{uploadUrl:string;key:string;headers:Record<string,string>}>('POST',`/learner/${encodeURIComponent(studentId)}/submission/${encodeURIComponent(homeworkId)}/evidence/start`,{institution,body:{mime,size}}),
    finishHomeworkEvidence:(institution:InstitutionId,studentId:string,homeworkId:string,key:string)=>request<{attachmentId:string}>('POST',`/learner/${encodeURIComponent(studentId)}/submission/${encodeURIComponent(homeworkId)}/evidence/finish`,{institution,body:{key}}),
    homeworkEvidenceLinks:(institution:InstitutionId,studentId:string,homeworkId:string)=>request<{records:Array<{id:string;mime:string;url:string}>}>('GET',`/learner/${encodeURIComponent(studentId)}/submission/${encodeURIComponent(homeworkId)}/evidence`,{institution}),
    teacherHomeworkEvidenceLinks:(institution:InstitutionId,classId:string,homeworkId:string,studentId:string)=>request<{records:Array<{id:string;mime:string;url:string}>}>('GET',`/homework/${encodeURIComponent(classId)}/evidence/${encodeURIComponent(homeworkId)}/${encodeURIComponent(studentId)}`,{institution}),
    getHomeworkSubmission:(institution:InstitutionId,studentId:string,homeworkId:string)=>request<{record:{text:string;status:'draft'|'submitted';version:number;attachmentIds:string[];feedback?:string};editable:boolean;dueDate:string}>('GET',`/learner/${encodeURIComponent(studentId)}/submission/${encodeURIComponent(homeworkId)}`,{institution}),
    saveHomeworkSubmission:(institution:InstitutionId,studentId:string,homeworkId:string,data:{text:string;status:'draft'|'submitted';expectedVersion:number;attachmentIds:string[]})=>request<{record:{text:string;status:'draft'|'submitted';version:number;attachmentIds:string[]}}>('PUT',`/learner/${encodeURIComponent(studentId)}/submission/${encodeURIComponent(homeworkId)}`,{institution,body:data}),
    teacherHomeworkSubmissions:(institution:InstitutionId,classId:string,homeworkId:string)=>request<{records:Array<{studentId:string;homeworkId:string;text:string;status:string;version:number;attachmentIds:string[];feedback?:string}>}>('GET',`/homework/${encodeURIComponent(classId)}/submissions/${encodeURIComponent(homeworkId)}`,{institution}),
    teacherHomeworkFeedback:(institution:InstitutionId,classId:string,homeworkId:string,studentId:string,feedback:string,expectedVersion:number)=>request<{saved:boolean}>('POST',`/homework/${encodeURIComponent(classId)}/feedback/${encodeURIComponent(homeworkId)}/${encodeURIComponent(studentId)}`,{institution,body:{feedback,expectedVersion}}),
    learnerHomework:(institution:InstitutionId,studentId:string)=>request<{records:Array<{id:string;classId:string;title:string;instructions:string;dueDate:string;completed:boolean}>}>('GET',`/learner/${encodeURIComponent(studentId)}/homework`,{institution}),
    completeLearnerHomework:(institution:InstitutionId,studentId:string,homeworkId:string)=>request<{completed:boolean}>('POST',`/learner/${encodeURIComponent(studentId)}/homework`,{institution,body:{homeworkId,completed:true}}),
    srutiGuardianCandidates:()=>request<{records:Array<{studentId:string;subject:string}>}>('GET','/family-access/sruti-candidates',{institution:'sruti'}),
    requestSrutiGuardian:(studentId:string,subject:string)=>request<{submitted:boolean;status:string}>('POST','/family-access/sruti-request',{institution:'sruti',body:{studentId,subject}}),
    learnerExtras:(institution:InstitutionId,studentId:string)=>request<{student:{id:string;name:string;rollNumber:string};profile:{preferredName:string;phone:string;about:string;version:number};teachers:string[];venues:string[];classes:Array<{classId:string;name:string;teacher:string;venue:string}>}>('GET',`/learner/${encodeURIComponent(studentId)}/extras`,{institution}),
    saveLearnerProfile:(institution:InstitutionId,studentId:string,data:{preferredName:string;phone:string;about:string;expectedVersion:number})=>request<{updated:boolean;version:number}>('PATCH',`/learner/${encodeURIComponent(studentId)}/profile`,{institution,body:data}),
    beginLearnerMedia:(institution:InstitutionId,studentId:string,data:{mime:string;size:number;purpose:'profile'|'homework'|'practice'})=>request<{uploadUrl:string;key:string;expiresIn:number;maxBytes:number}>('POST',`/learner/${encodeURIComponent(studentId)}/media/start`,{institution,body:data}),
    finishLearnerMedia:(institution:InstitutionId,studentId:string,key:string,purpose:string)=>request<{uploaded:boolean;id:string}>('POST',`/learner/${encodeURIComponent(studentId)}/media/finish`,{institution,body:{key,purpose}}),
    listLearnerMedia:(institution:InstitutionId,studentId:string)=>request<{records:Array<{id:string;purpose:string;mime:string;url:string;createdAt:string}>}>('GET',`/learner/${encodeURIComponent(studentId)}/media`,{institution}),
    learnerDashboard:(institution:InstitutionId,studentId:string)=>request<{student:{id:string;name:string;rollNumber:string};classes:Array<{classId:string;className:string;startDate:string;endDate:string}>;nextSessions:Array<{sessionId:string;classId:string;className:string;date:string;startTime:string;intention:string}>;practice:Array<{id:string;classId:string;date:string;minutes:number;topic:string;comments:string;version:number;teacherComments:Array<{id:string;comment:string;createdAt:string}>}>;attendance:{marks:Array<{sessionId:string;status:string;date:string;className:string;classId:string}>;byClass:Array<{classId:string;className:string;recorded:number;attended:number;counted:number;percent:number|null}>;attended:number;counted:number;percent:number|null}}>('GET',`/learner/${encodeURIComponent(studentId)}/dashboard`,{institution}),
    saveLearnerRsvp:(institution:InstitutionId,studentId:string,sessionId:string,intention:'attending'|'not_attending'|'unknown')=>request<{record:any}>('PUT',`/learner/${encodeURIComponent(studentId)}/rsvp`,{institution,body:{sessionId,intention}}),
    saveLearnerPractice:(institution:InstitutionId,studentId:string,data:{classId:string;date:string;minutes:number;topic:string;comments:string},edit?:{id:string;version:number})=>request<{record:any}>(edit?'PATCH':'POST',`/learner/${encodeURIComponent(studentId)}/practice${edit?`/${encodeURIComponent(edit.id)}`:''}`,{institution,body:{...data,...(edit?{expectedVersion:edit.version}:{})}}),
    myLinkedStudents:(institution:InstitutionId)=>request<{records:Array<{id:string;name:string;rollNumber:string;kind:string}>}>('GET','/family-access/mine',{institution}),
    requestStudentLinkByRoll:(institution:InstitutionId,rollNumber:string,kind:'student'|'guardian')=>request<{submitted:boolean;status:string}>('POST','/family-access/request',{institution,body:{rollNumber,kind}}),
    requestStudentLink:(institution:InstitutionId,studentId:string,kind:'student'|'guardian')=>request<{submitted:boolean;status:string}>('POST','/family-access/request',{institution,body:{studentId,kind}}),
    requestGuardianLinkForAccount:(institution:InstitutionId,studentId:string,beneficiarySubject:string)=>request<{submitted:boolean;status:string}>('POST','/family-access/request',{institution,body:{studentId,kind:'guardian',beneficiarySubject}}),
    listAccessRequests:(institution:InstitutionId)=>request<{records:Array<{studentId:string;subject:string;kind:string;status:string;version:number}>;identities:Record<string,{name:string;email:string;verified:true}>}>('GET','/family-access/requests',{institution}),
    decideStudentLink:(institution:InstitutionId,subject:string,studentId:string,decision:'approved'|'rejected'|'revoked',expectedVersion:number,relationshipVerified=false)=>request<{updated:boolean}>('POST','/family-access/decide',{institution,body:{subject,studentId,decision,expectedVersion,relationshipVerified}}),
    myTeacherIdentity:(institution:InstitutionId)=>request<{linked:boolean;teacherId:string|null}>('GET','/teachers/me',{institution}),
    listTeachers:(institution:InstitutionId)=>request<{records:TeacherRecord[];more:boolean}>('GET','/teachers',{institution}),
    createTeacher:(institution:InstitutionId,data:ResourcePayload)=>request<{record:TeacherRecord}>('POST','/teachers',{institution,body:data}),
    updateTeacher:(institution:InstitutionId,id:string,data:ResourcePayload,expectedVersion:number)=>request<{record:TeacherRecord}>('PATCH',`/teachers/${encodeURIComponent(id)}`,{institution,body:{...data,expectedVersion}}),
    listTeacherLinks:(institution:InstitutionId)=>request<TeacherLinkList>('GET','/schedule/teacher-links',{params:{institution}}),
    linkTeacherIdentity:(institution:InstitutionId,classId:string,body:{teacherId:string;expectedVersion:number;effectiveFrom?:string})=>request<{classId:string;teacherId:string;linked:boolean;masterVersion:number}>('PATCH',`/schedule/teacher-links/${encodeURIComponent(classId)}`,{params:{institution},body}),
    previewDeleteMasterClass:(institution:InstitutionId,id:string,expectedVersion:number)=>request<{classId:string;name:string;masterVersion:number;sessionCount:number;ruleCount:number;dates:string[];signature:string}>('POST',`/schedule/master/${encodeURIComponent(id)}/delete-preview`,{params:{institution},body:{expectedVersion}}),
    deleteMasterClass:(institution:InstitutionId,id:string,expectedVersion:number,signature:string)=>request<{deleted:boolean;sessionCount:number;ruleCount:number}>('DELETE',`/schedule/master/${encodeURIComponent(id)}`,{params:{institution},body:{expectedVersion,signature,confirm:true}}),

    setMasterLifecycle:(institution:InstitutionId,id:string,lifecycleStatus:'active'|'paused'|'archived',expectedVersion:number)=>request<{record:ScheduleRecord}>('PATCH',`/schedule/master/${encodeURIComponent(id)}/lifecycle`,{params:{institution},body:{lifecycleStatus,expectedVersion}}),
    listSchedule:(institution:ScheduleInstitution)=>request<{records:ScheduleRecord[];more:boolean;source:string}>('GET','/schedule',{params:{institution}}),
    previewDeleteSeries:(institution:InstitutionId,id:string,effectiveFrom:string,effectiveUntil:string,expectedVersion:number)=>request<{count:number;from:string;until:string;dates:Array<{date:string;name:string;id:string}>;signature:string}>('POST',`/schedule/series/${encodeURIComponent(id)}/delete-preview`,{params:{institution},body:{effectiveFrom,effectiveUntil,expectedVersion}}),
    deleteSeriesSessions:(institution:InstitutionId,id:string,effectiveFrom:string,effectiveUntil:string,expectedVersion:number,signature:string)=>request<{deleted:boolean;count:number}>('DELETE',`/schedule/series/${encodeURIComponent(id)}`,{params:{institution},body:{effectiveFrom,effectiveUntil,expectedVersion,signature,confirm:true}}),
    deleteScheduleSession:(institution:InstitutionId,id:string,expectedVersion:number)=>request<{deleted:boolean;id:string}>('DELETE',`/schedule/${encodeURIComponent(id)}`,{params:{institution},body:{expectedVersion}}),
    updateSchedule:(institution:ScheduleInstitution,id:string,changes:ResourcePayload,expectedVersion:number)=>request<{record:ScheduleRecord}>('PATCH',`/schedule/${encodeURIComponent(id)}`,{params:{institution},body:{...changes,expectedVersion}}),
    updateScheduleSeries:(institution:ScheduleInstitution,classId:string,changes:ResourcePayload,effectiveFrom:string,expectedVersion:number,effectiveUntil?:string)=>request<{classId:string;effectiveFrom:string;masterVersion:number}>('PATCH',`/schedule/series/${encodeURIComponent(classId)}`,{params:{institution},body:{changes,effectiveFrom,expectedVersion,...(effectiveUntil?{effectiveUntil}:{})}}),
    previewScheduleSeries:(institution:ScheduleInstitution,classId:string,changes:ResourcePayload,effectiveFrom:string,expectedVersion:number,effectiveUntil?:string)=>request<{totalSessions:number;changedCount:number;changedSessionIds:string[];protectedCount:number;protectedSessionIds:string[];overlappingRules:Array<{effectiveFrom:string;effectiveUntil:string|null;changes:ResourcePayload}>}>('POST',`/schedule/series/${encodeURIComponent(classId)}/preview`,{params:{institution},body:{changes,effectiveFrom,expectedVersion,...(effectiveUntil?{effectiveUntil}:{})}}),
    previewRecurringClass:(institution:InstitutionId,data:ResourcePayload)=>request<{count:number;dates:string[];first:string;last:string;duplicateNames:Array<{id:string;name:string}>}>('POST','/recurring-classes/preview',{institution,body:data}),
    createRecurringClass:(institution:InstitutionId,data:ResourcePayload)=>request<{record:ScheduleRecord;sessionCount:number}>('POST','/recurring-classes',{institution,body:data}),
    createSharedEvent:(data:ResourcePayload)=>request<{record:ScheduleRecord}>('POST','/events/shared',{body:data}),
    updateSharedEvent:(id:string,data:ResourcePayload,expectedVersion:number)=>request<{record:ScheduleRecord}>('PATCH',`/events/shared/${encodeURIComponent(id)}`,{body:{...data,expectedVersion}}),
    cancelSharedEvent:(id:string,expectedVersion:number)=>request<{record:ScheduleRecord}>('DELETE',`/events/shared/${encodeURIComponent(id)}`,{body:{expectedVersion}}),
    listManagedEvents:(institution:InstitutionId)=>request<{records:ScheduleRecord[]}>('GET','/events',{institution}),
    createManagedEvent:(institution:InstitutionId,data:ResourcePayload)=>request<{record:ScheduleRecord}>('POST','/events',{institution,body:data}),
    createAdditionalSessions:(institution:InstitutionId,data:{classId:string;sessions:{date:string;startTime:string;endTime:string}[]})=>request<{count:number}>('POST','/additional-sessions',{institution,body:data}),
    updateManagedEvent:(institution:InstitutionId,id:string,data:ResourcePayload,expectedVersion:number)=>request<{record:ScheduleRecord}>('PATCH',`/events/${encodeURIComponent(id)}`,{institution,body:{...data,expectedVersion}}),
    cancelManagedEvent:(institution:InstitutionId,id:string,expectedVersion:number)=>request<{record:ScheduleRecord}>('DELETE',`/events/${encodeURIComponent(id)}`,{institution,body:{expectedVersion}}),
    createSchedule:(institution:ScheduleInstitution,data:ResourcePayload)=>request<{record:ScheduleRecord}>('POST','/schedule',{params:{institution},body:data}),
    listMiddlesbroughCalendar:()=>request<{events:import('../middlesbroughCalendar').CalendarEntry[];source:string}>('GET','/calendar/middlesbrough'),
    previewMiddlesbroughSync:()=>request<import('../middlesbroughCalendar').CalendarSyncPreview>('POST','/calendar/middlesbrough/sync',{body:{mode:'preview'}}),
    applyMiddlesbroughSync:(expectedFingerprint:string)=>request<{mode:string;written:number;counts:Record<string,number>}>('POST','/calendar/middlesbrough/sync',{body:{mode:'apply',confirm:true,expectedFingerprint}}),
    revokeWebsiteRegistration:(id:string,confirmation:string)=>request<{registrationId:string;status:string;operationId?:string;warning?:string}>('POST',`/website-registrations/${encodeURIComponent(id)}/revoke`,{body:{confirmation}}),
    previewWebsiteRevocation:(id:string)=>request<{registrationId:string;canRevoke:boolean;familyId:string|null;students:Array<{id:string;name:string|null;rollNumber:string|null;owned:boolean}>;blockers:string[];examinedRecords:number}>('GET',`/website-registrations/${encodeURIComponent(id)}/revoke-preview`),
    importWebsiteRegistration:(id:string,body:{preview?:boolean;linkFamilyId?:string;identityCorrection?:{personId:string;originalName:string;correctedName:string}}={})=>request<{imported?:boolean;alreadyImported?:boolean;registrationId:string;familyId?:string;familyNumber?:string;studentIds?:Record<string,string>;studentRollNumbers?:Record<string,string>;websiteSynced?:boolean;warning?:string;requiresFamilyConfirmation?:boolean;candidate?:{familyId:string;familyNumber:string;parentName:string;phone:string}|null;studentNames?:string[]}>('POST',`/website-registrations/${encodeURIComponent(id)}/import`,{body}),
    reviewWebsiteRegistration:(id:string,reviewStatus:'approved'|'discarded')=>request<unknown>('PATCH',`/website-registrations/${encodeURIComponent(id)}`,{body:{reviewStatus}}),
    listWebsiteRegistrations:(filters:Record<string,string>={})=>request<unknown>('GET','/website-registrations',{params:filters}),
    getParentAccessStatus:(id:string)=>request<{registrationId:string;imported:boolean;status:string;updatedAt:string|null}>('GET',`/website-registrations/${encodeURIComponent(id)}/access-status`),
    queueImportedParentLinks:(id:string)=>request<{queued:number;alreadyExists:number;status:string;message:string}>('POST',`/website-registrations/${encodeURIComponent(id)}/queue-parent-links`,{body:{}}),
    resendParentInvitation:(id:string)=>request<{status:string;message:string;requestedAt:string}>('POST',`/website-registrations/${encodeURIComponent(id)}/resend-parent-invitation`,{body:{}}),
    retryParentProvisioning:(id:string)=>request<{status:string;disabled?:boolean;alreadyProcessed?:boolean;reason?:string;message?:string}>('POST',`/website-registrations/${encodeURIComponent(id)}/provision-parent`,{body:{}}),
    getWebsiteRegistration:(id:string)=>request<unknown>('GET',`/website-registrations/${encodeURIComponent(id)}`),
    websiteRegistrationPhoto:(registrationId:string,personId:string)=>request<{url?:string;photoUrl?:string;presignedUrl?:string}>('GET',`/website-registrations/${encodeURIComponent(registrationId)}/photos/${encodeURIComponent(personId)}`),
    currentStaff:()=>request<StaffResponse>('GET','/me'),
    health:()=>request<{status:string;database:string;environment:string}>('GET','/health'),
    list:(resource: ResourceName,institution: InstitutionId,params?:Record<string,string>)=>request<ListResponse>('GET',`/${encodeURIComponent(resource)}`,{institution,params}),
    searchIdentity:(q: string)=>request<SearchResponse>('GET','/identities/search',{params:{q}}),
    create:(resource: ResourceName,institution: InstitutionId,data: ResourcePayload)=>request<{record:ApiRecord}>('POST',`/${encodeURIComponent(resource)}`,{institution,body:data}),
    update:(resource: ResourceName,id: string,institution: InstitutionId,changes: ResourcePayload,expectedVersion: number)=>request<{record:ApiRecord}>('PATCH',`/${encodeURIComponent(resource)}/${encodeURIComponent(id)}`,{institution,body:{...changes,expectedVersion}}),
    correctPractice:(institution: InstitutionId,studentId: string,date: string,changes: ResourcePayload,expectedVersion: number)=>request<{record:ApiRecord}>('PATCH',`/practice/${encodeURIComponent(studentId)}/${encodeURIComponent(date)}`,{institution,body:{...changes,expectedVersion}}),
    voidPractice:(institution: InstitutionId,studentId: string,date: string,reason: string,expectedVersion: number)=>request<{record:ApiRecord}>('PATCH',`/practice/${encodeURIComponent(studentId)}/${encodeURIComponent(date)}`,{institution,body:{action:'void',reason,expectedVersion}}),
  };
}
export type SadhanaApiClient = ReturnType<typeof createSadhanaApi>;
