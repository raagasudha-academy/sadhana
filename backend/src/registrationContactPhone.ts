/** Cognito phone_number must be E.164. Do not invent a number or mark it verified. */
export function registrationContactPhone(raw:unknown):string|undefined {
 if(typeof raw!=='string')return undefined;
 const value=raw.trim();
 // Accept a standard E.164 value, with optional visual separators commonly used on forms.
 if(!/^\+[0-9\s().-]{7,30}$/.test(value))return undefined;
 const compact='+'+value.slice(1).replace(/[\s().-]/g,'');
 return /^\+[1-9][0-9]{7,14}$/.test(compact)?compact:undefined;
}
