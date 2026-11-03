import {learnerExtras, saveLearnerProfile, beginLearnerMedia, completeLearnerMedia, listLearnerMedia} from '../learnerExtras.ts';
import {publishHomework, republishHomework, classHomework, learnerHomework, completeHomework, saveHomeworkSubmission, getHomeworkSubmission, teacherHomeworkSubmissions, teacherHomeworkFeedback, beginHomeworkEvidence, finishHomeworkEvidence, homeworkEvidenceLinks, teacherHomeworkEvidenceLinks, beginTeacherHomeworkMaterial, finishTeacherHomeworkMaterial, setTeacherHomeworkMaterials, teacherHomeworkMaterialLinks, learnerHomeworkMaterialLinks} from '../homework.ts';
import {commentOnPractice, teacherPracticeComments, readPracticeComments} from '../practiceFeedback.ts';
import {learnerDashboard, saveLearnerPractice, saveLearnerRsvp} from '../studentLearning.ts';
import {academyDirectory} from '../academyDirectory.ts';
import {learnerIdentity} from '../learnerExtras.ts';
import {json, readJSON} from './http.ts';
import type {RouteContext, JsonResponse} from './http.ts';

export async function learningRoutes({event,parts,method,inst,claims}: RouteContext): Promise<JsonResponse | undefined> {
      if(parts[0]==='teacher-practice'&&parts.length===3&&parts[2]==='comments'){
        if(method==='GET'){await teacherPracticeComments(inst,claims,parts[1]);return json(200,{records:await readPracticeComments(inst,parts[1])});}
        if(method==='POST')return json(201,await commentOnPractice(inst,claims,parts[1],readJSON(event.body||'')));
        return json(405,{error:'Unsupported comment action'});
      }
      if(parts[0]==='homework'&&parts.length===5&&parts[2]==='evidence'&&method==='GET')return json(200,await teacherHomeworkEvidenceLinks(inst,claims,parts[1],parts[3],parts[4]));
      if(parts[0]==='homework'&&parts.length===5&&parts[2]==='materials'){
        if(method==='GET'&&parts[4]==='links')return json(200,await teacherHomeworkMaterialLinks(inst,claims,parts[1],parts[3]));
        if(method==='POST'&&parts[4]==='selection')return json(200,await setTeacherHomeworkMaterials(inst,claims,parts[1],parts[3],readJSON(event.body||'')));
        if(method==='POST'&&parts[4]==='start')return json(200,await beginTeacherHomeworkMaterial(inst,claims,parts[1],parts[3],readJSON(event.body||'')));
        if(method==='POST'&&parts[4]==='finish')return json(200,await finishTeacherHomeworkMaterial(inst,claims,parts[1],parts[3],readJSON(event.body||'')));
      }
      if(parts[0]==='homework'&&parts.length===4&&parts[2]==='submissions'){
        if(method==='GET')return json(200,await teacherHomeworkSubmissions(inst,claims,parts[1],parts[3]));
        return json(405,{error:'Unsupported submission action'});
      }
      if(parts[0]==='homework'&&parts.length===5&&parts[2]==='feedback'&&method==='POST')return json(200,await teacherHomeworkFeedback(inst,claims,parts[1],parts[3],parts[4],readJSON(event.body||'')));
      if(parts[0]==='homework'&&parts.length===3&&method==='PUT')return json(200,await republishHomework(inst,claims,parts[1],parts[2],readJSON(event.body||'')));
      if(parts[0]==='homework'&&parts.length===2){
        if(method==='GET')return json(200,await classHomework(inst,claims,parts[1]));
        if(method==='POST')return json(201,await publishHomework(inst,claims,{...readJSON(event.body||''),classId:parts[1]}));
        return json(405,{error:'Unsupported homework action'});
      }
      if(parts[0]==='learner'&&parts.length>=3){
        const studentId=parts[1];
        if(parts.length===6&&parts[2]==='submission'&&parts[4]==='evidence'){
          if(method==='POST'&&parts[5]==='start')return json(200,await beginHomeworkEvidence(inst,claims,studentId,parts[3],readJSON(event.body||'')));
          if(method==='POST'&&parts[5]==='finish')return json(200,await finishHomeworkEvidence(inst,claims,studentId,parts[3],readJSON(event.body||'')));
        }
        if(parts.length===5&&parts[2]==='submission'&&parts[4]==='evidence'&&method==='GET')return json(200,await homeworkEvidenceLinks(inst,claims,studentId,parts[3]));
        if(parts.length===4&&parts[2]==='submission'){
          if(method==='GET')return json(200,await getHomeworkSubmission(inst,claims,studentId,parts[3]));
          if(method==='PUT')return json(200,await saveHomeworkSubmission(inst,claims,studentId,parts[3],readJSON(event.body||'')));
        }
        if(method==='GET'&&parts.length===5&&parts[2]==='homework'&&parts[4]==='materials')return json(200,await learnerHomeworkMaterialLinks(inst,claims,studentId,parts[3]));
        if(method==='GET'&&parts.length===3&&parts[2]==='homework')return json(200,await learnerHomework(inst,claims,studentId));
        if(method==='POST'&&parts.length===3&&parts[2]==='homework')return json(200,await completeHomework(inst,claims,studentId,readJSON(event.body||'')));
        if(method==='GET'&&parts.length===3&&parts[2]==='extras')return json(200,await learnerExtras(inst,claims,studentId));
        if(method==='GET'&&parts.length===3&&parts[2]==='academy-directory'){await learnerIdentity(inst,claims,studentId);return json(200,await academyDirectory(inst));}
        if(method==='PATCH'&&parts.length===3&&parts[2]==='profile')return json(200,await saveLearnerProfile(inst,claims,studentId,readJSON(event.body||'')));
        if(method==='POST'&&parts.length===4&&parts[2]==='media'&&parts[3]==='start')return json(200,await beginLearnerMedia(inst,claims,studentId,readJSON(event.body||'')));
        if(method==='POST'&&parts.length===4&&parts[2]==='media'&&parts[3]==='finish')return json(200,await completeLearnerMedia(inst,claims,studentId,readJSON(event.body||'')));
        if(method==='GET'&&parts.length===3&&parts[2]==='media')return json(200,await listLearnerMedia(inst,claims,studentId));
        if(method==='GET'&&parts.length===3&&parts[2]==='dashboard')return json(200,await learnerDashboard(inst,claims,studentId));
        if(method==='POST'&&parts.length===3&&parts[2]==='practice')return json(201,await saveLearnerPractice(inst,claims,studentId,readJSON(event.body||'')));
        if(method==='PATCH'&&parts.length===4&&parts[2]==='practice')return json(200,await saveLearnerPractice(inst,claims,studentId,readJSON(event.body||''),parts[3]));
        if(method==='PUT'&&parts.length===3&&parts[2]==='rsvp')return json(200,await saveLearnerRsvp(inst,claims,studentId,readJSON(event.body||'')));
        return json(405,{error:'Unsupported student action.'});
      }
  return undefined;
}
