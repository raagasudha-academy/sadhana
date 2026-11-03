/** Explicit M9 onboarding routes. Entirely disabled by default.
 * Existing /website-registrations and /family-access endpoints remain authoritative.
 */
import {httpError,demandInstitution} from '../model.ts';
import type {DomainRoute} from './http.ts';
import {json,readJSON} from './http.ts';
import {m95GuardianService} from '../m95GuardianRegistration.ts';
import {m95ImportApprovedWebsiteRegistration,m95ReconcileWebsiteImport} from '../m95WebsiteImport.ts';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,QueryCommand} from '@aws-sdk/lib-dynamodb';

const db=DynamoDBDocumentClient.from(new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'}));
const service=m95GuardianService;
export const m95GuardianRegistrationRoutes:DomainRoute=async ({event,parts,method,query,claims})=>{
 if(parts[0]!=='m9-onboarding')return undefined;
 if(process.env.M95_ONBOARDING_MODE!=='enabled')return json(404,{error:'Unknown endpoint.'});
 const institution=query.institution;
 if(institution!=='raaga'&&institution!=='sruti')throw httpError(400,'Select a valid institution.');
 if(method==='POST'&&parts[1]==='website-import'&&parts.length===4&&['preview','execute'].includes(parts[3])){
  demandInstitution(claims,institution);
  return json(200,await m95ImportApprovedWebsiteRegistration(institution,claims,parts[2],parts[3]==='execute'));
 }
 if(method==='POST'&&parts[1]==='website-import'&&parts.length===4&&['sync-preview','sync'].includes(parts[3])){
  demandInstitution(claims,institution);
  return json(200,await m95ReconcileWebsiteImport(institution,claims,parts[2],parts[3]==='sync'));
 }
 if(method==='GET'&&parts.length===2&&parts[1]==='status'){
  demandInstitution(claims,institution);
  return json(200,{institution,guardianRequests:'enabled',registrationMirror:'read-only',websiteImport:'legacy-authoritative',cutover:false});
 }
 if(method==='POST'&&parts.length===3&&parts[1]==='guardian'&&parts[2]==='request'){
  const body=readJSON(event.body?(event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body):'');
  return json(201,await service().request(institution,claims,body));
 }
 if(method==='POST'&&parts.length===3&&parts[1]==='guardian'&&parts[2]==='decision'){
  demandInstitution(claims,institution);
  const body=readJSON(event.body?(event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body):'');
  return json(200,await service().decide(institution,claims,body));
 }
 if(method==='GET'&&parts.length===2&&parts[1]==='registrations'){
  demandInstitution(claims,institution);
  const limit=Number(query.limit??'30');
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw httpError(400,'Invalid limit.');
  const result=await db.send(new QueryCommand({TableName:'sadhana-dev-m9-registrations',IndexName:'InstitutionRegistrationsIndex',KeyConditionExpression:'institutionId = :institution',ExpressionAttributeValues:{':institution':institution},Limit:limit}));
  return json(200,{records:(result.Items||[]).filter(x=>x.institutionId===institution).map(x=>({registrationId:x.registrationId,externalRegistrationId:x.externalRegistrationId,status:x.status,importStatus:x.importStatus,submittedAt:x.submittedAt})),hasMore:!!result.LastEvaluatedKey,source:'m9-internal-only'});
 }
 return json(404,{error:'Unknown M9 onboarding endpoint.'});
};
