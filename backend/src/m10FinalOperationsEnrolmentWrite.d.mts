import type {RouteContext} from './routes/http.ts';
import type {Claims,InstitutionId} from './model.ts';
type RecordValue=Record<string,unknown>;
export function finalOperationsEnrolmentWriteRoute(context:RouteContext,dependencies:{
 assertConfigured:()=>void;
 parse:(event:RouteContext['event'])=>RecordValue;
 core:()=>{create:(entity:'enrolments',inst:InstitutionId,claims:Claims,body:RecordValue)=>Promise<unknown>; endEnrolment:(inst:InstitutionId,claims:Claims,id:string,body:RecordValue)=>Promise<unknown>};
},access:{admin:(claims:Claims,inst:InstitutionId)=>void},env?:Record<string,string|undefined>):Promise<{status:number;body:unknown}|undefined>;
