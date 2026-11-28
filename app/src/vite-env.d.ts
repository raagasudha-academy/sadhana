/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SADHANA_COGNITO_ISSUER?: string;
  readonly VITE_SADHANA_COGNITO_CLIENT_ID?: string;
  readonly VITE_SADHANA_COGNITO_DOMAIN?: string;
  readonly VITE_SADHANA_API_URL?: string;
  readonly VITE_SADHANA_EMAIL_LOGIN_PROXY?: string;
  readonly VITE_SWARAMITRA_HEALTH_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
