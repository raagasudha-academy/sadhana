import {entityTable} from '../m10EntityTables.mjs';
/** Explicit M9 onboarding routes. Entirely disabled by default.
 * Existing /website-registrations and /family-access endpoints remain authoritative.
 */
import {httpError,demandInstitution} from '../model.ts';
import type {DomainRoute} from './http.ts';
import {json,readJSON} from './http.ts';
import {m95GuardianService} from '../m95GuardianRegistration.ts';
import {m95ImportApprovedWebsiteRegistration,m95ReconcileWebsiteImport} from '../m95WebsiteImport.ts';
import {m9VerifiedCognitoLink} from '../m9VerifiedCognitoLink.ts';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,QueryCommand,GetCommand,UpdateCommand} from '@aws-sdk/lib-dynamodb';

const db=DynamoDBDocumentClient.from(new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'}));
const service=m95GuardianService;
export function makeM95GuardianRegistrationRoutes(
 dbClient:{send:(command:any)=>Promise<any>}=db,
 getGuardianService:typeof m95GuardianService=service,
):DomainRoute{
 return async ({event,parts,method,query,claims})=>{
 if(parts[0]!=='m9-onboarding')return undefined;
 if(process.env.M95_ONBOARDING_MODE!=='enabled')return json(404,{error:'Unknown endpoint.'});
 const institution=query.institution;
 if(institution!=='raaga'&&institution!=='sruti')throw httpError(400,'Select a valid institution.');
 // Sruti intake review is staff-only and never grants Cognito or guardian access.
 if(parts[1]==='sruti-intake'&&institution==='sruti'){
  demandInstitution(claims,'sruti');
  if(method==='GET'&&parts.length===3){
   const record=(await dbClient.send(new GetCommand({TableName:entityTable('registrations'),Key:{registrationId:parts[2]},ConsistentRead:true}))).Item;
   if(!record||record.source!=='sruti-website'||record.institutionId!=='sruti')throw httpError(404,'Sruti registration not found.');
   return json(200,{record});
  }
  if(method==='PATCH'&&parts.length===4&&parts[3]==='review'){
   if(process.env.M91_SRUTI_REVIEW_WRITES!=='enabled')throw httpError(403,'Sruti review writes are disabled.');
   const body=readJSON(event.body?(event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body):'');
   if(!['approved','discarded'].includes(body.reviewStatus)||!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<1||Object.keys(body).some(k=>!['reviewStatus','expectedVersion'].includes(k)))throw httpError(400,'Invalid review decision or expected version.');
   const now=new Date().toISOString();
   try{await dbClient.send(new UpdateCommand({TableName:entityTable('registrations'),Key:{registrationId:parts[2]},UpdateExpression:'SET reviewStatus=:next,#status=:next,updatedAt=:now,reviewedBy=:reviewer,version=:newVersion',ConditionExpression:'institutionId=:inst AND #source=:source AND reviewStatus=:pending AND importStatus=:pending AND version=:previous',ExpressionAttributeNames:{'#source':'source','#status':'status'},ExpressionAttributeValues:{':inst':'sruti',':source':'sruti-website',':pending':'pending',':next':body.reviewStatus,':now':now,':reviewer':claims.sub,':previous':body.expectedVersion,':newVersion':body.expectedVersion+1}}));}
   catch(e:any){if(['ConditionalCheckFailedException','TransactionCanceledException'].includes(e?.name))throw httpError(409,'Registration changed; refresh and review.');throw e;}
   return json(200,{registrationId:parts[2],reviewStatus:body.reviewStatus,version:body.expectedVersion+1,guardianAccessGranted:false});
  }
  return json(405,{error:'Unsupported Sruti intake operation.'});
 }
 // Explicit bridge for website registrations already imported by the original portal.
 // Never changes the upstream website mapping and never auto-approves guardians.
 if(method==='POST'&&parts[1]==='legacy-bridge'&&parts.length===4&&['preview','execute'].includes(parts[3])){
  demandInstitution(claims,institution);
  return json(200,await m95ImportApprovedWebsiteRegistration(institution,claims,parts[2],parts[3]==='execute','legacy-bridge'));
 }
 if(method==='POST'&&parts[1]==='website-import'&&parts.length===4&&['preview','execute'].includes(parts[3])){
  demandInstitution(claims,institution);
  return json(200,await m95ImportApprovedWebsiteRegistration(institution,claims,parts[2],parts[3]==='execute'));
 }
 if(method==='POST'&&parts[1]==='website-import'&&parts.length===4&&['sync-preview','sync'].includes(parts[3])){
  demandInstitution(claims,institution);
  return json(200,await m95ReconcileWebsiteImport(institution,claims,parts[2],parts[3]==='sync'));
 }
 if(method==='POST'&&parts[1]==='verified-account'&&parts.length===4&&['preview','link'].includes(parts[3])){
  demandInstitution(claims,institution);
  const body=readJSON(event.body?(event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body):'');
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(x=>x!=='expectedCognitoSub'))throw httpError(400,'Supply only expectedCognitoSub.');
  return json(200,await m9VerifiedCognitoLink()(parts[2],institution,claims,parts[3]==='link',body.expectedCognitoSub));
 }
 if(method==='GET'&&parts.length===2&&parts[1]==='status'){
  demandInstitution(claims,institution);
  return json(200,{institution,guardianRequests:'enabled',registrationMirror:'read-only',websiteImport:'legacy-authoritative',cutover:false});
 }
 if(method==='POST'&&parts.length===3&&parts[1]==='guardian'&&parts[2]==='request'){
  const body=readJSON(event.body?(event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body):'');
  return json(201,await getGuardianService().request(institution,claims,body));
 }
 if(method==='POST'&&parts.length===3&&parts[1]==='guardian'&&parts[2]==='decision'){
  demandInstitution(claims,institution);
  const body=readJSON(event.body?(event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body):'');
  return json(200,await getGuardianService().decide(institution,claims,body));
 }
 if(method==='GET'&&parts.length===2&&parts[1]==='registrations'){
  demandInstitution(claims,institution);
  const limit=Number(query.limit??'30');
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw httpError(400,'Invalid limit.');
  const result=await dbClient.send(new QueryCommand({TableName:entityTable('registrations'),IndexName:'InstitutionRegistrationsIndex',KeyConditionExpression:'institutionId = :institution',ExpressionAttributeValues:{':institution':institution},Limit:limit}));
  return json(200,{records:(result.Items||[]).filter(x=>x.institutionId===institution).map(x=>({registrationId:x.registrationId,externalRegistrationId:x.externalRegistrationId,status:x.status,importStatus:x.importStatus,submittedAt:x.submittedAt})),hasMore:!!result.LastEvaluatedKey,source:'m9-internal-only'});
 }
 return json(404,{error:'Unknown M9 onboarding endpoint.'});
 };
}
export const m95GuardianRegistrationRoutes:DomainRoute=makeM95GuardianRegistrationRoutes();
