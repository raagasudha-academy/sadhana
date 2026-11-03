/** Existing /schedule/series/{classId} API contract, opt-in M9 pilot only. */
import type {DomainRoute} from './http.ts';
import {json,readJSON} from './http.ts';
import {httpError} from '../model.ts';
import {defaultM95SeriesWriter} from '../m95SeriesWrite.ts';
export function pilotSeriesWriteRequest(method:string|undefined,parts:readonly string[]){
 return parts[0]==='schedule'&&parts[1]==='series'&&parts.length>=3&&(
  (method==='PATCH'&&parts.length===3)||(method==='POST'&&parts.length===4&&parts[3]==='preview'));
}
export function makeM95SeriesWriteRoutes(writer=defaultM95SeriesWriter()):DomainRoute{
 return async({event,method,parts,query,claims})=>{
  if(process.env.M95_COMPAT_MODE!=='pilot'||process.env.M95_CALENDAR_WRITES!=='enabled'||process.env.M95_SERIES_WRITES!=='enabled')return undefined;
  if(!pilotSeriesWriteRequest(method,parts))return undefined;
  const inst=query.institution;
  if(inst!=='raaga'&&inst!=='sruti')throw httpError(400,'Choose Raagasudha or Sruti.');
  const body=readJSON(event.body?event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body:'');
  return json(method==='PATCH'?200:200,method==='PATCH'?await writer.change(inst,parts[2],body,claims):await writer.preview(inst,parts[2],body,claims));
 };
}
export const m95SeriesWriteRoutes=makeM95SeriesWriteRoutes();
