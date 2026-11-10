/** Branded Cognito invitation, with the code placeholder preserved for Cognito. */
const escapeHTML=(x:string)=>x.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
export function parentInvitationTemplate(name:string,temporaryPassword:string,loginUrl:string,email?:string){
 const url=new URL(loginUrl);
 if(url.protocol!=='https:' || url.username || url.password || url.hash || url.hostname!=='raagasudha-academy.github.io' || !['/sadhana/','/sadhana'].includes(url.pathname))throw Error('Approved Sadhana HTTPS login URL required');
 const safeName=escapeHTML(name.slice(0,100));
 const safeUrl=escapeHTML(url.toString());
 const safePassword=escapeHTML(temporaryPassword);
 const safeEmail=email?escapeHTML(email.trim().toLowerCase()):'';
 const signIn=safeEmail?`<p><strong>Sign-in email:</strong> ${safeEmail}</p>`:'';
 const html=`<div style="background:#f7f8fb;padding:28px 12px;font-family:Arial,sans-serif;color:#233044"><div style="max-width:560px;margin:auto;background:#fff;border:1px solid #d8dee8;border-radius:16px;overflow:hidden"><div style="padding:26px 32px;background:#142743;color:#fff"><div style="font-size:12px;letter-spacing:2px;color:#e7c47b">Raagasudha &amp; Śruti</div><h1 style="margin:12px 0 0;font-size:26px;color:#fff">Welcome to Sadhana</h1><p style="margin:7px 0 0;color:#e1e8f1">Academy &amp; Learning Portal</p></div><div style="padding:26px 32px"><p>Hello ${safeName},</p><p>Your portal account has been created. Sign in using your invitation details below.</p><p style="margin:24px 0"><a href="${safeUrl}" style="background:#142743;color:white;padding:13px 22px;text-decoration:none;border-radius:8px;display:inline-block">Open Sadhana Portal</a></p>${signIn}<p><strong>Temporary password:</strong> <span style="font-family:monospace">${safePassword}</span></p><p>Use your email address to sign in. You will be asked to choose a new password at first sign-in.</p><p>Access to a child's records is granted only after the academy verifies your relationship and approves access.</p><p style="font-size:12px;color:#68758a">If you weren't expecting this invitation, please contact the academy. Do not forward your temporary password.</p></div></div></div>`;
 const text=`Welcome to Sadhana — Academy & Learning Portal\n\nHello ${name.slice(0,100)},\nSign in: ${url.toString()}\n${email?`Email: ${email.trim().toLowerCase()}\n`:''}Temporary password: ${temporaryPassword}\nChange your password at first sign-in. Guardian access requires separate academy approval.`;
 return {html,text};
}
