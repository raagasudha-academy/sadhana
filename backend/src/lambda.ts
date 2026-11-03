import {SadhanaRepository} from './repository.ts';
import {makeM95DirectoryRoutes} from './routes/m95DirectoryRoutes.ts';
import {apiRouteParts} from './apiRoute.ts';
import type {PracticeChange} from './repository.ts';
import {httpError, permittedInstitutions, viewableInstitutions, RESOURCES} from './model.ts';
import {verifiedTeacherInstitutions} from './teacherDirectory.ts';
import {ownProfilePhoto, currentStaffDisplayName} from './profilePhotos.ts';
import {getOwnProfile, saveOwnProfile} from './selfProfile.ts';
import type {InstitutionId, ResourceName, HttpError} from './model.ts';
import {json, readJSON} from './routes/http.ts';
import type {SadhanaHttpEvent, JsonResponse} from './routes/http.ts';
import {learningRoutes} from './routes/learningRoutes.ts';
import {familyRoutes} from './routes/familyRoutes.ts';
import {staffRoutes} from './routes/staffRoutes.ts';
import {registrationRoutes} from './routes/registrationRoutes.ts';
import {operationsRoutes} from './routes/operationsRoutes.ts';
import {calendarRoutes} from './routes/calendarRoutes.ts';
import {m95CalendarWriteRoutes} from './routes/m95CalendarWriteRoutes.ts';
import {m95CompatibilityRoutes} from './routes/m95CompatibilityRoutes.ts';
import {m9Routes} from './routes/m9Routes.ts';
import {m9WriteRoutes} from './routes/m9WriteRoutes.ts';



export function createHandler(repository: SadhanaRepository){
  const m95DirectoryRoutes=makeM95DirectoryRoutes(undefined, (inst,claims)=>repository.list('venues',inst,claims) as Promise<{records:Record<string,any>[];more:boolean}>);
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
      if(process.env.M95_COMPAT_MODE==='pilot' && !['GET','HEAD','OPTIONS'].includes(String(requestMethod))) {
        const p=apiRouteParts(event);
        const calendarWrite=(requestMethod==='POST'&&p.length===1&&p[0]==='schedule') || (requestMethod==='PATCH'&&p.length===2&&p[0]==='schedule');
        if(process.env.M95_CALENDAR_WRITES!=='enabled'||!calendarWrite)
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
      const isAccessRoute=['family-access','me','learner'].includes(routeParts[0]) || isOwnPhotoRoute;
      if(!viewed.length&&!isAccessRoute)return json(403,{error:'Staff role required.'});
      const parts=apiRouteParts(event);
      const method=event.requestContext?.http?.method ?? event.httpMethod;
      const query=event.queryStringParameters??{};
      const inst=query.institution as InstitutionId;
      const routeContext={event,parts,method,query,inst,claims,groups};
      if(parts[0]==='me'&&parts[1]==='profile'&&parts.length===2){
        if(method==='GET')return json(200,await getOwnProfile(claims.sub));
        if(method==='PATCH')return json(200,await saveOwnProfile(claims.sub,readJSON(event.body||'')));
        return json(405,{error:'Unsupported profile action.'});
      }
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
      {const response=await m9WriteRoutes(routeContext);if(response)return response;}
      {const response=await m9Routes(routeContext);if(response)return response;}
      {const response=await learningRoutes(routeContext);if(response)return response;}
      {const response=await familyRoutes(routeContext);if(response)return response;}
      {const response=await m95DirectoryRoutes(routeContext);if(response)return response;}
      {const response=await staffRoutes(routeContext);if(response)return response;}
      {const response=await registrationRoutes(routeContext);if(response)return response;}
      {const response=await operationsRoutes(routeContext);if(response)return response;}
      if(method==='GET'&&parts[0]==='health')return json(200,{status:'ok',database:'configured',environment:'protected-api'});
      {const response=await m95CompatibilityRoutes(routeContext);if(response)return response;}
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
