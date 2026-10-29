/** Do not let link-queue failures roll back a successful Cognito account or student import. */
import {enqueueImportedGuardianReviews} from './v117GuardianQueue.ts';
export async function tryQueueGuardianReviews(registrationId:string){
 try{return await enqueueImportedGuardianReviews(registrationId)}
 catch(e){console.error('Guardian review queue deferred',{registrationId,errorType:e instanceof Error?e.name:'Unknown'});return {queued:0,deferred:true};}
}
