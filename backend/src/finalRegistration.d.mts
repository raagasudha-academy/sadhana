import type {RouteContext, JsonResponse} from './routes/http.ts';
import type {Claims,InstitutionId} from './model.ts';
export function finalRegistrationRoute(context:RouteContext,deps:{
  assertConfigured:()=>void;
  parse:(event:RouteContext["event"])=>Record<string,unknown>;
  existingImport:(registrationId:string,subject:string,body:Record<string,unknown>,execute:boolean)=>Promise<Record<string,unknown>>;
  freshImport?:(registrationId:string,claims:Claims,execute:boolean)=>Promise<Record<string,unknown>>;
  parentStatus?:(registrationId:string)=>Promise<Record<string,unknown>>;
  parentAction?:(action:'provision-parent'|'resend-parent-invitation',registrationId:string,actorSub:string,confirmReference:string)=>Promise<Record<string,unknown>>;
  registration:(context:RouteContext)=>Promise<JsonResponse|undefined>;
  raaga?:(context:RouteContext)=>Promise<{status:number;body:unknown}|undefined>;
},access:{admin:(claims:Claims,inst:InstitutionId)=>void},env?:Record<string,string|undefined>):Promise<{status:number;body:unknown}|undefined>;
