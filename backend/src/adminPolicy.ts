/** Pure checks for Cognito administrator management; never use UI state as authority. */
import { demandAnyAdmin, permittedInstitutions, httpError } from './model.ts';
import type { Claims, InstitutionId } from './model.ts';

export const adminGroup: Record<InstitutionId, string> = {
  raaga: 'raagasudha-admin', sruti: 'sruti-admin',
};

export function canManageAdmins(claims: Claims, configuredSub: string): boolean {
  return Boolean(configuredSub && claims.sub === configuredSub &&
    permittedInstitutions(claims).length === 2);
}
export function requireAdminManager(claims: Claims, configuredSub: string): void {
  demandAnyAdmin(claims);
  if (!canManageAdmins(claims,configuredSub))
    throw httpError(403,'Only the designated Sadhana administrator may manage accounts.');
}
export function readInstitution(value: unknown): InstitutionId {
  if(value !== 'raaga' && value !== 'sruti')throw httpError(400,'Select Raagasudha or Sruti.');
  return value;
}
export function validateInvite(input: Record<string,unknown>) {
  if(!input || typeof input!=='object' || Array.isArray(input) ||
    Object.keys(input).some(k=>!['email','displayName','institution'].includes(k)))
    throw httpError(400,'Unexpected invitation fields.');
  const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
  const displayName=typeof input.displayName==='string'?input.displayName.trim().replace(/\s+/g,' '):'';
  const institution=readInstitution(input.institution);
  if(email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw httpError(400,'Enter a valid administrator email.');
  if(!displayName || displayName.length>100)throw httpError(400,'Enter a display name (up to 100 characters).');
  return {email,displayName,institution};
}
export function validateAccessChange(input: Record<string,unknown>) {
  if(!input || typeof input!=='object' || Array.isArray(input) ||
    Object.keys(input).some(k=>!['username','institution','grant'].includes(k)))
    throw httpError(400,'Unexpected account access fields.');
  const username=typeof input.username==='string'?input.username.trim():'';
  if(!username || username.length>128 || /[\u0000-\u001f]/.test(username))throw httpError(400,'Enter an existing Cognito username.');
  if(typeof input.grant!=='boolean')throw httpError(400,'Choose whether to grant or remove access.');
  return {username,institution:readInstitution(input.institution),grant:input.grant};
}

/** Cognito stores the title as a prefix in its standard name attribute. */
export const adminTitles=['','Mr','Mrs','Ms','Miss','Dr','Prof'] as const;
export type AdminTitle=typeof adminTitles[number];
export function parseAdminTitle(value:string):AdminTitle{
  const name=value.trim().match(/^(Mr|Mrs|Ms|Miss|Dr|Prof)\.?\s+/i)?.[1]||'';
  return adminTitles.find(t=>t.toLowerCase()===name.toLowerCase())||'';
}
/** No group names, sub identifiers, or arbitrary URLs can be modified here. */
export function validateAdminProfile(input:Record<string,unknown>){
  if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).some(k=>!['username','firstName','lastName','title'].includes(k)))
    throw httpError(400,'Unexpected administrator profile fields.');
  const username=typeof input.username==='string'?input.username.trim():'';
  const firstName=typeof input.firstName==='string'?input.firstName.trim().replace(/\s+/g,' '):'';
  const lastName=typeof input.lastName==='string'?input.lastName.trim().replace(/\s+/g,' '):'';
  const title=typeof input.title==='string'?input.title.trim():'';
  if(!username||username.length>128||/[\u0000-\u001f]/.test(username))
    throw httpError(400,'Enter an existing Cognito username.');
  if(!firstName||!lastName||firstName.length>60||lastName.length>60||
    /[<>\u0000-\u001f]/.test(firstName+lastName)||`${firstName} ${lastName}`.length>100)
    throw httpError(400,'Enter valid first and last names (up to 100 characters combined).');
  if(!adminTitles.includes(title as AdminTitle))
    throw httpError(400,'Choose a valid name title.');
  if(`${title?`${title} `:''}${firstName} ${lastName}`.length>100)
    throw httpError(400,'Full name must be no more than 100 characters.');
  return {username,firstName,lastName,title};
}
