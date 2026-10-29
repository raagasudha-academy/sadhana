/** Sadhana staff Cognito sign-in. Authorization is enforced by API Gateway + Lambda, never here alone. */
import { useEffect, useMemo, useState } from 'react';
import { AuthProvider, useAuth } from 'react-oidc-context';
import { WebStorageStateStore } from 'oidc-client-ts';
import { ArrowRight, LockKeyhole, ShieldCheck, LogOut, AlertCircle, GraduationCap, BookOpen } from 'lucide-react';
import App from './App';
import AcademyBrandIcon from './AcademyBrandIcon';
import CognitoPassword, {readPasswordSession,clearPasswordSession,refreshPasswordSession,revokePasswordSession} from './CognitoPassword';
import { createSadhanaApi } from './api/sadhanaClient';
import type { SadhanaApiClient, StaffResponse } from './api/sadhanaClient';
import BrandIcon from './BrandIcon';

const config = {
  issuer: import.meta.env.VITE_SADHANA_COGNITO_ISSUER?.trim() || '',
  clientId: import.meta.env.VITE_SADHANA_COGNITO_CLIENT_ID?.trim() || '',
  domain: import.meta.env.VITE_SADHANA_COGNITO_DOMAIN?.trim().replace(/\/$/, '') || '',
  apiUrl: import.meta.env.VITE_SADHANA_API_URL?.trim().replace(/\/$/, '') || '',
};
const configured = Object.values(config).every(Boolean);
// Vite base is '/' for localhost and '/repo/' for GitHub project Pages.
const applicationUrl = () => new URL(import.meta.env.BASE_URL || '/', window.location.origin).href;
const partlyConfigured = Object.values(config).some(Boolean);
const cognitoDomain = (value: string) => /^https:\/\/[a-z0-9.-]+\.amazoncognito\.com$/i.test(value)
  || /^https:\/\/[a-z0-9.-]+\.auth\.[a-z0-9-]+\.amazoncognito\.com$/i.test(value)
  || /^https:\/\/[a-z0-9.-]+$/i.test(value); // Cognito custom domains

export interface CloudSession {
  staff: StaffResponse;
  api: SadhanaApiClient;
  signOut: () => Promise<void>;
}

