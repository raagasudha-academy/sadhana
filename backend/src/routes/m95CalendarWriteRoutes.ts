/** Strict allowlist for a reversible M9 calendar write PILOT; all other mutations remain blocked. */
import type {DomainRoute} from './http.ts';
import {json,readJSON} from './http.ts';
import {httpError} from '../model.ts';
import type {ScheduleInstitution} from '../scheduleModel.ts';
import {defaultM95CalendarWriter} from '../m95CalendarWrite.ts';
import type {CalendarClient} from '../m95CalendarWrite.ts';

export function pilotCalendarWriteRequest(method:string|undefined,parts:readonly string[]){
 return (method==='POST'&&parts.length===1&&parts[0]==='schedule') ||
        (method==='PATCH'&&parts.length===2&&parts[0]==='schedule');
}
export function makeM95CalendarWriteRoutes(writer=defaultM95CalendarWriter()):DomainRoute{
 return async({event,method,parts,query,claims})=>{
  if(process.env.M95_COMPAT_MODE!=='pilot'||process.env.M95_CALENDAR_WRITES!=='enabled')return undefined;
  if(!pilotCalendarWriteRequest(method,parts))return undefined;
  const inst=query.institution as ScheduleInstitution;
  if(inst!=='raaga'&&inst!=='sruti')throw httpError(400,'Choose Raagasudha or Sruti.');
  const body=readJSON(event.body?event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body:'');
  if(method==='POST')return json(201,await writer.create(inst,body,claims));
  return json(200,await writer.patch(inst,parts[1],body,claims));
 };
}
export const m95CalendarWriteRoutes=makeM95CalendarWriteRoutes();
