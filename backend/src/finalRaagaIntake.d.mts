import type {RouteContext} from './routes/http.ts';
import type {Claims} from './model.ts';
export function finalRaagaIntakeRoute(context:RouteContext,deps:{
 assertConfigured:()=>void;
 parse:(event:RouteContext['event'])=>Record<string,unknown>;
 list:(filters:Record<string,string|undefined>)=>Promise<unknown>;
 get:(id:string)=>Promise<unknown>;
 photo:(id:string,personId:string)=>Promise<unknown>;
 review:(id:string,decision:'approved'|'discarded',actor:string)=>Promise<unknown>;
 preview:(id:string,claims:Claims)=>Promise<unknown>;
 execute:(id:string,claims:Claims)=>Promise<unknown>;
 sync:(id:string,claims:Claims)=>Promise<unknown>;
},env?:Record<string,string|undefined>):Promise<{status:number;body:unknown}|undefined>;
