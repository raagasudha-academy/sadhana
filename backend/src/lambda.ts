import {SadhanaRepository} from './repository.ts';
import {makeM95DirectoryRoutes} from './routes/directoryRoutes.ts';
import {makeM10CoreDirectoryRoutes} from './routes/coreDirectoryRoutes.ts';
import {m10AcademyWriteRoutes} from './routes/academyWriteRoutes.ts';
import {apiRouteParts} from './apiRoute.ts';
import type {PracticeChange} from './repository.ts';
import {isSuperAdmin, httpError, permittedInstitutions, viewableInstitutions, demandInstitution, demandViewInstitution, RESOURCES} from './model.ts';
import {verifiedTeacherInstitutions} from './teacherDirectory.ts';
import {ownProfilePhoto, currentStaffDisplayName, uploadProfilePhoto} from './profilePhotos.ts';
import {getOwnProfile, saveOwnProfile} from './selfProfile.ts';
import type {InstitutionId, ResourceName, HttpError} from './model.ts';
import {json, readJSON, readPhotoJSON} from './routes/http.ts';
import type {SadhanaHttpEvent, JsonResponse} from './routes/http.ts';
import {learningRoutes} from './routes/learningRoutes.ts';
import {learningResourcesRoutes} from './routes/learningResourcesRoutes.ts';
import {m10LearningCutoverRoutes} from './routes/learningCutoverRoutes.ts';
import {m10TeacherPracticeRoutes} from './routes/teacherPracticeRoutes.ts';
import {m9FinalLearnerRoutes} from './routes/finalLearnerRoutes.ts';
import {familyRoutes} from './routes/familyRoutes.ts';
import {staffRoutes} from './routes/staffRoutes.ts';
import {registrationRoutes} from './routes/registrationRoutes.ts';
import {m10RegistrationCutoverRoutes} from './routes/registrationCutoverRoutes.ts';
import {m10IdentityFrontendRoutes} from './routes/identityFrontendRoutes.ts';
import {m10OperationalReadRoutes,finalOperationalReader} from './routes/operationalReadRoutes.ts';
import {m95GuardianRegistrationRoutes} from './routes/guardianRegistrationRoutes.ts';
import {operationsRoutes} from './routes/operationsRoutes.ts';
import {calendarRoutes} from './routes/calendarRoutes.ts';
import {m95CalendarWriteRoutes} from './routes/calendarWriteRoutes.ts';
import {m95SeriesWriteRoutes} from './routes/seriesWriteRoutes.ts';
import {m95ManagedEventWriteRoutes} from './routes/managedEventWriteRoutes.ts';
import {m95CompatibilityRoutes} from './routes/compatibilityRoutes.ts';
import {m9Routes} from './routes/routes.ts';
import {m9WriteRoutes} from './routes/writeRoutes.ts';
import {m9CutoverFence} from './cutoverFence.mjs';
import {m9HomeworkRoutes} from './routes/homeworkRoutes.ts';
import {m10AuthoritativeSchedulingRoutes} from './routes/authoritativeSchedulingRoutes.ts';
import {m10CoreFrontendWriteRoutes} from './routes/coreFrontendWriteRoutes.ts';
import {m10CoreDirectoryAuthoritativeRoutes} from './routes/coreDirectoryAuthoritativeRoutes.ts';
import {m10FrontendAcademyRoutes} from './routes/frontendAcademyRoutes.ts';
import {finalOnlyGate} from './finalBoundary.mjs';
import {finalCascadeDeletionRoute} from './finalCascadeDeletion.mjs';
import {makeFinalCascadeDeletionService} from './finalCascadeDeletionService.mjs';
import {finalCognitoSelfRoute} from './finalCognitoSelf.mjs';
import {finalReadRoute} from './finalReadRoutes.mjs';
import {finalOperationsRoute} from './finalOperations.mjs';
import {finalOperationsEnrolmentWriteRoute} from './finalOperationsEnrolmentWrite.mjs';
import {finalTeacherPatchRoute} from './finalTeacherPatch.mjs';
import {finalTeacherPatch} from './finalTeacherPatchData.ts';
import {finalTeacherCreateRoute} from './finalTeacherCreate.mjs';
import {finalTeacherCreate} from './finalTeacherCreateData.ts';
import {finalOperationsHistory} from './finalOperationsHistory.ts';
import {finalOperationsFeedback} from './finalOperationsFeedback.ts';
import {finalAttendance} from './finalAttendance.ts';
import {finalTeacherStudents} from './finalTeacherStudents.ts';
import {finalTeacherEnrolments} from './finalTeacherEnrolments.ts';
import {finalFamilyAccessRoute} from './finalFamilyAccess.mjs';
import {m10FinalFamilyAccessReader} from './finalFamilyAccessData.ts';
import {finalSchedulingWriteRoute} from './finalSchedulingWrites.mjs';
import {finalCoreIdentityRoute} from './finalCoreIdentity.mjs';
import {finalRegistrationRoute} from './finalRegistration.mjs';
import {finalSrutiExistingImporter} from './srutiExistingImport.mjs';
import {finalSrutiParentAction,finalSrutiParentStatus} from './finalSrutiInvitations.ts';
import {finalRaagaIntakeRoute} from './finalRaagaIntake.mjs';
import {finalRaagaParentStatus} from './finalRaagaParentStatus.ts';
import {m10FinalRaagaParentAction} from './finalRaagaParentActionsData.ts';
import {fetchWebsiteRegistration,reviewWebsiteRegistration} from './websiteRegistrationGateway.ts';
import {m95ImportApprovedWebsiteRegistration,m95ReconcileWebsiteImport} from './websiteImport.ts';
import {finalLearningRoute} from './finalLearning.mjs';
import {finalMessagesRoute} from './finalMessages.mjs';
import {isMessageRoute} from './messageRoutePolicy.mjs';
import {finalAdministratorRoute} from './finalAdministrator.mjs';
import {listAdministrators,inviteAdministrator,changeAdministratorAccess,updateAdministratorProfile} from './adminDirectory.ts';
import {requireAdminManager} from './adminPolicy.ts';
import {m10FinalLearnerProfiles} from './finalLearnerProfilesData.ts';
import {m10FinalLearnerMedia} from './finalLearnerMedia.ts';
import {filterVenuesForInstitution} from './venueVisibility.ts';
import {finalMessages} from './finalMessages.ts';
import {m9FinalLearner} from './finalLearner.ts';
import {m9LearnerWrites} from './learnerWrites.ts';
import {m9Homework} from './legacyHomework.ts';
import {m10CoreWriteService} from './coreWriteService.ts';
import {m95GuardianService} from './guardianRegistration.ts';
import {m10FinalGuardianQueueReader} from './finalGuardianQueueData.ts';
import {defaultM95CalendarWriter} from './calendarWrite.ts';
import {defaultM10FinalScheduleSessionAdmin} from './finalScheduleSessionAdmin.ts';
import {defaultM95SeriesWriter} from './seriesWrite.ts';
import {defaultM95ManagedEventWriter} from './managedEventWrite.ts';
import {entityTable} from './entityTables.mjs';
import {defaultM95Reader} from './compatibility.ts';
import {defaultM95DirectoryReader} from './directoryCompatibility.ts';
import {defaultM10CoreDirectoryReader} from './coreDirectory.ts';



