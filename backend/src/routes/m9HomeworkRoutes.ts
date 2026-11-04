/** Existing homework URL and response compatibility, opted in only for isolated M9. */
import type {DomainRoute} from './http.ts';
import {json,readJSON} from './http.ts';
import {m9Homework} from '../m9Homework.ts';
export const m9HomeworkRoutes:DomainRoute=async({event,parts,method,inst,claims})=>{
 if(process.env.M9_HOMEWORK_WRITES!=='enabled')return undefined;
 const h=m9Homework(),body=()=>readJSON(event.body||'');
 if(parts[0]==='homework'){
  if(parts.length===2){if(method==='GET')return json(200,await h.listClass(inst,claims,parts[1]));if(method==='POST')return json(201,await h.publish(inst,claims,parts[1],body()));}
  if(parts.length===3&&method==='PUT')return json(200,await h.edit(inst,claims,parts[1],parts[2],body()));
  if(parts.length===4&&parts[2]==='submissions'&&method==='GET')return json(200,await h.teacherSubmissions(inst,claims,parts[1],parts[3]));
  if(parts.length===5&&parts[2]==='evidence'&&method==='GET')return json(200,await h.staffMediaLinks(inst,claims,parts[1],parts[3],parts[4]));
  if(parts.length===5&&parts[2]==='feedback'&&method==='POST')return json(200,await h.feedback(inst,claims,parts[1],parts[3],parts[4],body()));
 }
 if(parts[0]==='learner'&&parts.length>=3){
  const student=parts[1];
  if(parts.length===3&&parts[2]==='homework'){
   if(method==='GET')return json(200,await h.learnerList(inst,claims,student));
   if(method==='POST')return json(200,await h.complete(inst,claims,student,body()));
  }
  if(parts.length===6&&parts[2]==='submission'&&parts[4]==='evidence'){
   if(parts[5]==='start'&&method==='POST')return json(200,await h.mediaStart(inst,claims,student,parts[3],body()));
   if(parts[5]==='finish'&&method==='POST')return json(200,await h.mediaFinish(inst,claims,student,parts[3],body()));
  }
  if(parts.length===5&&parts[2]==='submission'&&parts[4]==='evidence'&&method==='GET')return json(200,await h.mediaLinks(inst,claims,student,parts[3]));
  if(parts.length===4&&parts[2]==='submission'){
   if(method==='GET')return json(200,await h.getSubmission(inst,claims,student,parts[3]));
   if(method==='PUT')return json(200,await h.saveSubmission(inst,claims,student,parts[3],body()));
  }
 }
 // An enabled M9 homework adapter must never fall back to legacy attachment or material storage.
 if(parts[0]==='homework'||(parts[0]==='learner'&&['homework','submission'].includes(parts[2])))
  return json(503,{error:'M9 homework media or method not yet migrated. Legacy storage is blocked.'});
 return undefined;
};
