/** Canonical compatibility for existing /operations family, student, attendance, enrolment, RSVP and practice GETs.
 * Never invokes the legacy academyOperations or repository route.
 */
export async function finalOperationsRoute(context, readers, access, env=process.env) {
  if(env.SADHANA_ENTITY_TABLE_SET!=='final') return undefined;
  const {parts,method,claims,query={}}=context;
  if(parts?.[0]!=='operations'||(parts.length!==2 && !(parts[1]==='feedback' && parts.length===3))||!['family','student','attendance','enrolment','rsvp','practice','feedback'].includes(parts[1])) return undefined;
  // Feedback is independently gated; other compatibility routes remain GET-only.
  if(method!=='GET' && !(parts[1]==='feedback' && ((method==='POST' && parts.length===2)||(method==='PATCH' && parts.length===3)))) return undefined;
  if(!claims?.sub) return undefined;
  readers.assertConfigured();
  const inst=query.institution??context.inst;
  if(inst!=='raaga'&&inst!=='sruti') access.badInstitution();
  access.view(claims,inst);
  const isAdmin=access.permittedInstitutions(claims).includes(inst);
  if(parts[1]==='feedback') {
    if(method==='GET' && parts.length!==2)return undefined;
    let teacher=null;
    let assignedIds;
    if(!isAdmin) {
      teacher=await readers.directory('teacherMe',inst,claims);
      if(!teacher?.linked||!teacher.teacherId) access.forbid('Verified academy teacher required.');
      const classes=await readers.directory('classes',inst,claims);
      assignedIds=new Set((classes?.records??[])
        .filter(row=>row?.teacherId===teacher.teacherId && row?.lifecycleStatus!=='archived' && row?.archived!==true)
        .map(row=>row.id).filter(id=>typeof id==='string'&&id.length>0));
    }
    if(method==='GET')return {status:200,body:await readers.feedback.list(inst,assignedIds)};
    if(env.SADHANA_FINAL_FEEDBACK_WRITES!=='enabled')return {status:503,body:{error:'Final feedback writes are disabled.'}};
    if(!isAdmin && !assignedIds.size)access.forbid('No assigned class.');
    const raw=context.event?.body;
    let data;
    try {data=raw?(JSON.parse(context.event.isBase64Encoded?Buffer.from(raw,'base64').toString('utf8'):raw)):{};}
    catch {return {status:400,body:{error:'Invalid JSON.'}};}
    if(!data||typeof data!=='object'||Array.isArray(data))return {status:400,body:{error:'Invalid feedback body.'}};
    // Load the existing row for PATCH to authorize its ORIGINAL class, not a caller's replacement class.
    const existingId=method==='PATCH'?parts[2]:undefined;
    const previous=existingId?await readers.feedback.get(inst,existingId):null;
    if(existingId&&!previous)return {status:404,body:{error:'Feedback not found.'}};
    const studentId=previous?.studentId??data.studentId;
    const classId=previous?.classId??data.classId;
    const date=previous?.date??data.date;
    if(!isAdmin&&!assignedIds.has(classId))access.forbid('Assigned class required.');
    const enrollments=isAdmin?await readers.core('enrolments',inst,claims):await readers.teacherEnrolments(inst,assignedIds);
    const eligible=(enrollments?.records??[]).some(r=>r.studentId===studentId&&r.classId===classId&&r.archived!==true&&r.status!=='inactive'&&
      (!r.startDate||r.startDate<=date)&&(!r.endDate||date<=r.endDate));
    if(!eligible)return {status:403,body:{error:'Student is not enrolled in this class on this date.'}};
    return {status:method==='POST'?201:200,body:await readers.feedback.save(inst,claims.sub,data,existingId)};
  }
  if(parts[1]==='rsvp'||parts[1]==='practice') {
    if(isAdmin) return {status:200,body:await readers.history(parts[1],inst)};
    const teacher=await readers.directory('teacherMe',inst,claims);
    if(!teacher?.linked||!teacher.teacherId) access.forbid('Verified academy teacher required.');
    const classes=await readers.directory('classes',inst,claims);
    const assignedIds=new Set((classes?.records??[])
      .filter(row=>row?.teacherId===teacher.teacherId && row?.lifecycleStatus!=='archived' && row?.archived!==true)
      .map(row=>row.id).filter(id=>typeof id==='string'&&id.length>0));
    if(!assignedIds.size) return {status:200,body:{records:[]}};
    return {status:200,body:await readers.history(parts[1],inst,assignedIds,teacher.teacherId)};
  }
  if(parts[1]==='attendance') {
    if(isAdmin) return {status:200,body:await readers.attendance(inst)};
    const teacher=await readers.directory('teacherMe',inst,claims);
    if(!teacher?.linked||!teacher.teacherId) access.forbid('Verified academy teacher required.');
    const classes=await readers.directory('classes',inst,claims);
    const assignedIds=new Set((classes?.records??[])
      .filter(row=>row?.teacherId===teacher.teacherId && row?.lifecycleStatus!=='archived' && row?.archived!==true)
      .map(row=>row.id).filter(id=>typeof id==='string'&&id.length>0));
    return {status:200,body:await readers.attendance(inst,assignedIds,teacher.teacherId)};
  }
  if(parts[1]==='enrolment') {
    if(isAdmin) {
      const data=await readers.core('enrolments',inst,claims);
      return {status:200,body:{records:data.records}};
    }
    const teacher=await readers.directory('teacherMe',inst,claims);
    if(!teacher?.linked||!teacher.teacherId) access.forbid('Verified academy teacher required.');
    const classes=await readers.directory('classes',inst,claims);
    const assignedIds=new Set((classes?.records??[])
      .filter(row=>row?.teacherId===teacher.teacherId && row?.lifecycleStatus!=='archived' && row?.archived!==true)
      .map(row=>row.id).filter(id=>typeof id==='string'&&id.length>0));
    if(!assignedIds.size)return {status:200,body:{records:[]}};
    return {status:200,body:await readers.teacherEnrolments(inst,assignedIds)};
  }
  if(parts[1]==='family') {
    // Family phone/email are administrator-only.
    access.admin(claims,inst);
    const data=await readers.core('families',inst,claims);
    return {status:200,body:{records:data.records}};
  }
  if(isAdmin) {
    const data=await readers.core('students',inst,claims);
    return {status:200,body:{records:data.records}};
  }
  // Teachers get ONLY names/IDs of students in their assigned classes, never
  // full person records, contact data or unassigned academy students.
  const teacher=await readers.directory('teacherMe',inst,claims);
  if(!teacher?.linked||!teacher.teacherId) access.forbid('Verified academy teacher required.');
  const classes=await readers.directory('classes',inst,claims);
  const assignedIds=new Set((classes?.records??[])
    .filter(row=>row?.teacherId===teacher.teacherId && row?.lifecycleStatus!=='archived' && row?.archived!==true)
    .map(row=>row.id).filter(id=>typeof id==='string'&&id.length>0));
  if(assignedIds.size===0) return {status:200,body:{records:[]}};
  const safe=await readers.teacherStudents(inst,assignedIds);
  return {status:200,body:{records:safe}};
}
