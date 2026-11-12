/**
 * Final-entity-table READ facade for existing frontend endpoints.
 *
 * All business data is supplied by canonical M9/M10 readers using entityTable().
 * The legacy repository and tableRouter are never called. The installed reader
 * must validate final-table acknowledgement before any DynamoDB access.
 * Existing M9/split-mode dispatch is unchanged.
 */
export async function finalReadRoute(context, readers, access, env = process.env) {
  if (env.SADHANA_ENTITY_TABLE_SET !== 'final') return undefined;
  const { parts, method, claims, query = {} } = context;
  if (method !== 'GET' || !Array.isArray(parts) || !claims?.sub) return undefined;
  const root = parts[0];
  const ownSummary = root === 'me' && parts.length === 1;
  const teacherMe = root === 'teachers' && parts.length === 2 && parts[1] === 'me';
  const teacherLinks = root === 'schedule' && parts.length === 2 && parts[1] === 'teacher-links';
  const plainDirectory = ['classes', 'venues', 'teachers'].includes(root) && parts.length === 1;
  const schedule = root === 'schedule' && parts.length === 1;
  const managedEvents = root === 'events' && parts.length === 1;
  const coreDirectory = ['students', 'families', 'enrolments'].includes(root) && parts.length === 1;
  const studentDetails = root === 'students' && parts.length === 3 && parts[2] === 'details';
  const audit = root === 'audit' && parts.length === 1;
  const practice = root === 'practice' && parts.length === 1;
  if (!(
    ownSummary ||
    teacherMe ||
    teacherLinks ||
    plainDirectory ||
    schedule ||
    managedEvents ||
    coreDirectory ||
    studentDetails ||
    audit ||
    practice
  ))
    return undefined;

  // The locator raises when split PK/SK routing is still selected, or the
  // explicit final cutover acknowledgement has not been enabled.
  readers.assertConfigured();

  if (ownSummary) {
    const viewed = access.viewableInstitutions(claims);
    const admins = access.permittedInstitutions(claims);
    const linkedTeachers = [];
    for (const institution of viewed) {
      const match = await readers.directory('teacherMe', institution, claims);
      if (match?.linked) linkedTeachers.push(institution);
    }
    const profile = await readers.profile(claims.sub);
    return {
      status: 200,
      body: {
        subject: claims.sub,
        ...(access.isSuperAdmin ? { isSuperAdmin: access.isSuperAdmin(claims) } : {}),
        institutions: viewed,
        adminInstitutions: admins,
        teacherInstitutions: linkedTeachers,
        role: admins.length ? 'admin' : viewed.length ? 'viewer' : 'learner',
        displayName: profile?.name || (viewed.length ? 'Staff' : 'Student / Family'),
        photoUrl: profile?.photoUrl || '',
      },
    };
  }

  const institution = query.institution ?? context.inst;
  if (schedule && institution === 'shared') {
    if (!access.viewableInstitutions(claims).length) access.forbid('Staff access required.');
    return { status: 200, body: await readers.schedule('shared') };
  }
  if (institution !== 'raaga' && institution !== 'sruti') access.badInstitution();

  if (teacherLinks) {
    access.admin(claims, institution);
    return { status: 200, body: await readers.directory('teacherLinks', institution, claims) };
  }

  if (schedule || teacherMe || plainDirectory) {
    access.view(claims, institution);
    if (schedule) return { status: 200, body: await readers.schedule(institution) };
    const action = teacherMe ? 'teacherMe' : root === 'teachers' ? 'teachers' : root;
    return { status: 200, body: await readers.directory(action, institution, claims) };
  }

  // Managed event lists, student/family identities, practice histories, and
  // historical audit are strictly administrator-only, as in the M10 adapters.
  access.admin(claims, institution);
  if (managedEvents) return { status: 200, body: await readers.managedEvents(institution) };
  if (coreDirectory) return { status: 200, body: await readers.core(root, institution, claims) };
  if (studentDetails) {
    return {
      status: 200,
      body: await readers.studentDetails(parts[1], institution, claims),
    };
  }
  if (audit) return { status: 200, body: await readers.audit(institution) };
  const studentId = query.studentId;
  if (typeof studentId !== 'string' || !/^[-_a-zA-Z0-9]{4,150}$/.test(studentId)) {
    access.badStudent();
  }
  return { status: 200, body: await readers.practice(institution, studentId) };
}
