import {fetchWebsiteRegistration} from './websiteRegistrationGateway.ts';
/** Optional post-import Cognito invitation. NEVER grants access to students based only on email. */
import {CognitoIdentityProviderClient,ListUsersCommand,AdminCreateUserCommand} from '@aws-sdk/client-cognito-identity-provider';
import {GetCommand,UpdateCommand} from '@aws-sdk/lib-dynamodb';
import {makeRoutedClient} from './tableRouter.ts';
import {tryQueueGuardianReviews} from './v117GuardianAutoHook.ts';
const db=makeRoutedClient();
const cognito=new CognitoIdentityProviderClient({});
const table=()=>{const n=process.env.SADHANA_TABLE_NAME;if(!n)throw Error('Missing Sadhana table');return n;};
const pool=()=>{const n=process.env.SADHANA_COGNITO_USER_POOL_ID;if(!n)throw Error('Missing Cognito user pool');return n;};
const key=(id:string)=>({PK:'OPS#GLOBAL#WEB_IMPORT',SK:`ITEM#${id}`});
const attr=(a:readonly {Name?:string;Value?:string}[]|undefined,n:string)=>a?.find(x=>x.Name===n)?.Value||'';
const unwrap=(x:any)=>x?.registration??x?.record??x?.item??x?.data??x;
const validId=(id:string)=>/^RS-[A-Za-z0-9_-]{1,110}$/.test(id);
async function setStatus(id:string,status:string,extra:Record<string,unknown>={}){
 const entries=Object.entries(extra);const names:Record<string,string>={'#s':'parentAccessStatus','#t':'parentAccessUpdatedAt'};
 const values:Record<string,unknown>={':s':status,':now':new Date().toISOString()};
 const expressions=['#s=:s','#t=:now'];
 entries.forEach(([name,value],i)=>{names[`#x${i}`]=name;values[`:x${i}`]=value;expressions.push(`#x${i}=:x${i}`);});
 await db.send(new UpdateCommand({TableName:table(),Key:key(id),UpdateExpression:`SET ${expressions.join(', ')}`,
   ConditionExpression:'attribute_exists(PK) AND attribute_exists(studentIds)',ExpressionAttributeNames:names,ExpressionAttributeValues:values}));
}
/** Run after import. A failed invitation never undoes a successful import. */
export async function provisionParentAccount(registrationId:string){
 if(!validId(registrationId))throw Error('Invalid registration ID');
 const marker=(await db.send(new GetCommand({TableName:table(),Key:key(registrationId),ConsistentRead:true}))).Item;
 if(!marker||!marker.studentIds)throw Error('No completed Sadhana import');
 if(['INVITATION_SENT','ACTIVE','NEEDS_VERIFICATION'].includes(marker.parentAccessStatus)){if(marker.parentAccessStatus!=='NEEDS_VERIFICATION')await tryQueueGuardianReviews(registrationId);return {status:marker.parentAccessStatus,alreadyProcessed:true};}
 // Safe deployment opt-in: existing imports and normal approvals continue unaffected.
 if(process.env.SADHANA_PARENT_PROVISIONING_ENABLED!=='true')return {status:marker.parentAccessStatus||'NOT_INVITED',disabled:true};
 const website=unwrap(await fetchWebsiteRegistration(registrationId));
 if(website?.registrationId!==registrationId||website?.reviewStatus!=='approved'||website?.sadhanaImport?.status!=='imported'||website.sadhanaImport.familyId!==marker.familyId||
   JSON.stringify(Object.entries(website.sadhanaImport.studentIds||{}).sort())!==JSON.stringify(Object.entries(marker.studentIds||{}).sort()))
   throw Error('Website import mapping differs; parent account provisioning blocked');
 const parent=(website.people||[]).find((p:any)=>p.personId===website.primaryContactPersonId);
 const email=String(parent?.email||'').trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Primary contact email invalid');
 // Cognito is the login identity provider; do not infer guardian permission from this email.
 const escaped=email.replace(/[\\"]/g,c=>'\\'+c);
 const lookup=await cognito.send(new ListUsersCommand({UserPoolId:pool(),Filter:`email = "${escaped}"`,Limit:20}));
 const matches=(lookup.Users||[]).filter(u=>attr(u.Attributes,'email').toLowerCase()===email);
 if(matches.length>1){await setStatus(registrationId,'NEEDS_VERIFICATION');return {status:'NEEDS_VERIFICATION',reason:'Multiple Cognito identities use this email'};}
 if(matches.length===1){
   const user=matches[0];
   if(attr(user.Attributes,'email_verified')!=='true'){
     await setStatus(registrationId,'NEEDS_VERIFICATION');
     return {status:'NEEDS_VERIFICATION',reason:'Existing email identity needs verification'};
   }
   await setStatus(registrationId,'ACCOUNT_FOUND',{parentAccountSub:attr(user.Attributes,'sub'),parentAccountUsername:user.Username||'',parentAccountEmail:email});
   await tryQueueGuardianReviews(registrationId);
   return {status:'ACCOUNT_FOUND',message:'Verified existing account located; guardian access queued for administrator review'};
 }
 try{
   const newUser=await cognito.send(new AdminCreateUserCommand({UserPoolId:pool(),Username:`parent-${crypto.randomUUID()}`,
    UserAttributes:[{Name:'email',Value:email},{Name:'name',Value:String(parent?.fullName||'Parent').slice(0,90)}],
    DesiredDeliveryMediums:['EMAIL']}));
   await setStatus(registrationId,'INVITATION_SENT',{parentAccountSub:attr(newUser.User?.Attributes,'sub'),parentAccountUsername:newUser.User?.Username||email,parentAccountEmail:email});
   await tryQueueGuardianReviews(registrationId);
   return {status:'INVITATION_SENT',message:'Cognito invitation requested; delivery is not guaranteed; guardian reviews queued'};
 }catch(e:any){
   // A concurrent attempt might already have created the account. Retry will reconcile via ListUsers.
   if(e?.name==='UsernameExistsException'){
     await setStatus(registrationId,'NEEDS_VERIFICATION');
     return {status:'NEEDS_VERIFICATION',reason:'Cognito username already exists; manual review needed'};
   }
   throw e;
 }
}
