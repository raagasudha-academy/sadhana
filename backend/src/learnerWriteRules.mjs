/** Pure validation rules shared by M9 learner writes; no AWS or legacy access. */
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
export function validatePractice(body, withinWindow) {
  const allowed = ['classId', 'date', 'minutes', 'topic', 'comments', 'expectedVersion'];
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((k) => !allowed.includes(k))
  )
    fail(400, 'Unexpected practice data');
  const { classId, date, minutes, topic, comments, expectedVersion } = body;
  if (
    typeof classId !== 'string' ||
    !/^CLASS-[a-z0-9-]+$/i.test(classId) ||
    typeof date !== 'string' ||
    !withinWindow(date) ||
    !Number.isInteger(minutes) ||
    minutes < 1 ||
    minutes > 1440 ||
    typeof topic !== 'string' ||
    !topic.trim() ||
    topic.length > 200 ||
    typeof comments !== 'string' ||
    comments.length > 1500
  )
    fail(400, 'Enter date, class, duration, topic and notes');
  return {
    classId,
    date,
    minutes,
    topic: topic.trim(),
    comments: comments.trim(),
    expectedVersion,
  };
}
export function validateRsvp(body) {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((k) => !['sessionId', 'intention'].includes(k))
  )
    fail(400, 'Unexpected RSVP data');
  const { sessionId, intention } = body;
  if (
    typeof sessionId !== 'string' ||
    !/^[-a-zA-Z0-9]+$/.test(sessionId) ||
    !['attending', 'not_attending', 'unknown'].includes(intention)
  )
    fail(400, 'Choose a valid class and response');
  return { sessionId, intention };
}
export function isActiveEnrolment(e, institution, studentId, classId, date) {
  return (
    e?.institutionId === institution &&
    e?.studentId === studentId &&
    e?.classId === classId &&
    e?.status === 'active' &&
    (!e.startDate || e.startDate <= date) &&
    (!e.endDate || date <= e.endDate)
  );
}
export function canRsvp(session, today, clock) {
  const date = session?.localDate || session?.legacyPayload?.date;
  const start = session?.localStartTime || session?.legacyPayload?.startTime;
  if (
    !session ||
    session.recordType !== 'class-session' ||
    typeof date !== 'string' ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date) ||
    date < today
  )
    return false;
  return (
    date !== today ||
    typeof start !== 'string' ||
    !/^[0-2]\d:[0-5]\d/.test(start) ||
    clock < start.slice(0, 5)
  );
}
