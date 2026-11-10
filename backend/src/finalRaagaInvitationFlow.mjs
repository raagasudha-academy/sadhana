/** Pure canonical parent invitation state machine (no AWS calls or source-table fallback).
 * A Cognito invitation is not itself a verified identity link or a completed sign-in.
 */
import {createHash} from 'node:crypto';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
// Match m95WebsiteImportCore's hash(email): JSON array encoding is significant.
export const canonicalRaagaContactGuardId=email=>`CONTACT#raaga#${createHash('sha256').update(JSON.stringify([email])).digest('hex')}`;
const attr=(attrs,key)=>attrs?.find(x=>x.Name===key)?.Value||'';
const emailPattern=/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
const subPattern=/^[a-zA-Z0-9-]{8,128}$/;
const validEmail=value=>typeof value==='string'&&value.length<=254&&emailPattern.test(value)&&value===value.trim().toLowerCase();
const usernameFor=id=>`parent-${id.slice(4,36)}`;
const enabled=(env,name)=>env.SADHANA_ENTITY_TABLE_SET==='final'&&env.SADHANA_ENTITY_FINAL_ACK==='enabled'&&
  env.SADHANA_DATA_MODE!=='split'&&env[name]==='enabled';
const verify=(reg,guardian,actorSub)=>{
 if(!actorSub||!reg||reg.source!=='website'||reg.institutionId!=='raaga'||reg.importStatus!=='imported'||
  !reg.familyId||!reg.registrationId?.startsWith('web_')||
  !guardian?.personId||guardian.familyId!==reg.familyId||guardian.status!=='active'||
  !guardian.personTypes?.includes('guardian')||!guardian.institutionIds?.includes('raaga')||
  guardian.cognitoSub||!validEmail(guardian.email))
  fail(409,'Imported guardian identity requires administrator reconciliation.');
 return guardian.email;
};
const checkContact=(contact,reg,guardian)=>{
 if(!contact||contact.personId!==guardian.personId||contact.familyId!==reg.familyId||contact.institutionId!=='raaga')
  fail(409,'Contact uniqueness guard requires administrator reconciliation.');
};
export function createCanonicalRaagaInvitationFlow(ops,env=process.env,now=()=>new Date().toISOString(),newId){
 const getId=()=>{if(typeof newId!=='function')throw new Error('Invitation operation ID generator not configured');return newId();};
 return {
  async invite(reg,guardian,actorSub){
   if(!enabled(env,'SADHANA_FINAL_RAAGA_PARENT_INVITATIONS'))fail(503,'Canonical parent invitations are disabled.');
   const email=verify(reg,guardian,actorSub);
   if(reg.provisioningStatus!=='NOT_INVITED'||reg.parentAccountSub||reg.parentAccountUsername||reg.invitationOperationId)
    fail(409,'Parent invitation state changed. Refresh and review.');
   checkContact(await ops.contact(email),reg,guardian);
   const lookup=await ops.listByEmail(email);
   if(lookup.paginated||lookup.count!==0)
    fail(409,'An account may already exist for this contact. Independently verify and link it instead.');
   const operationId=getId(),requestedAt=now(),username=usernameFor(reg.registrationId);
   try{await ops.reserveInvite(reg,guardian,actorSub,operationId,requestedAt);}
   catch(e){if(['TransactionCanceledException','ConditionalCheckFailedException'].includes(e?.name))
    fail(409,'Another invitation attempt or account change is already recorded. Do not retry blindly.');throw e;}
   let user;
   try{user=await ops.createUser(username,email,String(guardian.displayName||guardian.firstName||'Parent').slice(0,90));}
   catch(e){fail(409,`Invitation reservation requires administrator reconciliation (${String(e?.name||'CognitoFailure').slice(0,80)}).`);}
   const subject=attr(user?.Attributes,'sub');
   if(user?.Username!==username||!subPattern.test(subject))
    fail(409,'Cognito account creation response requires manual reconciliation.');
   try{await ops.completeInvite(reg,operationId,username,email,subject,now());}
   catch{fail(409,'Cognito accepted an invitation, but the canonical receipt needs reconciliation. Do not retry creation.');}
   return {status:'INVITATION_SENT',invitationSent:true,guardianAccessGranted:false,
    message:'Cognito accepted the invitation request. Email delivery is not guaranteed; the parent must finish sign-in and account linking before viewing student records.'};
  },
  async resend(reg,guardian,actorSub){
   if(!enabled(env,'SADHANA_FINAL_RAAGA_PARENT_RESENDS'))fail(503,'Canonical invitation resends are disabled.');
   const email=verify(reg,guardian,actorSub);
   if(reg.provisioningStatus!=='INVITATION_SENT'||!subPattern.test(reg.parentAccountSub||'')||
     !validEmail(reg.parentAccountEmail)||!reg.parentAccountUsername||
     reg.parentAccountUsername!==usernameFor(reg.registrationId)||reg.parentAccountEmail!==email)
    fail(409,'Pending invitation metadata requires administrator reconciliation.');
   checkContact(await ops.contact(email),reg,guardian);
   const user=await ops.getUser(reg.parentAccountUsername);
   if(user?.Enabled!==true||user.UserStatus!=='FORCE_CHANGE_PASSWORD'||
     attr(user.UserAttributes,'email').toLowerCase()!==email||
     attr(user.UserAttributes,'sub')!==reg.parentAccountSub)
    fail(409,'Cognito identity is active, disabled or inconsistent; do not resend an invitation.');
   const operationId=getId(),requestedAt=now(),threshold=new Date(Date.parse(requestedAt)-60000).toISOString();
   try{await ops.reserveResend(reg,guardian,actorSub,operationId,requestedAt,threshold);}
   catch(e){if(['TransactionCanceledException','ConditionalCheckFailedException'].includes(e?.name))
    fail(429,'Invitation recently requested or account changed. Wait and refresh.');throw e;}
   // Keep the attempt timestamp if AWS fails or its response is ambiguous. A later
   // retry is bounded by the independent DynamoDB conditional cooldown.
   await ops.sendResend(reg.parentAccountUsername);
   try{await ops.completeResend(reg,actorSub,operationId,now());}
   catch{fail(409,'Cognito accepted a resend, but the canonical receipt needs reconciliation.');}
   return {status:'INVITATION_SENT',requestedAt,guardianAccessGranted:false,
    message:'Cognito accepted the resend request. Email delivery is not guaranteed.'};
  }
 };
}
