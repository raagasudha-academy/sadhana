/** Sadhana staff Cognito sign-in. Authorization is enforced by API Gateway + Lambda, never here alone. */
import { useEffect, useMemo, useState } from 'react';
import { AuthProvider, useAuth } from 'react-oidc-context';
import { WebStorageStateStore } from 'oidc-client-ts';
import { ArrowRight, LockKeyhole, ShieldCheck, LogOut, AlertCircle } from 'lucide-react';
import App from './App';
import BrandIcon from './BrandIcon';
import { createSadhanaApi } from './api/sadhanaClient';
import type { SadhanaApiClient, StaffResponse } from './api/sadhanaClient';

const config = {
  issuer: import.meta.env.VITE_SADHANA_COGNITO_ISSUER?.trim() || '',
  clientId: import.meta.env.VITE_SADHANA_COGNITO_CLIENT_ID?.trim() || '',
  domain: import.meta.env.VITE_SADHANA_COGNITO_DOMAIN?.trim().replace(/\/$/, '') || '',
  apiUrl: import.meta.env.VITE_SADHANA_API_URL?.trim().replace(/\/$/, '') || '',
};
const configured = Object.values(config).every(Boolean);
const partlyConfigured = Object.values(config).some(Boolean);
const cognitoDomain = (value: string) => /^https:\/\/[a-z0-9.-]+\.amazoncognito\.com$/i.test(value)
  || /^https:\/\/[a-z0-9.-]+\.auth\.[a-z0-9-]+\.amazoncognito\.com$/i.test(value)
  || /^https:\/\/[a-z0-9.-]+$/i.test(value); // Cognito custom domains

export interface CloudSession {
  staff: StaffResponse;
  api: SadhanaApiClient;
  signOut: () => Promise<void>;
}

function AuthCard({title,children}: {title:string;children:React.ReactNode}) {
  return <div className="auth-landing"><div className="auth-card">
    <div className="auth-identity"><span className="auth-icon"><BrandIcon /></span><div><strong>Sadhana</strong><small>ACADEMY &amp; LEARNING PORTAL</small></div></div>
    <div className="auth-illustration"><ShieldCheck size={34}/></div>
    <h1>{title}</h1>{children}
    <p className="auth-footnote">Raagasudha × Śruti Vedam · Staff-only access</p>
  </div></div>;
}
function SignInGate() {
  const auth = useAuth();
  const [staff, setStaff] = useState<StaffResponse | null>(null);
  const [apiError, setApiError] = useState('');
  const [checking, setChecking] = useState(false);
  const token = auth.user?.access_token || '';
  const api = useMemo(() => createSadhanaApi({baseUrl:config.apiUrl,getAccessToken:()=>token}),[token]);
  useEffect(() => {
    if(!auth.isAuthenticated || !token) {setStaff(null);setApiError('');return;}
    let alive=true;
    setChecking(true);setApiError('');setStaff(null);
    api.currentStaff().then(data => {if(alive)setStaff(data);}).catch(error => {if(alive)setApiError(error instanceof Error?error.message:'Unable to confirm permissions.');}).finally(()=>{if(alive)setChecking(false);});
    return ()=>{alive=false;};
  },[api,auth.isAuthenticated,token]);
  const signOut=async()=>{
    try { await auth.signoutRedirect({post_logout_redirect_uri:window.location.origin+'/'}); }
    catch(e) { setApiError(e instanceof Error?e.message:'Could not sign out.'); }
  };
  if(auth.isLoading||auth.activeNavigator||checking||(auth.isAuthenticated&&!!token&&!staff&&!apiError)) return <AuthCard title="Securing your workspace"><p>Checking your sign-in and permissions…</p></AuthCard>;
  if(auth.error) return <AuthCard title="Sign-in needs attention"><p role="alert">{auth.error.message}</p><button className="auth-primary" onClick={()=>void auth.signinRedirect()}>Try signing in again <ArrowRight size={17}/></button></AuthCard>;
  if(!auth.isAuthenticated) return <AuthCard title="Welcome to Sadhana"><p>Sign in with your staff email, verified phone number or username. Your authenticator app may be requested.</p><button className="auth-primary" onClick={()=>void auth.signinRedirect()}><LockKeyhole size={18}/> Sign in with Cognito <ArrowRight size={17}/></button><div className="auth-small">Staff accounts are invitation-only. No public registration.</div></AuthCard>;
  if(apiError||!staff) return <AuthCard title="Permission check failed"><div className="auth-error" role="alert"><AlertCircle size={18}/><span>{apiError||'No staff authorization was returned.'}</span></div><p>Your Cognito login alone is not sufficient. Your Sadhana account needs an authorised staff group.</p><button className="auth-primary" onClick={()=>window.location.reload()}>Retry API check</button><button className="auth-secondary" onClick={()=>void signOut()}><LogOut size={15}/> Sign out</button></AuthCard>;
  // Cognito ID-token profile carries display attributes; the API remains the role authority.
  const profile=auth.user?.profile;
  const displayName=String(staff.displayName || profile?.name || profile?.given_name || profile?.preferred_username ||
    profile?.email?.split('@')[0] || '').trim();
  return <App cloud={{staff:{...staff,displayName},api,signOut}} />;
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
    redirect_uri={`${window.location.origin}/`}
    post_logout_redirect_uri={`${window.location.origin}/`}
    response_type="code"
    scope="openid email phone"
    userStore={new WebStorageStateStore({store:window.sessionStorage})}
    automaticSilentRenew={true}
    onSigninCallback={()=>window.history.replaceState({},document.title,window.location.pathname)}
  ><SignInGate/></AuthProvider>;
}