function AuthCard({title,children,kind='welcome'}: {title:string;children:React.ReactNode;kind?:'welcome'|'signedout'}) {
  return <main className="auth-shell">
    <section className="auth-brand-panel" aria-label="About Sadhana">
      <div className="auth-brand-head"><span className="auth-brand-mark auth-brand-mark--50"><AcademyBrandIcon /></span><div><strong>Sadhana</strong><small>ACADEMY &amp; LEARNING PORTAL</small></div></div>
      <div className="auth-brand-copy"><span className="auth-kicker">LEARN · PRACTISE · GROW</span><h2>Welcome to Sadhana.</h2></div>
      <div className="auth-brand-programmes">
        <span><img src={`${import.meta.env.BASE_URL}branding/raaga.webp`} alt="" className="auth-academy-emblem" /> Raagasudha Music Academy</span>
        <span><img src={`${import.meta.env.BASE_URL}branding/sruti.webp`} alt="" className="auth-academy-emblem" /> Śruti School of Vedic Learning</span>
      </div>
    </section>
    <section className={`auth-signin-panel${kind==='signedout'?' auth-signin-panel--signedout':''}`}><div className={`auth-card${kind==='signedout'?' auth-card--signedout':' auth-card--welcome'}`}>
      <div className="auth-mobile-identity"><span className="auth-icon"><BrandIcon /></span><strong>Sadhana</strong></div>
      <div className="auth-card-heading">
        <div className="auth-illustration">{kind==='signedout'?<LogOut size={26}/>:<ShieldCheck size={26}/>}</div>
        <h1>{title}</h1>
      </div>
      {children}
      <p className="auth-footnote">Secure access powered by your Sadhana account.</p>
    </div></section>
  </main>;
}
function SignedOut(){return <AuthCard title="Signed out" kind="signedout"><p>Your session has ended.</p><button className="auth-primary" type="button" onClick={()=>{sessionStorage.removeItem("sadhana_signed_out");window.location.assign(applicationUrl())}}>Sign in again <ArrowRight size={17}/></button></AuthCard>}
function SignInGate() {
  const auth = useAuth();
  const [staff, setStaff] = useState<StaffResponse | null>(null);
  const [apiError, setApiError] = useState('');
  const [signedOut,setSignedOut]=useState(()=>sessionStorage.getItem('sadhana_signed_out')==='1');
  const [checking, setChecking] = useState(false);
  const [passwordSession,setPasswordSession]=useState(readPasswordSession);
  const region=config.issuer.match(/cognito-idp\.([a-z0-9-]+)\.amazonaws\.com/)?.[1]||'us-east-1';
  const token = auth.user?.access_token || passwordSession?.accessToken || '';
  const signedIn=auth.isAuthenticated||Boolean(passwordSession?.accessToken);
  useEffect(()=>{
    if(!passwordSession)return;
    let active=true;
    const update=()=>{const current=readPasswordSession();if(!current)return;
      void refreshPasswordSession(region,config.clientId,current).then(next=>{if(active&&next.accessToken!==current.accessToken)setPasswordSession(next);}).catch(()=>{
        if(active){clearPasswordSession();setPasswordSession(null);setApiError('Your session has expired. Please sign in again.');}
      });
    };
    update();const handle=window.setInterval(update,30000);
    return()=>{active=false;window.clearInterval(handle);};
  },[Boolean(passwordSession),region]);
  const api = useMemo(() => createSadhanaApi({baseUrl:config.apiUrl,getAccessToken:()=>token}),[token]);
  useEffect(() => {
    if(!signedIn || !token) {setStaff(null);setApiError('');return;}
    let alive=true;
    setChecking(true);setApiError('');setStaff(null);
    api.currentStaff().then(data => {if(alive)setStaff(data);}).catch(error => {if(alive)setApiError(error instanceof Error?error.message:'Unable to confirm permissions.');}).finally(()=>{if(alive)setChecking(false);});
    return ()=>{alive=false;};
  },[api,signedIn,token]);
  const signOut=async()=>{
    // Cognito managed-login logout accepts logout_uri, not post_logout_redirect_uri.
    // Use an already-authorised application root as the callback; do not append query strings.
    sessionStorage.setItem('sadhana_signed_out','1');
    setSignedOut(true);
    try {
      const activePasswordSession=readPasswordSession();
      clearPasswordSession();
      setPasswordSession(null);
      await revokePasswordSession(region,config.clientId,activePasswordSession);
      await auth.removeUser();
      const host=config.domain.startsWith('https://')?config.domain:`https://${config.domain}`;
      const url=new URL('/logout',host);
      url.searchParams.set('client_id',config.clientId);
      url.searchParams.set('logout_uri',applicationUrl());
      window.location.assign(url.toString());
    } catch(e) {
      sessionStorage.removeItem('sadhana_signed_out');
      setSignedOut(false);
      setApiError(e instanceof Error?e.message:'Could not sign out.');
    }
  };
  if(!signedIn&&signedOut&&!auth.isLoading)return <SignedOut/>;
  if(signedIn&&(checking||!staff&&!apiError))return <AuthCard title="Securing your workspace"><p>Checking your sign-in and permissions…</p></AuthCard>;
  if(!signedIn&&auth.isLoading)return <AuthCard title="Securing your workspace"><p>Checking your sign-in…</p></AuthCard>;
  if(!signedIn&&auth.error)return <AuthCard title="Sign-in needs attention"><p role="alert">{auth.error.message}</p><button className="auth-primary" onClick={()=>void auth.signinRedirect()}>Try another sign-in method <ArrowRight size={17}/></button></AuthCard>;
  if(!signedIn)return <AuthCard title="Sign in to Sadhana"><CognitoPassword region={region} clientId={config.clientId}
    onAuthenticated={next=>{sessionStorage.removeItem('sadhana_signed_out');setSignedOut(false);setPasswordSession(next);}}
    onManagedLogin={()=>void auth.signinRedirect()}/></AuthCard>;
  if(apiError||!staff) return <AuthCard title="Permission check failed"><div className="auth-error" role="alert"><AlertCircle size={18}/><span>{apiError||'No staff authorization was returned.'}</span></div><p>Signing in alone is not sufficient. Your Sadhana account needs an authorised staff group.</p><button className="auth-primary" onClick={()=>window.location.reload()}>Retry API check</button><button className="auth-secondary" onClick={()=>void signOut()}><LogOut size={15}/> Sign out</button></AuthCard>;
  // Cognito ID-token profile carries display attributes; the API remains the role authority.
  const profile=auth.user?.profile;
  const apiName=String(staff.displayName||'').trim();
  const profileName=String(profile?.name||[profile?.given_name,profile?.family_name].filter(Boolean).join(' ')||profile?.preferred_username||'').trim();
  // API role remains authoritative. Use verified identity presentation where a generic learner label was returned.
  const displayName=(staff.role==='learner'&&(!apiName||apiName==='Student / Family'))
    ? (profileName||String(profile?.email||'').split('@')[0]||apiName||'Student / Family')
    : (apiName||profileName||String(profile?.email||'').split('@')[0]||'');
  const session={staff:{...staff,displayName},api,signOut};
  return <App cloud={session} />;
}

export default function CloudAuth() {
  if(!configured) return partlyConfigured
    ? <AuthCard title="Complete Sadhana configuration"><p>Add the real Cognito managed-login domain to <code>VITE_SADHANA_COGNITO_DOMAIN</code> in <code>.env.local</code>, and restart Vite.</p></AuthCard>
    : <App />;
  if(!/^https:\/\/cognito-idp\.us-east-1\.amazonaws\.com\/us-east-1_[A-Za-z0-9]+$/.test(config.issuer)
    || !cognitoDomain(config.domain) || !config.apiUrl.startsWith('https://')) {
    return <AuthCard title="Check Sadhana configuration"><p>Check the Cognito issuer, hosted login domain and HTTPS API URL in <code>.env.local</code>. Do not enter AWS credentials into Vite variables.</p></AuthCard>;
  }
  return <AuthProvider
    authority={config.issuer}
    client_id={config.clientId}
    redirect_uri={applicationUrl()}
    post_logout_redirect_uri={applicationUrl()}
    response_type="code"
    scope="openid email phone"
    userStore={new WebStorageStateStore({store:window.sessionStorage})}
    automaticSilentRenew={true}
    onSigninCallback={()=>window.history.replaceState({},document.title,window.location.pathname)}
  ><SignInGate/></AuthProvider>;
}
