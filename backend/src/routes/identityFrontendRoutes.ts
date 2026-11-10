/** M9-backed frontend registration import and guardian decisions.
 * Opt-in only. Never falls back to legacy PK/SK identity or provisioning paths.
 * Account invitation and destructive website revoke are intentionally not migrated.
 */
import {demandInstitution,httpError} from '../model.ts';
import type {DomainRoute} from './http.ts';
import {json,readJSON} from './http.ts';
import {m95GuardianService} from '../guardianRegistration.ts';
import {m95ImportApprovedWebsiteRegistration} from '../websiteImport.ts';

type GuardianService=Pick<ReturnType<typeof m95GuardianService>,'request'|'decide'>;
type ImportService=typeof m95ImportApprovedWebsiteRegistration;
const forbidden=()=>json(503,{error:'This identity or registration operation is not migrated. Legacy storage is blocked.'});
const exactKeys=(body:Record<string,unknown>,allowed:string[])=>
  Object.keys(body).every(k=>allowed.includes(k));
const parseBody=(raw:string|undefined|null,isBase64Encoded?:boolean)=>
  readJSON(raw?(isBase64Encoded?Buffer.from(raw,'base64').toString('utf8'):raw):'');

export function makeM10IdentityFrontendRoutes(
 guardian:()=>GuardianService=m95GuardianService,
 importer:ImportService=m95ImportApprovedWebsiteRegistration
):DomainRoute {
 return async({parts,method,query,inst,claims,event})=>{
  if(parts[0]==='family-access'&&process.env.M10_GUARDIAN_FRONTEND_M9==='enabled'){
   if(process.env.M95_ONBOARDING_MODE!=='enabled')return forbidden();
   if((parts[1]==='request'||parts[1]==='decide')&&parts.length===2&&method==='POST'){
    if(inst!=='raaga'&&inst!=='sruti')throw httpError(400,'Select a valid institution.');
    const body=parseBody(event.body,event.isBase64Encoded);
    if(parts[1]==='request')return json(201,await guardian().request(inst,claims,body));
    demandInstitution(claims,inst);
    return json(200,await guardian().decide(inst,claims,body));
   }
   // In opt-in mode, never silently resume legacy family access routes.
   return forbidden();
  }
  if(parts[0]==='website-registrations'&&process.env.M10_RAAGA_IMPORT_FRONTEND_M9==='enabled' && ((method==='POST'&&parts.length===3&&parts[2]==='import') || (method!=='GET'&&query.institution!=='sruti'))){
   if(process.env.M95_ONBOARDING_MODE!=='enabled')return forbidden();
   if(query.institution!==undefined&&query.institution!=='raaga')throw httpError(403,'Raagasudha registration endpoint only.');
   demandInstitution(claims,'raaga');
   if(method==='POST'&&parts.length===3&&parts[2]==='import'){
    if(!/^RS-[A-Za-z0-9_-]{1,110}$/.test(parts[1]))throw httpError(400,'Invalid website registration identifier.');
    const body=parseBody(event.body,event.isBase64Encoded);
    // Legacy linkFamilyId / identityCorrection semantics cannot be ignored or
    // transformed into a fresh family without independent reconciliation.
    if(!exactKeys(body,['preview'])||(body.preview!==undefined&&typeof body.preview!=='boolean'))
      throw httpError(400,'Only preview is supported. Identity corrections require independent review.');
    const preview=body.preview===true;
    const result=await importer('raaga',claims,parts[1],!preview);
    return json(200,{...result,guardianAccessGranted:false,invitationSent:false});
   }
   // Every other registration action is blocked until its M9 counterpart is
   // implemented (especially Cognito provisioning and destructive revocation).
   return forbidden();
  }
  return undefined;
 };
}
export const m10IdentityFrontendRoutes=makeM10IdentityFrontendRoutes();
