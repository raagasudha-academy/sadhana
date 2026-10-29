/** Cognito Custom Message trigger. Configure ONLY with Cognito SES DEVELOPER sending. */
import {parentInvitationTemplate} from './parentInvitationTemplate.ts';

type Attribute = Record<string,string|undefined>;
export type InvitationEvent = {
  triggerSource:string;
  request:{userAttributes?:Attribute;codeParameter?:string;usernameParameter?:string};
  response:{emailSubject?:string;emailMessage?:string;smsMessage?:string};
};
/** Fail closed: never send a placeholder password or include user-supplied HTML. */
export function buildInvitationMessage(event:InvitationEvent,loginUrl:string):InvitationEvent {
  if(event.triggerSource!=='CustomMessage_AdminCreateUser')return event;
  const code=event.request?.codeParameter;
  const username=event.request?.usernameParameter;
  if(!code || !username || !/^\{[^{}]+\}$/.test(code) || !/^\{[^{}]+\}$/.test(username))
    throw Error('Cognito invitation placeholders missing');
  const name=event.request.userAttributes?.name || 'there';
  const invitation=parentInvitationTemplate(name,code,loginUrl);
  event.response.emailSubject='Welcome to Sadhana — set up your account';
  event.response.emailMessage=invitation.html + `<p style="font:12px Arial,sans-serif">Sign-in username: ${escapeHtml(username)}</p>`;
  // Do not mutate SMS; only customize the email delivery path.
  return event;
}
function escapeHtml(x:string){return x.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));}
export async function handler(event:InvitationEvent):Promise<InvitationEvent> {
  const url=process.env.SADHANA_PARENT_LOGIN_URL;
  if(!url)throw Error('SADHANA_PARENT_LOGIN_URL not set');
  return buildInvitationMessage(event,url);
}
