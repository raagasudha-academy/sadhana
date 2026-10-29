/** Administrator-only requeue of imported website access links.
 * Verified adult self access may be approved by the queue's strict identity verifier;
 * children remain pending guardian requests until administrator relationship review. */
import {demandInstitution} from './model.ts';
import type {Claims} from './model.ts';
import {enqueueImportedGuardianReviews} from './v117GuardianQueue.ts';

export async function queueImportedParentLinks(registrationId:string,claims:Claims){
 demandInstitution(claims,'raaga');
 if(!claims.sub)throw Error('Verified administrator identity required');
 // Legacy manual requests were created by this admin (requestedBy=claims.sub).
 // Allow conversion only with strict verified-self evidence within the resolver.
 const result=await enqueueImportedGuardianReviews(registrationId,claims.sub);
 return {...result,message:'Verified adult self-access processed where eligible; guardian links require independent administrator review.'};
}
