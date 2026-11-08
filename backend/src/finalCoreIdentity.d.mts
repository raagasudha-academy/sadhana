import type {RouteContext} from './routes/http.ts';
import type {Claims,InstitutionId} from './model.ts';
type RecordValue=Record<string,unknown>;
export interface FinalCoreIdentityDependencies {
  assertConfigured:()=>void;
  parse:(event:RouteContext['event'])=>RecordValue;
  core:()=>{
    create:(entity:'families'|'students'|'enrolments',inst:InstitutionId,claims:Claims,body:RecordValue)=>Promise<unknown>;
    registerExistingGuardianAsStudent:(inst:InstitutionId,claims:Claims,body:RecordValue)=>Promise<unknown>;
    update:(entity:'families'|'students'|'enrolments',inst:InstitutionId,claims:Claims,id:string,body:RecordValue)=>Promise<unknown>;
  };
  guardian:()=>{
    request:(inst:InstitutionId,claims:Claims,body:RecordValue)=>Promise<unknown>;
    decide:(inst:InstitutionId,claims:Claims,body:RecordValue)=>Promise<unknown>;
  };
}
export interface FinalCoreIdentityAccess {
  admin:(claims:Claims,inst:InstitutionId)=>void;
}
export function finalCoreIdentityRoute(context:RouteContext,deps:FinalCoreIdentityDependencies,access:FinalCoreIdentityAccess,env?:Record<string,string|undefined>):Promise<{status:number;body:unknown}|undefined>;
