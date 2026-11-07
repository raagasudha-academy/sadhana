import type {RouteContext} from './routes/http.ts';
type Institution='raaga'|'sruti';
type Scope=Institution|'shared';
export type CanonicalReadDependencies={
  assertConfigured:()=>void;
  schedule:(institution:Scope)=>Promise<unknown>;
  directory:(action:'teacherMe'|'teachers'|'classes'|'venues',institution:Institution,claims:RouteContext['claims'])=>Promise<any>;
  managedEvents:(institution:Institution)=>Promise<unknown>;
  core:(entity:'students'|'families'|'enrolments',institution:Institution,claims:RouteContext['claims'])=>Promise<unknown>;
  audit:(institution:Institution)=>Promise<unknown>;
  practice:(institution:Institution,studentId:string)=>Promise<unknown>;
  profile:(sub:string)=>Promise<{name?:string;photoUrl?:string}>;
};
export type CanonicalAccess={
 view:(claims:RouteContext['claims'],institution:Institution)=>void;
 admin:(claims:RouteContext['claims'],institution:Institution)=>void;
 viewableInstitutions:(claims:RouteContext['claims'])=>Institution[];
 permittedInstitutions:(claims:RouteContext['claims'])=>Institution[];
 forbid:(message:string)=>never;
 badInstitution:()=>never;
 badStudent:()=>never;
};
export function finalReadRoute(
  context:RouteContext,readers:CanonicalReadDependencies,access:CanonicalAccess,
  env?:Record<string,string|undefined>
):Promise<{status:number;body:unknown}|undefined>;
