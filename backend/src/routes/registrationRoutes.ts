import {fetchWebsiteRegistration, reviewWebsiteRegistration} from '../websiteRegistrationGateway.ts';
import {importApprovedWebsiteRegistration} from '../websiteRegistrationImport.ts';
import {getParentAccessStatus} from '../parentAccessProvisioning.ts';
import {provisionParentAccount} from '../parentAccountProvisioning.ts';
import {resendParentInvitation} from '../resendParentInvitation.ts';
import {queueImportedParentLinks} from '../parentLinkWorkflow.ts';
import {previewWebsiteRevocation} from '../websiteRevocationPreflight.ts';
import {revokeWebsiteImport, cancelFencedWebsiteRevocation} from '../websiteRegistrationRevocation.ts';
import {httpError} from '../model.ts';
import {json, readJSON} from './http.ts';
import type {RouteContext, JsonResponse} from './http.ts';

export async function registrationRoutes({event,parts,method,query,groups,claims}: RouteContext): Promise<JsonResponse | undefined> {
      // Sadhana staff JWT + academy permission is checked BEFORE the upstream IAM call.
      if(parts[0]==='website-registrations'){
        if(!groups.includes('raaga'))throw httpError(403,'Raagasudha administrator role required.');
        if(method==='POST'&&parts.length===3&&parts[2]==='queue-parent-links')return json(200,await queueImportedParentLinks(parts[1],claims));
        if(method==='POST'&&parts.length===3&&parts[2]==='resend-parent-invitation')return json(200,await resendParentInvitation(parts[1],claims.sub));
        if(method==='POST'&&parts.length===3&&parts[2]==='provision-parent'){return json(200,await provisionParentAccount(parts[1]));}
        if(method==='GET'&&parts.length===3&&parts[2]==='access-status')return json(200,await getParentAccessStatus(parts[1]));
        if(method==='GET'&&parts.length===3&&parts[2]==='revoke-preview')return json(200,await previewWebsiteRevocation(parts[1]));
        if(method==='POST'&&parts.length===3&&parts[2]==='revoke'){const body=readJSON(event.body?(event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body):'');return json(200,await revokeWebsiteImport(parts[1],claims.sub,body.confirmation));}
        if(method==='POST'&&parts.length===3&&parts[2]==='revoke-cancel'){const body=readJSON(event.body?(event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body):'');return json(200,await cancelFencedWebsiteRevocation(parts[1],claims.sub,body.confirmation));}
        if(method==='POST'&&parts.length===3&&parts[2]==='import'){const body=readJSON(event.body?(event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body):'');return json(200,await importApprovedWebsiteRegistration(parts[1],claims.sub,{preview:body.preview===true,linkFamilyId:typeof body.linkFamilyId==='string'?body.linkFamilyId:undefined,identityCorrection:body.identityCorrection}));}
        if(method==='PATCH'&&parts.length===2){
          const body = event.body ? JSON.parse(event.body) : {};
          const review = body?.reviewStatus;
          if(!['approved','discarded'].includes(review))throw httpError(400,'Invalid review status.');
          return json(200,await reviewWebsiteRegistration(parts[1],review,claims.sub));
        }
        if(method!=='GET')throw httpError(405,'Unsupported website registration action.');
        if(parts.length===1)return json(200,await fetchWebsiteRegistration(undefined,undefined,{
          status:query.status,locationId:query.locationId,from:query.from,to:query.to,limit:query.limit
        }));
        if(parts.length===2)return json(200,await fetchWebsiteRegistration(parts[1]));
        if(parts.length===4&&parts[2]==='photos')return json(200,await fetchWebsiteRegistration(parts[1],parts[3]));
        return json(404,{error:'Unknown website registration route.'});
      }
  return undefined;
}
