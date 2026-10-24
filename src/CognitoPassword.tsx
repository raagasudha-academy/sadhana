import {useEffect,useState} from 'react';
import {ArrowRight} from 'lucide-react';
import './cognitoPassword.css';

type Tokens={accessToken:string;idToken:string;refreshToken:string;expiresAt:number;username:string};
type Challenge={name:string;session:string;username:string;parameters:Record<string,string>};
const KEY='sadhana_password_session_v1';
const allowedChallenges=new Set(['SMS_MFA','SOFTWARE_TOKEN_MFA','EMAIL_OTP','SMS_OTP','NEW_PASSWORD_REQUIRED','PASSWORD','SELECT_CHALLENGE']);
const message=(err:unknown)=>err instanceof Error?err.message:'Authentication failed. Please try again.';

export function readPasswordSession():Tokens|null{
 try {const v=JSON.parse(sessionStorage.getItem(KEY)||'null') as Tokens|null;return v&&v.accessToken&&v.expiresAt? v:null;}catch{return null;}
}
export function clearPasswordSession(){sessionStorage.removeItem(KEY);}
const save=(tokens:Tokens)=>{sessionStorage.setItem(KEY,JSON.stringify(tokens));return tokens;};

/** Browser-side Cognito public app-client calls. Never use an app-client secret or AWS credentials. */
async function cognito(region:string, action:string, body:Record<string,unknown>){
 const res=await fetch(`https://cognito-idp.${region}.amazonaws.com/`,{
  method:'POST',headers:{'Content-Type':'application/x-amz-json-1.1','X-Amz-Target':`AWSCognitoIdentityProviderService.${action}`},
  body:JSON.stringify(body)
 });
 const data=await res.json().catch(()=>({})) as Record<string,any>;
 if(!res.ok){throw Error(String(data.message||data.Message||'Cognito could not complete the operation.'));}
 return data;
}
const makeTokens=(r:Record<string,any>,username:string,oldRefresh=''):Tokens=>{
 const a=r.AuthenticationResult;
 if(!a?.AccessToken||!a?.IdToken)throw Error('Authentication did not return a complete session.');
 return save({accessToken:a.AccessToken,idToken:a.IdToken,refreshToken:a.RefreshToken||oldRefresh,
  expiresAt:Date.now()+Math.max(30,Number(a.ExpiresIn||3600)-60)*1000,username});
};
export async function revokePasswordSession(region:string,clientId:string,current:Tokens|null){
 if(!current?.refreshToken)return;
 try{await cognito(region,'RevokeToken',{ClientId:clientId,Token:current.refreshToken});}catch{ /* Local logout remains effective even if revocation is unavailable. */ }
}
export async function refreshPasswordSession(region:string,clientId:string,current:Tokens):Promise<Tokens>{
 if(current.expiresAt>Date.now()+30_000)return current;
 if(!current.refreshToken)throw Error('Your session expired. Please sign in again.');
 const r=await cognito(region,'InitiateAuth',{AuthFlow:'REFRESH_TOKEN_AUTH',ClientId:clientId,AuthParameters:{REFRESH_TOKEN:current.refreshToken}});
 return makeTokens(r,current.username,current.refreshToken);
}

