/** HTML is for Cognito custom-message / administrator review; no direct SES sender. */
const escapeHTML=(x:string)=>x.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
export function parentInvitationTemplate(name:string,temporaryPassword:string,loginUrl:string){
 if(!/^https:\/\//.test(loginUrl))throw Error('HTTPS login required');
 const safeName=escapeHTML(name.slice(0,100));
 const safeUrl=escapeHTML(loginUrl);
 const safePassword=escapeHTML(temporaryPassword);
 const html=`<div style="max-width:560px;margin:auto;font:16px Arial,sans-serif;color:#233044"><h1 style="color:#8b5e3c">Welcome to Sadhana</h1><p>Hello ${safeName},</p><p>Your account for the Academy &amp; Learning Portal is ready.</p><p><a href="${safeUrl}">Open Sadhana securely</a></p><p>Temporary password: <strong>${safePassword}</strong></p><p>You'll be prompted to set a new password when you first sign in.</p><p>Student and guardian access are verified separately by the academy.</p><p>If you weren't expecting this invitation, contact the academy.</p></div>`;
 const text=`Welcome to Sadhana\n\nHello ${name.slice(0,100)},\nVisit ${loginUrl}\nTemporary password: ${temporaryPassword}\nYou will be asked to change this password. Student and guardian access require separate academy verification.`;
 return {html,text};
}
