import {srutiGuardianCandidates,requestSrutiGuardianFromRaaga} from './crossAcademyGuardian.ts';
import {learnerExtras,saveLearnerProfile,beginLearnerMedia,completeLearnerMedia,listLearnerMedia} from './learnerExtras.ts';
import {publishHomework,republishHomework,classHomework,learnerHomework,completeHomework,saveHomeworkSubmission,getHomeworkSubmission,teacherHomeworkSubmissions,teacherHomeworkFeedback,beginHomeworkEvidence,finishHomeworkEvidence,homeworkEvidenceLinks,teacherHomeworkEvidenceLinks,beginTeacherHomeworkMaterial,finishTeacherHomeworkMaterial,setTeacherHomeworkMaterials,teacherHomeworkMaterialLinks,learnerHomeworkMaterialLinks} from './homework.ts';
import {commentOnPractice,teacherPracticeComments,readPracticeComments} from './practiceFeedback.ts';
import {fetchWebsiteRegistration,reviewWebsiteRegistration} from './websiteRegistrationGateway.ts';
import {operations} from './academyOperations.ts';
import {importApprovedWebsiteRegistration} from './websiteRegistrationImport.ts';
import {getParentAccessStatus} from './parentAccessProvisioning.ts';
import {provisionParentAccount} from './parentAccountProvisioning.ts';
import {resendParentInvitation} from './resendParentInvitation.ts';
import {queueImportedParentLinks} from './parentLinkWorkflow.ts';
import {previewWebsiteRevocation} from './websiteRevocationPreflight.ts';
import {revokeWebsiteImport,cancelFencedWebsiteRevocation} from './websiteRegistrationRevocation.ts';
import {learnerDashboard,saveLearnerPractice,saveLearnerRsvp} from './studentLearning.ts';
import {myStudentLinks,requestStudentAccess,listAccessRequests,decideStudentAccess,myStudentOverview} from './familyAccess.ts';
import {previewRecurringClass,createRecurringClass} from './recurringClasses.ts';
/** Protected HTTP API for Sadhana. The AWS HTTP API JWT authorizer MUST run before this handler. */
import { SadhanaRepository } from './repository.ts';
import { apiRouteParts } from './apiRoute.ts';
import { listMiddlesbrough } from './calendarSync.ts';
import {listManagedEvents,saveManagedEvent,cancelManagedEvent,saveSharedEvent,cancelSharedEvent} from './eventManagement.ts';
import { listSchedule, changeSchedule, createSchedule, changeScheduleSeries, previewScheduleSeries, deleteScheduleSession, deleteSeriesSessions, deleteMasterClass, changeMasterLifecycle } from './scheduleStore.ts';
import type { ScheduleInstitution } from './scheduleModel.ts';
import type { PracticeChange } from './repository.ts';
import { httpError, permittedInstitutions, viewableInstitutions, RESOURCES } from './model.ts';
import {listTeachers,saveTeacher,myTeacherIdentity,verifiedTeacherInstitutions} from './teacherDirectory.ts';
import {listTeacherLinks,linkTeacherIdentity} from './teacherLinking.ts';
import {listAdministrators,inviteAdministrator,changeAdministratorAccess,updateAdministratorProfile} from './adminDirectory.ts';
import {ownProfilePhoto,uploadProfilePhoto,currentStaffDisplayName} from './profilePhotos.ts';
import type { Claims, InstitutionId, ResourceName, HttpError } from './model.ts';

interface SadhanaHttpEvent {
  rawPath?: string;
  path?: string;
  pathParameters?: { proxy?: string };
  httpMethod?: string;
  body?: string | null;
  isBase64Encoded?: boolean;
  queryStringParameters?: Record<string, string | undefined> | null;
  requestContext?: {
    stage?: string;
    http?: { method?: string };
    authorizer?: { jwt?: { claims?: Claims } };
  };
}
interface JsonResponse { statusCode: number; headers: Record<string,string>; body: string }
const json=(statusCode: number,body: unknown): JsonResponse=>({statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},body:JSON.stringify(body)});
const readPhotoJSON=(raw:string):Record<string,unknown>=>{
  if(raw.length>310000)throw httpError(413,'Profile photo upload exceeds the 220 KB image limit.');
  try{const value:unknown=JSON.parse(raw);return value as Record<string,unknown>;}
  catch{throw httpError(400,'Invalid photo upload request.');}
};
const readJSON=(raw: string): Record<string, any>=>{
  if(!raw)return {};
  if(raw.length>25000)throw httpError(413,'Request exceeds the permitted size.');
  try{ return JSON.parse(raw); }catch{throw httpError(400,'Invalid JSON request.');}
};

