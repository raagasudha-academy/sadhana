/** Cognito Custom Message trigger. Configure ONLY with Cognito SES DEVELOPER sending. */
import {parentInvitationTemplate} from './parentInvitationTemplate.ts';

type Attribute = Record<string,string|undefined>;
export type InvitationEvent = {
  triggerSource:string;
  request:{userAttributes?:Attribute;codeParameter?:string;usernameParameter?:string};
  response:{emailSubject?:string;emailMessage?:string;smsMessage?:string};
};
const escapeHtml=(x:string)=>x.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
/** Invitation placeholders must survive Cognito template processing. */
export function buildInvitationMessage(event:InvitationEvent,loginUrl:string):InvitationEvent {
  if(event.triggerSource!=='CustomMessage_AdminCreateUser')return event;
  const code=event.request?.codeParameter;
  const username=event.request?.usernameParameter;
  if(!code || !username || !/^\{[^{}]+\}$/.test(code) || !/^\{[^{}]+\}$/.test(username))
    throw Error('Cognito invitation placeholders missing');
  const email=String(event.request.userAttributes?.email||'').trim().toLowerCase();
  if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))throw Error('Verified-format account email required for invitation');
  const name=event.request.userAttributes?.name || 'there';
  const invitation=parentInvitationTemplate(name,code,loginUrl,email);
  event.response.emailSubject='Welcome to Sadhana — set up your account';
  // Cognito requires BOTH placeholders for AdminCreateUser. Keep the opaque internal
  // username available for Cognito substitution, but not as an on-screen login instruction.
  event.response.emailMessage=invitation.html + `<span style="display:none" aria-hidden="true">${escapeHtml(username)}</span>`;
  return event;
}
export async function handler(event:InvitationEvent):Promise<InvitationEvent> {
  const url=process.env.SADHANA_PARENT_LOGIN_URL;
  if(!url)throw Error('SADHANA_PARENT_LOGIN_URL not set');
  return buildInvitationMessage(event,url);
}
