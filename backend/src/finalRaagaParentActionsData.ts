/** DynamoDB lookups for canonical Raagasudha parent handoff. No legacy table access. */
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand} from '@aws-sdk/lib-dynamodb';
import {entityTable} from './entityTables.mjs';
import {m9VerifiedCognitoLink} from './verifiedCognitoLink.ts';
import {canonicalRaagaParentAction} from './finalRaagaParentActions.mjs';
import {m10FinalRaagaInvitations} from './finalRaagaInvitations.ts';
import {cognitoSubjectGuardId,guardianInstitutionGuardId} from './guardianIdentityKey.mjs';
import type {Claims} from './model.ts';

export function makeM10FinalRaagaParentActionsReader(db:{send:(command:any)=>Promise<any>}){
 const get=async(table:'registrations'|'families'|'people'|'family-links'|'counters',key:string,id:string)=>
  (await db.send(new GetCommand({TableName:entityTable(table),Key:{[key]:id},ConsistentRead:true}))).Item??null;
 return {
  registration:(id:string)=>get('registrations','registrationId',id),
  family:(id:string)=>get('families','familyId',id),
  person:(id:string)=>get('people','personId',id),
  link:(id:string)=>get('family-links','linkId',id),
  async subjectGuard(sub:string,inst:'raaga'|'sruti'='raaga'){
   return await get('counters','counterId',guardianInstitutionGuardId(sub,inst))||
    await get('counters','counterId',cognitoSubjectGuardId(sub));
  },
  linkVerifiedAccount:(id:string,inst:'raaga',claims:Claims,subject:string)=>
    m9VerifiedCognitoLink()(id,inst,claims,true,subject),
  inviteNewAccount:(reg:any,guardian:any,actorSub:string)=>m10FinalRaagaInvitations().invite(reg,guardian,actorSub),
  resendInvitation:(reg:any,guardian:any,actorSub:string)=>m10FinalRaagaInvitations().resend(reg,guardian,actorSub),
 };
}
let reader:ReturnType<typeof makeM10FinalRaagaParentActionsReader>|undefined;
export async function m10FinalRaagaParentAction(action:string,externalId:string,body:Record<string,unknown>,claims:Claims){
 reader??=makeM10FinalRaagaParentActionsReader(DynamoDBDocumentClient.from(
  new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'}),
  {marshallOptions:{removeUndefinedValues:true}}));
 return canonicalRaagaParentAction(action,externalId,body,claims,reader);
}
