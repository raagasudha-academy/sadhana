import type {RouteContext} from './routes/http.ts';
export type FinalSelfReply = {status:number;body:unknown};
export function finalCognitoSelfRoute(
  context:RouteContext,
  services:{
    getProfile:(sub:string)=>Promise<unknown>;
    saveProfile:(sub:string,changes:Record<string,unknown>)=>Promise<unknown>;
    uploadOwnPhoto:(value:Record<string,unknown>,claims:RouteContext['claims'])=>Promise<unknown>;
  },
  codecs:{
    readJSON:(input:string)=>Record<string,any>;
    readPhotoJSON:(input:string)=>Record<string,unknown>;
  },
  env?:Record<string,string|undefined>
):Promise<FinalSelfReply|undefined>;
