/** User-safe diagnostics for the private /teachers/me identity lookup. Never fail open. */
export function teacherIdentityFailureMessage(error:unknown):string{
 const raw=error instanceof Error?error.message:String(error||'');
 if(/\b404\b|unknown endpoint|not found/i.test(raw))return 'Teacher identity verification is unavailable on the running API (404). Deploy the current development backend before using Teacher view.';
 if(/\b(401|403)\b|unauthori[sz]ed|forbidden|permission|access denied/i.test(raw))return 'Teacher identity verification was denied by the API. Check the signed-in account and academy access; no classes are shown.';
 return 'Unable to verify assigned classes. Check the API connection and retry; no classes are shown.';
}