export default function CognitoPassword({region,clientId,onAuthenticated,onManagedLogin}:{region:string;clientId:string;onAuthenticated:(token:Tokens)=>void;onManagedLogin:()=>void}){
 const [username,setUsername]=useState('');const [password,setPassword]=useState('');
 const [challenge,setChallenge]=useState<Challenge|null>(null);const [answer,setAnswer]=useState('');
 const [newPassword,setNewPassword]=useState('');const [mode,setMode]=useState<'login'|'reset'|'confirm-reset'>('login');
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [info,setInfo]=useState('');
 const [resetCode,setResetCode]=useState('');
 useEffect(()=>{setError('');},[mode]);
 const accepted=(r:Record<string,any>,user:string)=>{
  if(r.AuthenticationResult){onAuthenticated(makeTokens(r,user));return;}
  const name=String(r.ChallengeName||'');
  if(!allowedChallenges.has(name))throw Error(`Cognito requested ${name||'an unsupported challenge'}. Please use Secure Cognito sign-in below.`);
  setChallenge({name,session:String(r.Session||''),username:user,parameters:r.ChallengeParameters||{}});
  setAnswer('');setNewPassword('');
 };
 const handleLogin=async()=>{
  const user=username.trim();if(!user||!password)return;
  setBusy(true);setError('');
  try{
   const r=await cognito(region,'InitiateAuth',{AuthFlow:'USER_AUTH',ClientId:clientId,
    AuthParameters:{USERNAME:user,PASSWORD:password,PREFERRED_CHALLENGE:'PASSWORD'}});
   accepted(r,user);
  }catch(e){setError(message(e));}finally{setBusy(false);}
 };
 const handleChallenge=async()=>{
  if(!challenge)return;
  setBusy(true);setError('');
  try{
   let response:Record<string,string>={USERNAME:challenge.username};
   if(challenge.name==='SELECT_CHALLENGE'){
    response={...response,ANSWER:'PASSWORD',PASSWORD:password};
   }else if(challenge.name==='PASSWORD'){
    response={...response,PASSWORD:password};
   }else if(challenge.name==='NEW_PASSWORD_REQUIRED'){
    response={...response,NEW_PASSWORD:newPassword};
   }else{
    response={...response,[challenge.name==='SMS_MFA'?'SMS_MFA_CODE':challenge.name==='SOFTWARE_TOKEN_MFA'?'SOFTWARE_TOKEN_MFA_CODE':challenge.name==='EMAIL_OTP'?'EMAIL_OTP_CODE':'SMS_OTP_CODE']:answer.trim()};
   }
   const r=await cognito(region,'RespondToAuthChallenge',{ClientId:clientId,ChallengeName:challenge.name,Session:challenge.session,ChallengeResponses:response});
   accepted(r,challenge.username);
  }catch(e){setError(message(e));}finally{setBusy(false);}
 };
 const handleReset=async()=>{
  setBusy(true);setError('');
  try{
   await cognito(region,'ForgotPassword',{ClientId:clientId,Username:username.trim()});
   setMode('confirm-reset');setInfo('If your account supports recovery, a verification code has been sent.');
  }catch(e){setError(message(e));}finally{setBusy(false);}
 };
 const handleConfirmReset=async()=>{
  setBusy(true);setError('');
  try{
   await cognito(region,'ConfirmForgotPassword',{ClientId:clientId,Username:username.trim(),ConfirmationCode:resetCode.trim(),Password:newPassword});
   setPassword('');setNewPassword('');setResetCode('');setMode('login');setInfo('Password updated. Sign in using your new password.');
  }catch(e){setError(message(e));}finally{setBusy(false);}
 };
 return <div className="sadhana-password-form">
  <form className="password-form" onSubmit={e=>{e.preventDefault();void(challenge?handleChallenge():mode==='reset'?handleReset():mode==='confirm-reset'?handleConfirmReset():handleLogin());}}>
   {!challenge&&<label className="password-field">Username or email<input autoComplete="username" placeholder="Enter your username or email" required value={username} onChange={e=>setUsername(e.target.value)}/></label>}
   {!challenge&&mode==='login'&&<label className="password-field">Password<input type="password" autoComplete="current-password" placeholder="Enter your password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>}
   {challenge&&<><p>{challenge.name==='NEW_PASSWORD_REQUIRED'?'Choose a new password':challenge.name==='SELECT_CHALLENGE'?'Confirm password sign-in':challenge.name==='PASSWORD'?'Enter password to continue':'Enter the verification code from Cognito'}</p>
    {challenge.name==='NEW_PASSWORD_REQUIRED'?<input type="password" autoComplete="new-password" required value={newPassword} onChange={e=>setNewPassword(e.target.value)}/>:challenge.name==='SELECT_CHALLENGE'||challenge.name==='PASSWORD'?null:<input autoComplete="one-time-code" required value={answer} onChange={e=>setAnswer(e.target.value)}/>}</>}
   {!challenge&&mode==='confirm-reset'&&<><label className="password-field">Verification code<input required autoComplete="one-time-code" value={resetCode} onChange={e=>setResetCode(e.target.value)}/></label><label className="password-field">New password<input type="password" autoComplete="new-password" required value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label></>}
   {error&&<p role="alert" className="auth-error">{error}</p>}
   {info&&<p role="status">{info}</p>}
   <button className="auth-primary password-submit" type="submit" disabled={busy}>{busy?'Please wait…':challenge?'Continue':mode==='reset'?'Send reset code':mode==='confirm-reset'?'Reset password':'Sign in'} <ArrowRight size={17}/></button>
  </form>
  {!challenge&&mode==='login'&&<button type="button" className="auth-secondary password-text-link" onClick={()=>{setMode('reset');setError('');}}>Forgot password?</button>}
  {(challenge||mode!=='login')&&<button type="button" className="auth-secondary password-text-link" onClick={()=>{setChallenge(null);setMode('login');setError('');}}>Back to sign in</button>}
  <button type="button" className="auth-secondary password-fallback" onClick={onManagedLogin}>Use secure Cognito sign-in instead</button>
 </div>;
}
