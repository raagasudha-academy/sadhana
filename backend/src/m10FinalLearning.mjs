/**
 * Canonical-table learner/homework/teacher-practice facade. Reuses the
 * independently scoped M9 business services but never calls PK/SK repositories.
 * All final features are explicitly disabled by default. The API surface is
 * whitelisted so malformed or unsupported routes cannot fall back to legacy.
 */
const refuse = (message, status = 503) => ({status, body: {error: message}});
const idOk = value => typeof value === 'string' && /^[-A-Za-z0-9_]{4,150}$/.test(value);
const mediaAction = parts => parts.includes('evidence') || parts.includes('materials');
const jsonResponse = response => {
  if (!response || !Number.isInteger(response.statusCode) || typeof response.body !== 'string')
    throw new Error('Invalid teacher-practice response');
  return {status:response.statusCode, body:JSON.parse(response.body)};
};

export async function finalLearningRoute(context, dependencies, env = process.env) {
  if (env.SADHANA_ENTITY_TABLE_SET !== 'final') return undefined;
  const {parts,method,claims,query={},event} = context;
  if (!Array.isArray(parts) || !['learner','homework','teacher-practice'].includes(parts[0])) return undefined;
  if (!claims?.sub) return refuse('Authenticated account required.',401);
  if (env.SADHANA_DATA_MODE === 'split' || env.SADHANA_ENTITY_FINAL_ACK !== 'enabled')
    return refuse('Final-table cutover has not been authorised.');
  const institution = query.institution ?? context.inst;
  if (institution !== 'raaga' && institution !== 'sruti') return refuse('Choose a valid institution.',400);
  const root=parts[0], id=parts[1];
  const body=()=>dependencies.parse(event);

  // Existing learner profile and public academy-directory endpoints use only
  // canonical tables and independently verified student/guardian access.
  if (root === 'learner' && parts.length === 3 &&
      ((parts[2] === 'extras' && method === 'GET') ||
       (parts[2] === 'profile' && method === 'PATCH') ||
       (parts[2] === 'academy-directory' && method === 'GET'))) {
    if (!idOk(id)) return refuse('Invalid learner identifier.',400);
    const directory=parts[2]==='academy-directory';
    const writing=method==='PATCH';
    const flag=directory?'SADHANA_FINAL_LEARNER_DIRECTORY_READS':writing?'SADHANA_FINAL_LEARNER_PROFILE_WRITES':'SADHANA_FINAL_LEARNER_EXTRAS_READS';
    if(env[flag]!=='enabled')return refuse('Final learner profile or directory access is disabled.');
    // Legacy PROFILE#studentId records were separate from canonical people.
    // Never silently replace a saved preference with an empty profile.
    if(!directory&&env.SADHANA_FINAL_LEARNER_PREFERENCES_PARITY!=='enabled')
      return refuse('Learner preferences have not been reconciled for final tables.');
    dependencies.assertConfigured();
    if(!dependencies.learnerProfiles)return refuse('Canonical learner profile service unavailable.');
    const service=dependencies.learnerProfiles();
    if(directory)return {status:200,body:await service.academyDirectory(institution,claims,id)};
    if(writing)return {status:200,body:await service.saveProfile(institution,claims,id,body())};
    return {status:200,body:await service.extras(institution,claims,id)};
  }
  // Private learner media is stored as canonical submission receipts; no
  // legacy profile/media PK/SK rows are read or written in final mode.
  if(root==='learner'&&idOk(id)&&
     ((parts.length===3&&parts[2]==='media'&&method==='GET')||
      (parts.length===4&&parts[2]==='media'&&method==='POST'&&['start','finish'].includes(parts[3])))){
    if(env.SADHANA_FINAL_LEARNER_MEDIA!=='enabled')return refuse('Final learner media disabled.');
    dependencies.assertConfigured();
    const media=dependencies.learnerMedia();
    if(method==='GET')return {status:200,body:await media.list(institution,claims,id)};
    return {status:200,body:await media[parts[3]](institution,claims,id,body())};
  }
  if (root === 'learner' && parts.length === 3 && parts[2] === 'dashboard' && method === 'GET') {
    if (env.SADHANA_FINAL_LEARNER_READS !== 'enabled') return refuse('Final learner dashboard disabled.');
    if (!idOk(id)) return refuse('Invalid student identifier.',400);
    dependencies.assertConfigured();
    return {status:200, body:await dependencies.learner().dashboard(institution,claims,id)};
  }
  if (root === 'learner' && (
    (parts.length === 3 && parts[2] === 'practice' && method === 'POST') ||
    (parts.length === 4 && parts[2] === 'practice' && method === 'PATCH') ||
    (parts.length === 3 && parts[2] === 'rsvp' && method === 'PUT')
  )) {
    if (env.SADHANA_FINAL_LEARNER_WRITES !== 'enabled') return refuse('Final learner writes disabled.');
    if (!idOk(id) || (parts.length === 4 && !idOk(parts[3]))) return refuse('Invalid learner record identifier.',400);
    dependencies.assertConfigured();
    const service=dependencies.learnerWrites();
    if (parts[2] === 'rsvp') return {status:200, body:await service.saveRsvp(institution,claims,id,body())};
    const update=method==='PATCH';
    return {status:update?200:201, body:await service.savePractice(institution,claims,id,body(),update?parts[3]:undefined)};
  }
  if (root === 'teacher-practice') {
    if (parts.length !== 3 || parts[2] !== 'comments' || !idOk(id) || !['GET','POST'].includes(method))
      return refuse('Unsupported teacher-practice operation.');
    const flag=method==='GET'?'SADHANA_FINAL_TEACHER_PRACTICE_READS':'SADHANA_FINAL_TEACHER_PRACTICE_WRITES';
    if(env[flag]!=='enabled') return refuse('Final teacher practice comments disabled.');
    dependencies.assertConfigured();
    return jsonResponse(await dependencies.teacherPractice(context));
  }
  const homeworkRoot=root==='homework' || (root==='learner' && ['homework','submission'].includes(parts[2]));
  if (!homeworkRoot) return refuse('Learner operation not migrated.');
  if (root==='learner' && !idOk(id)) return refuse('Invalid student identifier.',400);
  if (root==='homework' && !idOk(id)) return refuse('Invalid class identifier.',400);
  const media=mediaAction(parts);
  const reading=method==='GET';
  const flag=reading?'SADHANA_FINAL_HOMEWORK_READS':'SADHANA_FINAL_HOMEWORK_WRITES';
  if (env[flag]!=='enabled') return refuse('Final homework operation disabled.');
  if (media && env.SADHANA_FINAL_HOMEWORK_MEDIA!=='enabled') return refuse('Final homework media disabled.');
  // Resolve the service only after a recognised operation and configured tables.
  const one = (operation,args,status=200)=>{
    dependencies.assertConfigured();
    return dependencies.homework()[operation](...args).then(result=>({status,body:result}));
  };
  if (root==='homework') {
    if(parts.length===5 && parts[2]==='materials' && idOk(parts[3])){
      if(parts[4]==='links'&&method==='GET')return one('teacherMaterialLinks',[institution,claims,id,parts[3]]);
      if(parts[4]==='start'&&method==='POST')return one('beginTeacherMaterial',[institution,claims,id,parts[3],body()]);
      if(parts[4]==='finish'&&method==='POST')return one('finishTeacherMaterial',[institution,claims,id,parts[3],body()]);
      if(parts[4]==='selection'&&method==='POST')return one('selectTeacherMaterials',[institution,claims,id,parts[3],body()]);
    }
    if (parts.length===2 && method==='GET') return one('listClass',[institution,claims,id]);
    if (parts.length===2 && method==='POST') return one('publish',[institution,claims,id,body()],201);
    if (parts.length===3 && method==='PUT' && idOk(parts[2])) return one('edit',[institution,claims,id,parts[2],body()]);
    if (parts.length===4 && parts[2]==='submissions' && method==='GET' && idOk(parts[3]))
      return one('teacherSubmissions',[institution,claims,id,parts[3]]);
    if (parts.length===5 && parts[2]==='evidence' && method==='GET' && idOk(parts[3]) && idOk(parts[4]))
      return one('staffMediaLinks',[institution,claims,id,parts[3],parts[4]]);
    if (parts.length===5 && parts[2]==='feedback' && method==='POST' && idOk(parts[3]) && idOk(parts[4]))
      return one('feedback',[institution,claims,id,parts[3],parts[4],body()]);
  }
  if (root==='learner') {
    if(parts.length===5&&parts[2]==='homework'&&parts[4]==='materials'&&method==='GET'&&idOk(parts[3]))
      return one('learnerMaterialLinks',[institution,claims,id,parts[3]]);
    if (parts.length===3 && parts[2]==='homework') {
      if (method==='GET') return one('learnerList',[institution,claims,id]);
      if (method==='POST') return one('complete',[institution,claims,id,body()]);
    }
    if (parts[2]==='submission' && parts.length>=4 && idOk(parts[3])) {
      const hw=parts[3];
      if(parts.length===4&&method==='GET')return one('getSubmission',[institution,claims,id,hw]);
      if(parts.length===4&&method==='PUT')return one('saveSubmission',[institution,claims,id,hw,body()]);
      if(parts.length===5&&parts[4]==='evidence'&&method==='GET')return one('mediaLinks',[institution,claims,id,hw]);
      if(parts.length===6&&parts[4]==='evidence'&&method==='POST'&&parts[5]==='start')return one('mediaStart',[institution,claims,id,hw,body()]);
      if(parts.length===6&&parts[4]==='evidence'&&method==='POST'&&parts[5]==='finish')return one('mediaFinish',[institution,claims,id,hw,body()]);
    }
  }
  return refuse('Unsupported homework operation. No legacy fallback.');
}
