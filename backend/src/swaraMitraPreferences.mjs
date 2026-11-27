/** Cognito-protected teacher/admin controls for student WhatsApp delivery. */
export async function swaraMitraPreferencesRoute(context, deps, access, env = process.env) {
  if (env.SADHANA_ENTITY_TABLE_SET !== 'final') return undefined;
  const { parts, method, query = {}, claims, event = {} } = context;
  if (parts?.[0] !== 'integrations' || parts?.[1] !== 'swaramitra' || parts?.[2] !== 'preferences')
    return undefined;
  if (env.SADHANA_DATA_MODE === 'split' || env.SADHANA_ENTITY_FINAL_ACK !== 'enabled')
    return { status: 503, body: { error: 'Canonical tables not acknowledged.' } };
  if (env.SADHANA_SWARAMITRA_WHATSAPP !== 'enabled')
    return { status: 503, body: { error: 'SwaraMitra communication settings are disabled.' } };
  if (!claims?.sub) return { status: 401, body: { error: 'Sign in to Sadhana.' } };
  const inst = query.institution ?? context.inst;
  if (inst !== 'raaga' && inst !== 'sruti')
    return { status: 400, body: { error: 'Invalid academy.' } };

  const isList = method === 'GET' && parts.length === 3;
  const isUpdate = method === 'PATCH' && parts.length === 4;
  const isSend = method === 'POST' && parts.length === 4 && parts[3] === 'send';
  if (!isList && !isUpdate && !isSend) return undefined;
  const classId = isList ? query.classId : undefined;
  let input;
  if (isUpdate || isSend) {
    try {
      input = event.body
        ? JSON.parse(
            event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body,
          )
        : {};
    } catch {
      return { status: 400, body: { error: 'Invalid JSON.' } };
    }
    if (!input || typeof input !== 'object' || Array.isArray(input))
      return { status: 400, body: { error: 'Invalid settings.' } };
  }
  const requestedClassId = isList ? classId : input.classId;
  if (typeof requestedClassId !== 'string' || !requestedClassId.trim())
    return { status: 400, body: { error: 'Choose a class.' } };

  access.view(claims, inst);
  const classes = await deps.directory('classes', inst, claims);
  const targetClass = (classes?.records ?? []).find(
    (row) =>
      row.id === requestedClassId && row.archived !== true && row.lifecycleStatus !== 'archived',
  );
  if (!targetClass) return { status: 404, body: { error: 'Active class not found.' } };

  const isAdmin = access.permittedInstitutions(claims).includes(inst);
  let assignedClassIds;
  if (!isAdmin) {
    const teacher = await deps.directory('teacherMe', inst, claims);
    if (!teacher?.linked || !teacher.teacherId)
      return { status: 403, body: { error: 'Verified academy teacher required.' } };
    assignedClassIds = new Set(
      (classes?.records ?? [])
        .filter(
          (row) =>
            row.teacherId === teacher.teacherId &&
            row.archived !== true &&
            row.lifecycleStatus !== 'archived',
        )
        .map((row) => row.id),
    );
    if (!assignedClassIds.has(requestedClassId))
      return { status: 403, body: { error: 'This class is not assigned to you.' } };
  }
  const enrolmentRows = isAdmin
    ? ((await deps.core('enrolments', inst, claims))?.records ?? [])
    : ((await deps.teacherEnrolments(inst, assignedClassIds))?.records ?? []);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const studentIds = [
    ...new Set(
      enrolmentRows
        .filter(
          (row) =>
            row.classId === requestedClassId &&
            row.archived !== true &&
            row.status !== 'inactive' &&
            (!row.startDate || row.startDate <= today) &&
            (!row.endDate || row.endDate >= today),
        )
        .map((row) => row.studentId)
        .filter((id) => typeof id === 'string'),
    ),
  ];
  if (isList) {
    const records = await deps.preferences.list(inst, studentIds);
    return { status: 200, body: { records } };
  }
  if (isSend) {
    const { resourceId, title, message, requestId } = input;
    if (
      typeof resourceId !== 'string' ||
      !resourceId.trim() ||
      typeof title !== 'string' ||
      !title.trim() ||
      title.length > 120 ||
      typeof message !== 'string' ||
      !message.trim() ||
      message.length > 1000 ||
      typeof requestId !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(requestId)
    )
      return { status: 400, body: { error: 'Provide a short message and unique request ID.' } };
    const preferences = await deps.preferences.list(inst, studentIds);
    const eligibleIds = preferences
      .filter((record) => record.whatsappAllowed === true && record.whatsappReady === true)
      .map((record) => record.studentId);
    const result = await deps.outbox.enqueue({
      institution: inst,
      classId: requestedClassId,
      studentIds: eligibleIds,
      resourceId,
      title: title.trim(),
      message: message.trim(),
      requestId,
    });
    return { status: 201, body: { queued: result.queued, eligible: eligibleIds.length } };
  }
  if (!studentIds.includes(parts[3]))
    return { status: 403, body: { error: 'Student is not actively enrolled in this class.' } };
  if (env.SADHANA_FINAL_CORE_WRITES !== 'enabled')
    return { status: 503, body: { error: 'Student communication settings are read-only.' } };
  const record = await deps.preferences.update(inst, parts[3], claims, {
    whatsappAllowed: input.whatsappAllowed,
  });
  return { status: 200, body: { record } };
}
