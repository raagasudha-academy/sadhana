import type {Claims, InstitutionId} from './model.ts';
import type {RouteContext} from './routes/http.ts';
export type FinalAdministratorResponse = {status:number;body:unknown};
export type FinalAdministratorServices = {
  list:(institution:InstitutionId,claims:Claims)=>Promise<unknown>;
  invite:(data:Record<string,unknown>,claims:Claims)=>Promise<unknown>;
  changeAccess:(data:Record<string,unknown>,claims:Claims)=>Promise<unknown>;
  updateProfile:(data:Record<string,unknown>,claims:Claims)=>Promise<unknown>;
  parse:(body:string)=>Record<string,any>;
};
export function finalAdministratorRoute(
  context:RouteContext,
  services:FinalAdministratorServices,
  access:{admin:(claims:Claims,institution:InstitutionId)=>unknown;manager:(claims:Claims)=>unknown},
  env?:Record<string,string|undefined>
):Promise<FinalAdministratorResponse|undefined>;
