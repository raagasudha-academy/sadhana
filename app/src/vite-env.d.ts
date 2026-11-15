/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SADHANA_COGNITO_ISSUER?: string;
  readonly VITE_SADHANA_COGNITO_CLIENT_ID?: string;
  readonly VITE_SADHANA_COGNITO_DOMAIN?: string;
  readonly VITE_SADHANA_API_URL?: string;
  readonly VITE_SADHANA_EMAIL_LOGIN_PROXY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