export function createHandler(repository: SadhanaRepository){
  const m10CoreDirectoryRoutes=makeM10CoreDirectoryRoutes(undefined,(entity,inst,claims)=>repository.list(entity,inst,claims) as Promise<{records:Record<string,any>[];more:boolean}>);
  const m95DirectoryRoutes=makeM95DirectoryRoutes(
   undefined,
   (inst,claims)=>repository.list('venues',inst,claims) as Promise<{records:Record<string,any>[];more:boolean}>,
   undefined,undefined,
   (inst,claims)=>repository.list('classes',inst,claims) as Promise<{records:Record<string,any>[];more:boolean}>
  );
  // Construct canonical readers lazily. Normal M9/live mode never initialises
  // these clients and continues using its existing route dispatch.
  let finalReads: Parameters<typeof finalReadRoute>[1] | undefined;
  const getFinalReads = (): Parameters<typeof finalReadRoute>[1] => {
    if (finalReads) return finalReads;
    const scheduleReader=defaultM95Reader();
    const directoryReader=defaultM95DirectoryReader();
    const coreReader=defaultM10CoreDirectoryReader();
    return finalReads={
      assertConfigured:()=>{entityTable('people');},
      schedule:inst=>scheduleReader.schedule(inst),
      directory:(action,inst,claims)=>directoryReader[action](inst,claims),
      managedEvents:inst=>scheduleReader.managedEvents(inst),
      core:(entity,inst,claims)=>coreReader.list(entity,inst,claims),
      audit:inst=>finalOperationalReader.audit(inst),
      practice:(inst,studentId)=>finalOperationalReader.practice(inst,studentId),
      profile:sub=>getOwnProfile(sub),
    };
  };
  const finalAccess: Parameters<typeof finalReadRoute>[2]={
    view:demandViewInstitution,admin:demandInstitution,isSuperAdmin,
    viewableInstitutions,permittedInstitutions,
    forbid:message=>{throw httpError(403,message);},
    badInstitution:()=>{throw httpError(400,'Choose a valid institution.');},
    badStudent:()=>{throw httpError(400,'Valid studentId required.');},
  };
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
      if(process.env.M95_COMPAT_MODE==='pilot' && process.env.SADHANA_ENTITY_TABLE_SET!=='final' && !['GET','HEAD','OPTIONS'].includes(String(requestMethod))) {
        const p=apiRouteParts(event);
        const calendarWrite=(requestMethod==='POST'&&p.length===1&&p[0]==='schedule') || (requestMethod==='PATCH'&&p.length===2&&p[0]==='schedule') || (process.env.M95_SERIES_WRITES==='enabled' && ((requestMethod==='PATCH'&&p.length===3&&p[0]==='schedule'&&p[1]==='series') || (requestMethod==='POST'&&p.length===4&&p[0]==='schedule'&&p[1]==='series'&&p[3]==='preview')));
        const managedEventWrite=process.env.M95_MANAGED_EVENT_WRITES==='enabled' && (
          (p[0]==='events' && ((requestMethod==='POST' && (p.length===1 || (p.length===2 && p[1]==='shared'))) ||
          ((requestMethod==='PATCH'||requestMethod==='DELETE') && (p.length===2 || (p.length===3 && p[1]==='shared'))))));
        // Cognito/S3-only self-service is independent of DynamoDB migration.
        const finalCognitoSelfWrite=process.env.SADHANA_ENTITY_TABLE_SET==='final' &&
          ((requestMethod==='PATCH'&&p.length===2&&p[0]==='me'&&p[1]==='profile') ||
           (requestMethod==='POST'&&p.length===2&&p[0]==='photos'&&p[1]==='me'));
        const srutiRegistrationReview=process.env.M10_REGISTRATION_M9_READS==='enabled' &&
          process.env.M95_ONBOARDING_MODE==='enabled' &&
          process.env.M91_SRUTI_REVIEW_WRITES==='enabled' &&
          requestMethod==='PATCH' && p.length===2 && p[0]==='website-registrations' &&
          event.queryStringParameters?.institution==='sruti';
        if(!srutiRegistrationReview && !finalCognitoSelfWrite && ((process.env.M95_CALENDAR_WRITES!=='enabled' && !managedEventWrite) || (!calendarWrite && !managedEventWrite)))
          return json(503,{error:'M9 pilot: this write workflow is disabled. Switch M95_COMPAT_MODE=off to restore the legacy API.'});
      }
      if(!claims?.sub) return json(401,{error:'Authenticated Cognito access token required.'});
      const groups=permittedInstitutions(claims);
      const viewed=viewableInstitutions(claims);
      // Account-access onboarding is available to authenticated users before any staff grant.
      const routeParts=apiRouteParts(event);
      // Authenticated users may manage only their own photo, never staff targets.
      // uploadProfilePhoto validates the payload and derives identity from claims.sub.
      const isOwnPhotoRoute=requestMethod==='POST' && routeParts.length===2 &&
        routeParts[0]==='photos' && routeParts[1]==='me';
      // Learner and guardian messaging is authenticated by Cognito here, then
      // restricted to the verified person, institution and class in finalMessagesRoute.
      const isAccessRoute=['family-access','me','learner','m9-onboarding','learning-resources'].includes(routeParts[0]) || isOwnPhotoRoute || isMessageRoute(requestMethod,routeParts);
      if(!viewed.length&&!isAccessRoute)return json(403,{error:'Staff role required.'});
      const parts=apiRouteParts(event);
      const method=event.requestContext?.http?.method ?? event.httpMethod;
      const query=event.queryStringParameters??{};
      const inst=query.institution as InstitutionId;
      const routeContext={event,parts,method,query,inst,claims,groups};
      {const response=await learningResourcesRoutes(routeContext);if(response)return response;}
      // Final-schema read dispatch has priority over legacy/M9 pilot fallbacks.
      // Only the exact audited GET endpoints are allowed here.
      if(process.env.SADHANA_ENTITY_TABLE_SET==='final'){
        const finalRead=await finalReadRoute(routeContext,getFinalReads(),finalAccess);
        if(finalRead)return json(finalRead.status,finalRead.body);
        const operationsRead=await finalOperationsRoute(routeContext,{
          ...getFinalReads(),teacherStudents:finalTeacherStudents(),teacherEnrolments:finalTeacherEnrolments(),attendance:finalAttendance(),history:finalOperationsHistory(),feedback:finalOperationsFeedback(),
        },finalAccess);
        if(operationsRead)return json(operationsRead.status,operationsRead.body);
      }
      // Legacy dashboard enrolment POST -> canonical transactional writer, never PK/SK.
      {const enrolled=await finalOperationsEnrolmentWriteRoute(routeContext,{
        assertConfigured:()=>{entityTable('people');entityTable('classes');entityTable('enrolments');entityTable('counters');entityTable('audit');},
        parse:request=>readJSON(request.body?(request.isBase64Encoded?Buffer.from(request.body,'base64').toString('utf8'):request.body):'{}'),
        core:m10CoreWriteService,
      },{admin:demandInstitution});if(enrolled)return json(enrolled.status,enrolled.body);}
      {const teacherPatch=await finalTeacherPatchRoute(routeContext,{
        parse:request=>readJSON(request.body?(request.isBase64Encoded?Buffer.from(request.body,'base64').toString('utf8'):request.body):'{}'),
        patch:finalTeacherPatch(),
      },{admin:demandInstitution});if(teacherPatch)return json(teacherPatch.status,teacherPatch.body);}
      {const teacherCreate=await finalTeacherCreateRoute(routeContext,{
        assertConfigured:()=>{entityTable('people');entityTable('counters');entityTable('audit');},
        parse:request=>readJSON(request.body?(request.isBase64Encoded?Buffer.from(request.body,'base64').toString('utf8'):request.body):'{}'),
        create:finalTeacherCreate(),
      },{admin:demandInstitution});if(teacherCreate)return json(teacherCreate.status,teacherCreate.body);}
      // The learner portal must discover its verified students before loading
      // dashboard or homework. Read canonical people/approved guardian links only.
      {const family=await finalFamilyAccessRoute(routeContext,{
        assertConfigured:()=>{entityTable('people');entityTable('family-links');},
        reader:m10FinalFamilyAccessReader,
      });if(family)return json(family.status,family.body);}
      // Final-schema calendar and managed event writes get first refusal.
      // This route is disabled by default and cannot fall through to PK/SK.
      {const result=await finalSchedulingWriteRoute(routeContext,{
        assertConfigured:()=>{for(const entity of ['classes','sessions','people','enrolments','attendance','rsvps','homework','submissions','events','audit'])entityTable(entity);},
        parse:request=>readJSON(request.body?(request.isBase64Encoded?Buffer.from(request.body,'base64').toString('utf8'):request.body):''),
        calendar:defaultM95CalendarWriter,
        sessions:defaultM10FinalScheduleSessionAdmin,
        series:defaultM95SeriesWriter,
        events:defaultM95ManagedEventWriter,
      },{
        admin:demandInstitution,view:demandViewInstitution,viewableInstitutions,permittedInstitutions,
        deny:()=>{throw httpError(403,'Staff access required.');},
      });if(result)return json(result.status,result.body);}
      // Canonical transactional core and independently reviewed guardian writes.
      // In final-table mode all other identity/registration routes stay closed.
      {const coreIdentityDependencies={
        assertConfigured:()=>{entityTable('families');entityTable('people');entityTable('family-links');entityTable('enrolments');entityTable('counters');entityTable('audit');},
        parse:request=>readJSON(request.body?(request.isBase64Encoded?Buffer.from(request.body,'base64').toString('utf8'):request.body):''),
        core:m10CoreWriteService,
        guardian:m95GuardianService,guardianReader:m10FinalGuardianQueueReader,
      } satisfies Parameters<typeof finalCoreIdentityRoute>[1] & {guardianReader:typeof m10FinalGuardianQueueReader};
      const result=await finalCoreIdentityRoute(routeContext,coreIdentityDependencies,{admin:demandInstitution});
      if(result)return json(result.status,result.body);}
      // Sruti intake is still a separate live writer; the final facade refuses
      // access until that writer is explicitly switched and reconciled.
      {const result=await finalRegistrationRoute(routeContext,{
        assertConfigured:()=>{entityTable('registrations');entityTable('families');entityTable('people');entityTable('family-links');entityTable('audit');entityTable('counters');},
        parse:request=>readJSON(request.body?(request.isBase64Encoded?Buffer.from(request.body,'base64').toString('utf8'):request.body):'{}'),
        existingImport:finalSrutiExistingImporter(),
        freshImport:(id,claims,execute)=>m95ImportApprovedWebsiteRegistration('sruti',claims,id,execute,'fresh',true),
        parentStatus:finalSrutiParentStatus,
        parentAction:(_action,id,actorSub,confirmReference)=>finalSrutiParentAction(_action,id,actorSub,confirmReference),
        registration:m10RegistrationCutoverRoutes,
        raaga:context=>{const raagaDependencies={
          assertConfigured:()=>{entityTable('registrations');entityTable('families');entityTable('people');},
          parse:request=>readJSON(request.body?(request.isBase64Encoded?Buffer.from(request.body,'base64').toString('utf8'):request.body):''),
          list:filters=>fetchWebsiteRegistration(undefined,undefined,filters),
          get:id=>fetchWebsiteRegistration(id),
          photo:(id,person)=>fetchWebsiteRegistration(id,person),
          parentStatus:finalRaagaParentStatus,
          parentAction:m10FinalRaagaParentAction,
          review:reviewWebsiteRegistration,
          preview:(id,claims)=>m95ImportApprovedWebsiteRegistration('raaga',claims,id,false,'fresh'),
          execute:(id,claims)=>m95ImportApprovedWebsiteRegistration('raaga',claims,id,true,'fresh'),
          sync:(id,claims)=>m95ReconcileWebsiteImport('raaga',claims,id,true),
        } satisfies Parameters<typeof finalRaagaIntakeRoute>[1] & {parentStatus:typeof finalRaagaParentStatus;parentAction:typeof m10FinalRaagaParentAction};
        return finalRaagaIntakeRoute(context,raagaDependencies);},
      },{admin:demandInstitution});if(result)return json(result.status,result.body);}
      // Reuse canonical M9 learner, homework and teacher-practice business
      // services with separate final-only flags and no PK/SK fallback.
      {const learningDependencies={
        assertConfigured:()=>{entityTable('people');entityTable('homework');entityTable('submissions');entityTable('audit');},
        parse:request=>readJSON(request.body?(request.isBase64Encoded?Buffer.from(request.body,'base64').toString('utf8'):request.body):''),
        learner:m9FinalLearner,learnerWrites:m9LearnerWrites,homework:m9Homework,
        learnerProfiles:m10FinalLearnerProfiles,learnerMedia:m10FinalLearnerMedia,
        teacherPractice:m10TeacherPracticeRoutes,
      } satisfies Parameters<typeof finalLearningRoute>[1] & {learnerProfiles:typeof m10FinalLearnerProfiles;learnerMedia:typeof m10FinalLearnerMedia};
      const result=await finalLearningRoute(routeContext,learningDependencies);
      if(result)return json(result.status,result.body);}
      {const result=await finalMessagesRoute(routeContext,{
        assertConfigured:()=>{entityTable('people');entityTable('classes');entityTable('enrolments');entityTable('notifications');entityTable('audit');},
        service:finalMessages,
        permittedInstitutions,
        parse:request=>readJSON(request.body?(request.isBase64Encoded?Buffer.from(request.body,'base64').toString('utf8'):request.body):'')
      });if(result)return json(result.status,result.body);}
      // Administrator directory and account controls are Cognito-only. They
      // retain the protected designated-manager check and independent opt-ins.
      {const result=await finalAdministratorRoute(routeContext,{
        list:listAdministrators,invite:inviteAdministrator,
        changeAccess:changeAdministratorAccess,updateProfile:updateAdministratorProfile,
        parse:readJSON,
      },{
        admin:demandInstitution,
        manager:identity=>requireAdminManager(identity,process.env.SADHANA_SUPER_ADMIN_SUB||''),
      });if(result)return json(result.status,result.body);}
      // Cognito/S3-only self-service remains available in final mode.
      {const self=await finalCognitoSelfRoute(routeContext,{
        getProfile:getOwnProfile, saveProfile:saveOwnProfile,
        uploadOwnPhoto:(value,identity)=>uploadProfilePhoto(value,identity,'me'),
      },{readJSON,readPhotoJSON});if(self)return json(self.status,self.body);}
      // Canonical Super Admin cascade: no legacy fallback and execution is release-gated.
      {const result=await finalCascadeDeletionRoute(routeContext,{
        isSuperAdmin,
        parse:request=>readJSON(request.body?(request.isBase64Encoded?Buffer.from(request.body,'base64').toString('utf8'):request.body):''),
        service:makeFinalCascadeDeletionService(),
      });if(result)return json(result.status,result.body);}
      // Canonical final mode MUST stop here. M10 pilot, M9 onboarding,
      // legacy identity, and the PK/SK repository below are NOT final routes.
      // This also prevents a legacy write switch from exposing an unreviewed
      // handler when final-table mode is selected.
      if(process.env.SADHANA_ENTITY_TABLE_SET==='final'){
        {const blocked=finalOnlyGate(parts,method,'early');if(blocked)return json(blocked.status,{error:blocked.error});}
        if(method==='GET'&&parts.length===1&&parts[0]==='health')
          return json(200,{status:'ok',database:'configured',environment:'final-tables'});
        {const blocked=finalOnlyGate(parts,method,'fallback');if(blocked)return json(blocked.status,{error:blocked.error});}
        return json(503,{error:'Final-table cutover: unsupported route.'});
      }
      // Guard against silently falling back to PK/SK data when M9 testing is enabled.
      // Do not turn on in the existing live API: blocked paths intentionally return 503.
      {const response=await m10AuthoritativeSchedulingRoutes(routeContext);if(response)return response;}
      {const response=await m10IdentityFrontendRoutes(routeContext);if(response)return response;}
      {const response=await m10RegistrationCutoverRoutes(routeContext);if(response)return response;}
      {const response=await m10OperationalReadRoutes(routeContext);if(response)return response;}
      const m9Fence=m9CutoverFence(parts,method,{
        learnerReads:process.env.M9_FINAL_LEARNER_READS==='enabled',
        learnerWrites:process.env.M9_LEARNER_WRITES==='enabled',
        homeworkWrites:process.env.M9_HOMEWORK_WRITES==='enabled',
        media:process.env.M9_HOMEWORK_MEDIA==='enabled',
        onboarding:process.env.M95_ONBOARDING_MODE==='enabled',
        teacherPractice:process.env.M10_TEACHER_PRACTICE_M9==='enabled',
        coreDirectory:process.env.M10_CORE_DIRECTORY_ROUTING==='enabled',
        coreWrites:process.env.M10_CORE_FRONTEND_WRITES==='enabled' && process.env.M9_TARGET_REPOSITORY_WRITES==='enabled',
        m9Routes:true,
      });
      if(m9Fence)return json(m9Fence.status,{error:m9Fence.error});
      if(parts[0]==='me'&&parts[1]==='profile'&&parts.length===2){
        if(method==='GET')return json(200,await getOwnProfile(claims.sub));
        if(method==='PATCH')return json(200,await saveOwnProfile(claims.sub,readJSON(event.body||'')));
        return json(405,{error:'Unsupported profile action.'});
      }
      if(method==='GET'&&parts[0]==='me'&&!viewed.length)return json(200,{
        subject:claims.sub,institutions:['raaga','sruti'],adminInstitutions:[],teacherInstitutions:[],role:'learner',displayName:'Student / Family'
      });
      if(method==='GET'&&parts[0]==='me')return json(200,{
        subject:claims.sub,institutions:viewed,adminInstitutions:groups,isSuperAdmin:isSuperAdmin(claims),
        teacherInstitutions:(await verifiedTeacherInstitutions(claims.sub)).filter(i=>viewed.includes(i)),
        role:groups.length?'admin':'viewer',
        displayName:await currentStaffDisplayName(claims.sub),
        photoUrl:await ownProfilePhoto(claims.sub),
      });
      {const response=await m10AcademyWriteRoutes(routeContext);if(response)return response;}
      {const response=await m10FrontendAcademyRoutes(routeContext);if(response)return response;}
      {const response=await m10CoreFrontendWriteRoutes(routeContext);if(response)return response;}
      {const response=await m10CoreDirectoryAuthoritativeRoutes(routeContext);if(response)return response;}
      {const response=await m9WriteRoutes(routeContext);if(response)return response;}
      {const response=await m9Routes(routeContext);if(response)return response;}
      {const response=await m9FinalLearnerRoutes(routeContext);if(response)return response;}
      {const response=await m9HomeworkRoutes(routeContext);if(response)return response;}
      {const response=await m10TeacherPracticeRoutes(routeContext);if(response)return response;}
      {const response=await m10LearningCutoverRoutes(routeContext);if(response)return response;}
      // M9 teacher/venue pilot reads are permitted before the final-only fence.
      // Shadow reads, which require the legacy repository, are NOT permitted.
      if(process.env.SADHANA_ENTITY_TABLE_SET==='final'&&process.env.M95_COMPAT_MODE==='pilot'){
        const response=await m95DirectoryRoutes(routeContext);if(response)return response;
      }
      {const response=await learningRoutes(routeContext);if(response)return response;}
      {const response=await familyRoutes(routeContext);if(response)return response;}
      {const response=await m10CoreDirectoryRoutes(routeContext);if(response)return response;}
      {const response=await m95DirectoryRoutes(routeContext);if(response)return response;}
      {const response=await staffRoutes(routeContext);if(response)return response;}
      {const response=await m95GuardianRegistrationRoutes(routeContext);if(response)return response;}
      {const response=await registrationRoutes(routeContext);if(response)return response;}
      {const response=await operationsRoutes(routeContext);if(response)return response;}
      if(method==='GET'&&parts[0]==='health')return json(200,{status:'ok',database:'configured',environment:'protected-api'});
      {const response=await m95CompatibilityRoutes(routeContext);if(response)return response;}
      {const response=await m95ManagedEventWriteRoutes(routeContext);if(response)return response;}
      {const response=await m95SeriesWriteRoutes(routeContext);if(response)return response;}
      {const response=await m95CalendarWriteRoutes(routeContext);if(response)return response;}
      {const response=await calendarRoutes(routeContext);if(response)return response;}

      if(method==='GET'&&parts[0]==='identities'&&parts[1]==='search')return json(200,await repository.identitySearch(claims,query.q));
      if(method==='GET'&&parts[0]==='audit'){
        const institution=inst;
        if(!groups.includes(institution))throw httpError(403,'Access denied.');
        const page=await repository.queryBase(`AUDIT#${institution}`,100);
        return json(200,{records:page.items.map(({PK,SK,entityType,...r})=>r),more:page.nextPage});
      }
      const resource=parts[0] as ResourceName;
      if(!RESOURCES.includes(resource))return json(404,{error:'Unknown endpoint.'});
      if(method==='GET'&&parts.length===1){
        const result=await repository.list(resource,inst,claims,{studentId:query.studentId});
        if(resource==='venues'){
          const classes=await repository.list('classes',inst,claims);
          result.records=filterVenuesForInstitution(inst,result.records,classes.records);
        }
        return json(200,result);
      }
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
  if(!cachedHandler)cachedHandler=createHandler(new SadhanaRepository({
    // Deliberately invalid table name: canonical handlers do not use the PK/SK repository.
    // A regression into a legacy handler must fail closed, not read a retired table.
    tableName:process.env.SADHANA_ENTITY_TABLE_SET==='final'
      ? '__SADHANA_FINAL_MODE_LEGACY_DISABLED__'
      : process.env.SADHANA_TABLE_NAME,
  }));
  return cachedHandler(event);
};