export function createHandler(repository: SadhanaRepository){
  return async (event: SadhanaHttpEvent): Promise<JsonResponse>=>{
    try {
      // CORS preflight is unauthenticated by design. API Gateway adds the
      // Allow-Origin/Methods/Headers response headers from CorsConfiguration.
      // All actual data operations still require a verified Cognito JWT.
      const requestMethod=event.requestContext?.http?.method ?? event.httpMethod;
      if(requestMethod==='OPTIONS') return {statusCode:204,headers:{'cache-control':'no-store'},body:''};
      // DO NOT use event.headers or a user-selected frontend persona as an identity.
      // API Gateway's JWT authorizer verifies signature, issuer, audience and expiry.
      const claims=event?.requestContext?.authorizer?.jwt?.claims;
      if(!claims?.sub) return json(401,{error:'Authenticated Cognito access token required.'});
      const groups=permittedInstitutions(claims);
      const viewed=viewableInstitutions(claims);
      // Account-access onboarding is available to authenticated users before any staff grant.
      const isAccessRoute=['family-access','me','learner'].includes(apiRouteParts(event)[0]);
      if(!viewed.length&&!isAccessRoute)return json(403,{error:'Staff role required.'});
      const parts=apiRouteParts(event);
      const method=event.requestContext?.http?.method ?? event.httpMethod;
      const query=event.queryStringParameters??{};
      const inst=query.institution as InstitutionId;
      if(method==='GET'&&parts[0]==='me'&&!viewed.length)return json(200,{
        subject:claims.sub,institutions:['raaga','sruti'],adminInstitutions:[],teacherInstitutions:[],role:'learner',displayName:'Student / Family'
      });
      if(method==='GET'&&parts[0]==='me')return json(200,{
        subject:claims.sub,institutions:viewed,adminInstitutions:groups,
        teacherInstitutions:(await verifiedTeacherInstitutions(claims.sub)).filter(i=>viewed.includes(i)),
        role:groups.length?'admin':'viewer',
        displayName:await currentStaffDisplayName(claims.sub),
        photoUrl:await ownProfilePhoto(claims.sub),
      });
      if(parts[0]==='teacher-practice'&&parts.length===3&&parts[2]==='comments'){
        if(method==='GET'){await teacherPracticeComments(inst,claims,parts[1]);return json(200,{records:await readPracticeComments(inst,parts[1])});}
        if(method==='POST')return json(201,await commentOnPractice(inst,claims,parts[1],readJSON(event.body||'')));
        return json(405,{error:'Unsupported comment action'});
      }
      if(parts[0]==='homework'&&parts.length===5&&parts[2]==='evidence'&&method==='GET')return json(200,await teacherHomeworkEvidenceLinks(inst,claims,parts[1],parts[3],parts[4]));
      if(parts[0]==='homework'&&parts.length===5&&parts[2]==='materials'){
        if(method==='GET'&&parts[4]==='links')return json(200,await teacherHomeworkMaterialLinks(inst,claims,parts[1],parts[3]));
        if(method==='POST'&&parts[4]==='selection')return json(200,await setTeacherHomeworkMaterials(inst,claims,parts[1],parts[3],readJSON(event.body||'')));
        if(method==='POST'&&parts[4]==='start')return json(200,await beginTeacherHomeworkMaterial(inst,claims,parts[1],parts[3],readJSON(event.body||'')));
        if(method==='POST'&&parts[4]==='finish')return json(200,await finishTeacherHomeworkMaterial(inst,claims,parts[1],parts[3],readJSON(event.body||'')));
      }
      if(parts[0]==='homework'&&parts.length===4&&parts[2]==='submissions'){
        if(method==='GET')return json(200,await teacherHomeworkSubmissions(inst,claims,parts[1],parts[3]));
        return json(405,{error:'Unsupported submission action'});
      }
      if(parts[0]==='homework'&&parts.length===5&&parts[2]==='feedback'&&method==='POST')return json(200,await teacherHomeworkFeedback(inst,claims,parts[1],parts[3],parts[4],readJSON(event.body||'')));
      if(parts[0]==='homework'&&parts.length===3&&method==='PUT')return json(200,await republishHomework(inst,claims,parts[1],parts[2],readJSON(event.body||'')));
      if(parts[0]==='homework'&&parts.length===2){
        if(method==='GET')return json(200,await classHomework(inst,claims,parts[1]));
        if(method==='POST')return json(201,await publishHomework(inst,claims,{...readJSON(event.body||''),classId:parts[1]}));
        return json(405,{error:'Unsupported homework action'});
      }
      if(parts[0]==='learner'&&parts.length>=3){
        const studentId=parts[1];
        if(parts.length===6&&parts[2]==='submission'&&parts[4]==='evidence'){
          if(method==='POST'&&parts[5]==='start')return json(200,await beginHomeworkEvidence(inst,claims,studentId,parts[3],readJSON(event.body||'')));
          if(method==='POST'&&parts[5]==='finish')return json(200,await finishHomeworkEvidence(inst,claims,studentId,parts[3],readJSON(event.body||'')));
        }
        if(parts.length===5&&parts[2]==='submission'&&parts[4]==='evidence'&&method==='GET')return json(200,await homeworkEvidenceLinks(inst,claims,studentId,parts[3]));
        if(parts.length===4&&parts[2]==='submission'){
          if(method==='GET')return json(200,await getHomeworkSubmission(inst,claims,studentId,parts[3]));
          if(method==='PUT')return json(200,await saveHomeworkSubmission(inst,claims,studentId,parts[3],readJSON(event.body||'')));
        }
        if(method==='GET'&&parts.length===5&&parts[2]==='homework'&&parts[4]==='materials')return json(200,await learnerHomeworkMaterialLinks(inst,claims,studentId,parts[3]));
        if(method==='GET'&&parts.length===3&&parts[2]==='homework')return json(200,await learnerHomework(inst,claims,studentId));
        if(method==='POST'&&parts.length===3&&parts[2]==='homework')return json(200,await completeHomework(inst,claims,studentId,readJSON(event.body||'')));
        if(method==='GET'&&parts.length===3&&parts[2]==='extras')return json(200,await learnerExtras(inst,claims,studentId));
        if(method==='PATCH'&&parts.length===3&&parts[2]==='profile')return json(200,await saveLearnerProfile(inst,claims,studentId,readJSON(event.body||'')));
        if(method==='POST'&&parts.length===4&&parts[2]==='media'&&parts[3]==='start')return json(200,await beginLearnerMedia(inst,claims,studentId,readJSON(event.body||'')));
        if(method==='POST'&&parts.length===4&&parts[2]==='media'&&parts[3]==='finish')return json(200,await completeLearnerMedia(inst,claims,studentId,readJSON(event.body||'')));
        if(method==='GET'&&parts.length===3&&parts[2]==='media')return json(200,await listLearnerMedia(inst,claims,studentId));
        if(method==='GET'&&parts.length===3&&parts[2]==='dashboard')return json(200,await learnerDashboard(inst,claims,studentId));
        if(method==='POST'&&parts.length===3&&parts[2]==='practice')return json(201,await saveLearnerPractice(inst,claims,studentId,readJSON(event.body||'')));
        if(method==='PATCH'&&parts.length===4&&parts[2]==='practice')return json(200,await saveLearnerPractice(inst,claims,studentId,readJSON(event.body||''),parts[3]));
        if(method==='PUT'&&parts.length===3&&parts[2]==='rsvp')return json(200,await saveLearnerRsvp(inst,claims,studentId,readJSON(event.body||'')));
        return json(405,{error:'Unsupported student action.'});
      }
      if(parts[0]==='family-access'){
        const body=method==='POST'?readJSON(event.body?event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body:''):{};
        if(method==='GET'&&parts[1]==='sruti-candidates')return json(200,await srutiGuardianCandidates(claims));
        if(method==='POST'&&parts[1]==='sruti-request')return json(201,await requestSrutiGuardianFromRaaga(claims,body));
        if(method==='GET'&&parts[1]==='mine'&&parts.length===2)return json(200,await myStudentOverview(inst,claims));
        if(method==='GET'&&parts[1]==='links'&&parts.length===2)return json(200,await myStudentLinks(inst,claims));
        if(method==='POST'&&parts[1]==='request'&&parts.length===2)return json(201,await requestStudentAccess(inst,claims,body));
        if(method==='GET'&&parts[1]==='requests'&&parts.length===2)return json(200,await listAccessRequests(inst,claims));
        if(method==='POST'&&parts[1]==='decide'&&parts.length===2)return json(200,await decideStudentAccess(inst,claims,body));
        return json(405,{error:'Unsupported account access action.'});
      }
      if(parts[0]==='photos'){
        if(method!=='POST'||parts.length!==2||!['me','administrator','teacher'].includes(parts[1]))
          return json(405,{error:'Unsupported photo action.'});
        const raw=event.body?(event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body):'';
        return json(200,await uploadProfilePhoto(readPhotoJSON(raw),claims,parts[1] as 'me'|'administrator'|'teacher'));
      }
      if(parts[0]==='administrators'){
        if(method==='GET'&&parts.length===1)
          return json(200,await listAdministrators(inst,claims));
        const body=readJSON(event.body?event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body:'');
        if(method==='POST'&&parts.length===2&&parts[1]==='invite')
          return json(201,await inviteAdministrator(body,claims));
        if(method==='POST'&&parts.length===2&&parts[1]==='access')
          return json(200,await changeAdministratorAccess(body,claims));
        if(method==='PATCH'&&parts.length===2&&parts[1]==='profile')
          return json(200,await updateAdministratorProfile(body,claims));
        return json(405,{error:'Unsupported administrator action.'});
      }
      // Sadhana staff JWT + academy permission is checked BEFORE the upstream IAM call.
      if(parts[0]==='website-registrations'){
        if(!groups.includes('raaga'))throw httpError(403,'Raagasudha administrator role required.');
        if(method==='POST'&&parts.length===3&&parts[2]==='queue-parent-links')return json(200,await queueImportedParentLinks(parts[1],claims));
        if(method==='POST'&&parts.length===3&&parts[2]==='resend-parent-invitation')return json(200,await resendParentInvitation(parts[1],claims.sub));
        if(method==='POST'&&parts.length===3&&parts[2]==='provision-parent'){return json(200,await provisionParentAccount(parts[1]));}
        if(method==='GET'&&parts.length===3&&parts[2]==='access-status')return json(200,await getParentAccessStatus(parts[1]));
        if(method==='GET'&&parts.length===3&&parts[2]==='revoke-preview')return json(200,await previewWebsiteRevocation(parts[1]));
        if(method==='POST'&&parts.length===3&&parts[2]==='revoke'){const body=readJSON(event.body?(event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body):'');return json(200,await revokeWebsiteImport(parts[1],claims.sub,body.confirmation));}
        if(method==='POST'&&parts.length===3&&parts[2]==='revoke-cancel'){const body=readJSON(event.body?(event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body):'');return json(200,await cancelFencedWebsiteRevocation(parts[1],claims.sub,body.confirmation));}
        if(method==='POST'&&parts.length===3&&parts[2]==='import'){const body=readJSON(event.body?(event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body):'');return json(200,await importApprovedWebsiteRegistration(parts[1],claims.sub,{preview:body.preview===true,linkFamilyId:typeof body.linkFamilyId==='string'?body.linkFamilyId:undefined,identityCorrection:body.identityCorrection}));}
        if(method==='PATCH'&&parts.length===2){
          const body = event.body ? JSON.parse(event.body) : {};
          const review = body?.reviewStatus;
          if(!['approved','discarded'].includes(review))throw httpError(400,'Invalid review status.');
          return json(200,await reviewWebsiteRegistration(parts[1],review,claims.sub));
        }
        if(method!=='GET')throw httpError(405,'Unsupported website registration action.');
        if(parts.length===1)return json(200,await fetchWebsiteRegistration(undefined,undefined,{
          status:query.status,locationId:query.locationId,from:query.from,to:query.to,limit:query.limit
        }));
        if(parts.length===2)return json(200,await fetchWebsiteRegistration(parts[1]));
        if(parts.length===4&&parts[2]==='photos')return json(200,await fetchWebsiteRegistration(parts[1],parts[3]));
        return json(404,{error:'Unknown website registration route.'});
      }
      if(parts[0]==='operations'&&parts.length>=2&&parts.length<=3){
        const body=readJSON(event.body?event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body:'');
        const result=await operations(query.institution||'',parts[1],method||'',claims,body,parts[2]||'');
        return json(method==='POST'?201:200,result);
      }
      if(parts[0]==='teachers'){
        if(method==='GET'&&parts.length===2&&parts[1]==='me')
          return json(200,await myTeacherIdentity(inst,claims));
        if(method==='GET'&&parts.length===1)
          return json(200,await listTeachers(inst,claims));

        if(method==='POST'&&parts.length===1){
          const body=readJSON(
            event.body
              ?event.isBase64Encoded
                ?Buffer.from(event.body,'base64').toString('utf8')
                :event.body
              :''
          );
          return json(201,await saveTeacher(body,claims));
        }

        if(method==='PATCH'&&parts.length===2){
          const body=readJSON(
            event.body
              ?event.isBase64Encoded
                ?Buffer.from(event.body,'base64').toString('utf8')
                :event.body
              :''
          );
          return json(200,await saveTeacher(body,claims,parts[1]));
        }

        return json(405,{error:'Unsupported teacher action.'});
      }
      if(method==='GET'&&parts[0]==='health')return json(200,{status:'ok',database:'configured',environment:'protected-api'});
      if(parts[0]==='recurring-classes'){
        const academy=query.institution as InstitutionId;
        if(academy!=='raaga'&&academy!=='sruti')throw httpError(400,'Choose an academy.');
        const body=readJSON(event.body?event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body:'');
        if(method==='POST'&&parts.length===2&&parts[1]==='preview')return json(200,await previewRecurringClass(academy,claims,body));
        if(method==='POST'&&parts.length===1)return json(201,await createRecurringClass(academy,claims,body));
        return json(405,{error:'Unsupported recurring-class action.'});
      }
      if(parts[0]==='events'&&parts[1]==='shared'){
        const body=readJSON(event.body?event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body:'');
        if(method==='POST'&&parts.length===2)return json(201,await saveSharedEvent(claims,body));
        if(method==='PATCH'&&parts.length===3)return json(200,await saveSharedEvent(claims,body,parts[2]));
        if(method==='DELETE'&&parts.length===3)return json(200,await cancelSharedEvent(claims,parts[2],body.expectedVersion));
        return json(405,{error:'Unsupported shared event action.'});
      }
      if(parts[0]==='events'){
        const academy=query.institution as InstitutionId;
        if(academy!=='raaga'&&academy!=='sruti')throw httpError(400,'Choose an academy.');
        if(method==='GET'&&parts.length===1)return json(200,await listManagedEvents(academy,claims));
        const body=readJSON(event.body?event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body:'');
        if(method==='POST'&&parts.length===1)return json(201,await saveManagedEvent(academy,claims,body));
        if(method==='PATCH'&&parts.length===2)return json(200,await saveManagedEvent(academy,claims,body,parts[1]));
        if(method==='DELETE'&&parts.length===2)return json(200,await cancelManagedEvent(academy,claims,parts[1],body.expectedVersion));
        return json(405,{error:'Unsupported event action.'});
      }
      // Sadhana-owned, individually editable timetable (never invokes Google Calendar).
      if(parts[0]==='schedule') {
        const target=query.institution as ScheduleInstitution;
        if(!['raaga','sruti','shared'].includes(target))throw httpError(400,'Choose institution=raaga, sruti or shared.');
        if(parts[1]==='teacher-links'){
          if(method==='GET'&&parts.length===2&&target!=='shared')return json(200,await listTeacherLinks(target,claims));
          if(method==='PATCH'&&parts.length===3&&target!=='shared'){
            const linkBody=readJSON(event.body?event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body:'');
            return json(200,await linkTeacherIdentity(target,parts[2],linkBody,claims));
          }
          return json(405,{error:'Unsupported teacher-link action.'});
        }
        if(method==='GET'&&parts.length===1)return json(200,await listSchedule(target,claims));
        const body=readJSON(event.body?event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body:'');
        if(method==='POST'&&parts.length===1)return json(201,await createSchedule(target,body,claims));
        if(method==='POST'&&parts.length===4&&parts[1]==='series'&&parts[3]==='preview')return json(200,await previewScheduleSeries(target,parts[2],body,claims));
        if(method==='POST'&&parts.length===4&&parts[1]==='master'&&parts[3]==='delete-preview')return json(200,await deleteMasterClass(target,parts[2],body,claims,true));
        if(method==='DELETE'&&parts.length===3&&parts[1]==='master')return json(200,await deleteMasterClass(target,parts[2],body,claims,false));
        if(method==='POST'&&parts.length===4&&parts[1]==='series'&&parts[3]==='delete-preview')return json(200,await deleteSeriesSessions(target,parts[2],body,claims,true));
        if(method==='DELETE'&&parts.length===3&&parts[1]==='series')return json(200,await deleteSeriesSessions(target,parts[2],body,claims,false));
        if(method==='PATCH'&&parts.length===3&&parts[1]==='series')return json(200,await changeScheduleSeries(target,parts[2],body,claims));
        if(method==='PATCH'&&parts.length===4&&parts[1]==='master'&&parts[3]==='lifecycle')return json(200,await changeMasterLifecycle(target,parts[2],body,claims));
        if(method==='PATCH'&&parts.length===2)return json(200,await changeSchedule(target,parts[1],body,claims));
        if(method==='DELETE'&&parts.length===2)return json(200,await deleteScheduleSession(target,parts[1],body,claims));
        return json(405,{error:'Unsupported schedule action.'});
      }
      // Legacy Middlesbrough mirror can still be read, but Google syncing is retired.
      if(parts[0]==='calendar' && parts[1]==='middlesbrough') {
        if (!groups.includes('raaga')) throw httpError(403,'Raagasudha administrator role required.');
        if(method==='GET' && parts.length===2) return json(200,await listMiddlesbrough());
        if(method==='POST' && parts[2]==='sync')return json(410,{error:'Google Calendar sync has been retired. Manage the timetable directly in Sadhana.'});
        return json(405,{error:'Unsupported calendar action.'});
      }

      if(method==='GET'&&parts[0]==='identities'&&parts[1]==='search')return json(200,await repository.identitySearch(claims,query.q));
      if(method==='GET'&&parts[0]==='audit'){
        const institution=inst;
        if(!groups.includes(institution))throw httpError(403,'Access denied.');
        const page=await repository.queryBase(`AUDIT#${institution}`,100);
        return json(200,{records:page.items.map(({PK,SK,entityType,...r})=>r),more:page.nextPage});
      }
      const resource=parts[0] as ResourceName;
      if(!RESOURCES.includes(resource))return json(404,{error:'Unknown endpoint.'});
      if(method==='GET'&&parts.length===1)return json(200,await repository.list(resource,inst,claims,{studentId:query.studentId}));
      const data=readJSON(event.body?event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body:'');
      if(method==='POST'&&parts.length===1)return json(201,{record:await repository.create(resource,data,inst,claims)});
      if(method==='PATCH'&&resource==='practice'&&parts.length===3){
        const args={...data,institution:inst,studentId:parts[1],date:parts[2]} as PracticeChange;
        return json(200,{record:data.action==='void' ? await repository.voidPractice(args,claims):await repository.correctPractice(args,claims)});
      }
      if(method==='PATCH'&&parts.length===2)return json(200,{record:await repository.patch(resource,parts[1],data,inst,claims)});
      if(method==='DELETE')return json(405,{error:'Physical deletion and archive transitions require additional policy and dependency checks. This API does not perform hard deletes.'});
      return json(405,{error:'Method not supported.'});
    }catch(error: unknown){
      const e=error as HttpError;
      const status=Number.isInteger(e?.status)?e.status:500;
      // Never echo internal DynamoDB errors or private records to the caller.
      if(status===500)console.error('Sadhana API internal error', {name:e.name,message:e.message});
      return json(status,{error:status===500?'Unable to complete the operation.':e.message});
    }
  };
}
let cachedHandler: ReturnType<typeof createHandler> | undefined;
export const handler=async (event: SadhanaHttpEvent): Promise<JsonResponse>=>{
  if(!cachedHandler)cachedHandler=createHandler(new SadhanaRepository());
  return cachedHandler(event);
};
