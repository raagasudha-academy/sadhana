/** Opt-in existing GET learner dashboard adapter; legacy writes remain unavailable in M9 pilot. */
import type {DomainRoute} from './http.ts';
import {json} from './http.ts';
import {httpError} from '../model.ts';
import {m9FinalLearner} from '../finalLearner.ts';
import {m9LearnerWrites} from '../learnerWrites.ts';
import {readJSON} from './http.ts';
export const m9FinalLearnerRoutes:DomainRoute=async({event,parts,method,inst,claims})=>{
 if(parts[0]!=='learner'||parts.length<3||parts.length>4)return undefined;
 if(inst!=='raaga'&&inst!=='sruti')throw httpError(400,'Select an institution.');
 if(method==='GET'&&parts.length===3&&parts[2]==='dashboard'&&process.env.M9_FINAL_LEARNER_READS==='enabled')
  return json(200,await m9FinalLearner().dashboard(inst,claims,parts[1]));
 if(process.env.M9_LEARNER_WRITES!=='enabled')return undefined;
 if(method==='POST'&&parts.length===3&&parts[2]==='practice')
  return json(201,await m9LearnerWrites().savePractice(inst,claims,parts[1],readJSON(event.body||'')));
 if(method==='PATCH'&&parts.length===4&&parts[2]==='practice')
  return json(200,await m9LearnerWrites().savePractice(inst,claims,parts[1],readJSON(event.body||''),parts[3]));
 if(method==='PUT'&&parts.length===3&&parts[2]==='rsvp')
  return json(200,await m9LearnerWrites().saveRsvp(inst,claims,parts[1],readJSON(event.body||'')));
 return undefined;
};
