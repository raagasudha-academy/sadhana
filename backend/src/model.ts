/** Pure domain rules for the initial DynamoDB foundation. Never authorize from browser role flags. */
import { randomUUID } from 'node:crypto';

/** Persisted records are runtime-validated before writing to DynamoDB. */
export type InstitutionId = 'raaga' | 'sruti';
export type ResourceName = 'families' | 'students' | 'classes' | 'venues' | 'enrolments' | 'practice';
export type Draft = Record<string, any>; // Untrusted API JSON; validate() performs authoritative checks.
export type Claims = { sub?: string; 'cognito:groups'?: string | string[]; [k: string]: unknown };
export type HttpError = Error & { status: number };
export type DatabaseRecord = Draft & { id?: string; PK?: string; SK?: string; version?: number };


export const INSTITUTIONS: readonly InstitutionId[] = Object.freeze(['raaga','sruti']);
export const RESOURCES: readonly ResourceName[] = Object.freeze(['families','students','classes','venues','enrolments','practice']);
export const isoDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) && new Date(`${s}T12:00:00Z`).toISOString().startsWith(s);
export const one = (value,allowed) => allowed.includes(value) ? value : null;
export const clean = text => String(text??'').trim().replace(/\s+/g,' ');
export const newId = type => `${type}-${randomUUID()}`;
export const groupsFromClaims = claims => {
  const raw = claims?.['cognito:groups'] ?? [];
  return (Array.isArray(raw) ? raw : String(raw).replace(/[\[\]"']/g,'').split(/[\s,]+/)).filter(Boolean);
};
export const ADMIN_GROUPS: Readonly<Record<InstitutionId,string>> = Object.freeze({raaga:'raagasudha-admin',sruti:'sruti-admin'});
export const VIEWER_GROUPS: Readonly<Record<InstitutionId,string>> = Object.freeze({raaga:'raagasudha-viewer',sruti:'sruti-viewer'});
/** Administrator membership is the *only* authority for writes. */
export function permittedInstitutions(claims: Claims): InstitutionId[] {
  const groups=groupsFromClaims(claims);
  return INSTITUTIONS.filter(inst=>groups.includes(ADMIN_GROUPS[inst]));
}
/** Read-only staff have academy-scoped calendar, class and venue access. */
export function viewableInstitutions(claims: Claims): InstitutionId[] {
  const groups=groupsFromClaims(claims);
  return INSTITUTIONS.filter(inst=>groups.includes(ADMIN_GROUPS[inst])||groups.includes(VIEWER_GROUPS[inst]));
}
export function demandViewInstitution(claims: Claims,requested: InstitutionId): InstitutionId {
  if(!one(requested,INSTITUTIONS))throw httpError(400,'Select a valid institution.');
  if(!viewableInstitutions(claims).includes(requested))throw httpError(403,'You do not have access to this institution.');
  return requested;
}
export function demandAnyStaff(claims: Claims) {
  if(!viewableInstitutions(claims).length)throw httpError(403,'Staff access required.');
}
export function demandInstitution(claims,requested) {
  if (!one(requested,INSTITUTIONS)) throw httpError(400,'Select a valid institution.');
  if (!permittedInstitutions(claims).includes(requested)) throw httpError(403,'You are not an administrator of this institution.');
  return requested;
}
export function demandAnyAdmin(claims) {
  if (!permittedInstitutions(claims).length) throw httpError(403,'Administrator access required.');
}
export function httpError(status: number,message: string): HttpError {const e=new Error(message) as HttpError;e.status=status;return e;}
export function fieldsOnly(body: unknown,keys: readonly string[]): Draft {
  if(!body||typeof body!=='object'||Array.isArray(body)) throw httpError(400,'Expected a JSON object.');
  const extra=Object.keys(body).filter(k=>!keys.includes(k));
  if(extra.length) throw httpError(400,`Unknown field(s): ${extra.join(', ')}`);
  return structuredClone(body) as Draft;
}
export const ALLOWED_FIELDS: Record<ResourceName,readonly string[]>={
  families:['parentName','phone','createdIn'],
  students:['name','phone','familyId','registrationType','adultConfirmed','createdIn'],
  classes:['institution','name','teacher','teacherUserId','day','time','duration','mode','venueId','startDate','endDate'],
  venues:['name','location','address','postcode','notes'],
  enrolments:['institution','studentId','classId','startDate','endDate'],
  practice:['institution','studentId','date','didPractice','minutes','comments','reason'],
};
export function validate(resource: ResourceName,draft: unknown,{creating=true}: {creating?: boolean}={}): Draft {
  if(!RESOURCES.includes(resource)) throw httpError(404,'Unknown resource.');
  const d=fieldsOnly(draft,ALLOWED_FIELDS[resource]);
  const str=(v,n)=>clean(v).slice(0,n);
  if(resource==='families'){
    d.parentName=str(d.parentName,100); d.phone=str(d.phone,32);
    if(!d.parentName || !/^\+[1-9]\d{7,14}$/.test(d.phone))throw httpError(400,'A parent name and valid international phone number are required.');
    if(!INSTITUTIONS.includes(d.createdIn))throw httpError(400,'Invalid registration institution.');
  }
  if(resource==='students'){
    d.name=str(d.name,100);d.phone=str(d.phone,32);d.familyId=str(d.familyId,80);
    if(!d.name || !INSTITUTIONS.includes(d.createdIn))throw httpError(400,'Student name and institution are required.');
    if(d.phone && !/^\+[1-9]\d{7,14}$/.test(d.phone))throw httpError(400,'Invalid student phone.');
    if(d.registrationType==='independent') {
      if(d.familyId||d.adultConfirmed!==true||!d.phone)throw httpError(400,'Independent registration requires confirmation of adulthood and a student phone number.');
    } else if(d.registrationType==='family') {
      if(!d.familyId)throw httpError(400,'Family-linked students require a Family ID.');
    } else throw httpError(400,'Choose family or independent registration.');
  }
  if(resource==='classes'){
    d.name=str(d.name,100);d.teacher=str(d.teacher,100);d.teacherUserId=str(d.teacherUserId,100);
    if(!INSTITUTIONS.includes(d.institution)||!d.name||!d.teacher)throw httpError(400,'Class institution, name and teacher are required.');
    if(!Number.isInteger(d.day)||d.day<0||d.day>6||!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.time))throw httpError(400,'Invalid UK weekly class day/time.');
    if(!Number.isInteger(d.duration)||d.duration<15||d.duration>360)throw httpError(400,'Duration must be 15–360 minutes.');
    if(!['Online','In Person'].includes(d.mode))throw httpError(400,'Invalid delivery mode.');
    if(d.mode==='In Person'&&!d.venueId)throw httpError(400,'An in-person class requires a Venue ID.');
    if(d.mode==='Online') d.venueId='';
    if(!isoDate(d.startDate)||(d.endDate&&!isoDate(d.endDate))||(d.endDate&&d.endDate<d.startDate))throw httpError(400,'Invalid class date range.');
  }
  if(resource==='venues'){
    for(const k of ['name','location','address','postcode','notes']) {
      if(d[k]!==undefined && typeof d[k]!=='string')throw httpError(400,`Venue ${k} must be text.`);
      d[k]=str(d[k],k==='address'?240:k==='notes'?500:k==='postcode'?20:100);
    }
    if(!d.name||!d.location||!d.address)throw httpError(400,'Venue name, town and address are required.');
    if(d.postcode && !/^[a-z0-9 ]{3,20}$/i.test(d.postcode))throw httpError(400,'Invalid postcode.');
  }
  if(resource==='enrolments'){
    d.studentId=str(d.studentId,90);d.classId=str(d.classId,90);
    if(!INSTITUTIONS.includes(d.institution)||!d.studentId||!d.classId)throw httpError(400,'Institution, student and class are required.');
    if(!isoDate(d.startDate)||(d.endDate&&!isoDate(d.endDate))||(d.endDate&&d.endDate<d.startDate))throw httpError(400,'Invalid enrolment dates.');
  }
  if(resource==='practice'){
    d.studentId=str(d.studentId,90);d.comments=str(d.comments,800);d.reason=str(d.reason,300);
    if(!INSTITUTIONS.includes(d.institution)||!d.studentId||!isoDate(d.date))throw httpError(400,'Student, institution and practice date are required.');
    if(typeof d.didPractice!=='boolean')throw httpError(400,'Specify whether practice occurred.');
    if(d.didPractice&&(!Number.isInteger(d.minutes)||d.minutes<1||d.minutes>1440))throw httpError(400,'Practice minutes must be 1–1440.');
    if(!d.didPractice) d.minutes=0;
    if(!d.reason)throw httpError(400,'A reason for an administrator-recorded entry is required.');
  }
  return d;
}
export function directoryFor(resource: ResourceName,d: Draft): Draft {
  if(resource==='families')return {GSI1PK:'DIRECTORY#FAMILY',GSI1SK:`NAME#${d.parentName.toLocaleLowerCase('en-GB')}#${d.id}`,GSI2PK:`PHONE#${d.phone}`,GSI2SK:`FAMILY#${d.id}`};
  if(resource==='students')return {GSI1PK:'DIRECTORY#STUDENT',GSI1SK:`NAME#${d.name.toLocaleLowerCase('en-GB')}#${d.id}`,...(d.phone?{GSI2PK:`PHONE#${d.phone}`,GSI2SK:`STUDENT#${d.id}`}:{})};
  if(resource==='classes')return {GSI1PK:`INST#${d.institution}#CLASS`,GSI1SK:`NAME#${d.name.toLocaleLowerCase('en-GB')}#${d.id}`};
  if(resource==='venues')return {GSI1PK:'DIRECTORY#VENUE',GSI1SK:`NAME#${d.name.toLocaleLowerCase('en-GB')}#${d.id}`};
  if(resource==='enrolments')return {GSI1PK:`INST#${d.institution}#ENROLMENT`,GSI1SK:`STUDENT#${d.studentId}#${d.startDate}#${d.id}`,GSI2PK:`CLASS#${d.classId}`,GSI2SK:`STUDENT#${d.studentId}#${d.id}`};
  if(resource==='practice')return {GSI1PK:`INST#${d.institution}#PRACTICE`,GSI1SK:`DATE#${d.date}#STUDENT#${d.studentId}`};
  return {};
}
export function keyFor(resource: ResourceName,d: Draft): {PK:string;SK:string} {
  if(resource==='practice')return {PK:`PRACTICE#${d.institution}#${d.studentId}`,SK:`DATE#${d.date}`};
  const type=resource.slice(0,-1).toUpperCase();
  if(resource==='classes')return {PK:`CLASS#${d.id}`,SK:'META'};
  if(resource==='enrolments')return {PK:`ENROLMENT#${d.id}`,SK:'META'};
  if(resource==='families')return {PK:`FAMILY#${d.id}`,SK:'META'};
  if(resource==='students')return {PK:`STUDENT#${d.id}`,SK:'META'};
  if(resource==='venues')return {PK:`VENUE#${d.id}`,SK:'META'};
  throw httpError(404,`Unknown resource ${type}`);
}
export function publicRecord(item: DatabaseRecord | null | undefined): Draft | null {
  if(!item)return null;
  const {PK,SK,GSI1PK,GSI1SK,GSI2PK,GSI2SK,entityType,...body}=item;
  return body;
}
