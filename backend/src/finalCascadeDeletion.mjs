/** Super Admin final-table cascade facade.
 * Authorization and validated request dispatch only. Destructive service
 * intentionally unavailable until canonical writer fencing and dependency
 * enumeration are audited. Never falls through to legacy routes.
 */
const refuse = (status, error) => ({ status, body: { error } });
const validId = (v) => typeof v === 'string' && /^[A-Za-z0-9_#.:-]{4,180}$/.test(v);
export async function finalCascadeDeletionRoute(context, deps, env = process.env) {
  if (env.SADHANA_ENTITY_TABLE_SET !== 'final') return undefined;
  const { parts, method, claims, query = {}, event } = context;
  if (
    !Array.isArray(parts) ||
    parts.length !== 3 ||
    parts[0] !== 'super-admin' ||
    parts[1] !== 'deletions'
  )
    return undefined;
  if (!['preview', 'execute'].includes(parts[2])) return refuse(404, 'Unknown deletion operation.');
  if (method !== 'POST') return refuse(405, 'Only POST is supported.');
  if (!claims?.sub) return refuse(401, 'Authenticated account required.');
  if (!deps.isSuperAdmin(claims)) return refuse(403, 'Super Admin role required.');
  const institution = query.institution ?? context.inst;
  if (!['raaga', 'sruti'].includes(institution)) return refuse(400, 'Choose an academy.');
  if (env.SADHANA_DATA_MODE === 'split' || env.SADHANA_ENTITY_FINAL_ACK !== 'enabled')
    return refuse(503, 'Final-table cutover is not authorised.');
  let body;
  try {
    body = deps.parse(event);
  } catch {
    return refuse(400, 'Invalid JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return refuse(400, 'Invalid deletion request.');
  const executing = parts[2] === 'execute';
  const allowed = executing
    ? ['type', 'id', 'expectedVersion', 'signature', 'confirm']
    : ['type', 'id', 'expectedVersion'];
  if (
    Object.keys(body).some((k) => !allowed.includes(k)) ||
    !['student', 'students', 'family', 'families'].includes(body.type) ||
    !validId(body.id) ||
    !Number.isSafeInteger(body.expectedVersion) ||
    body.expectedVersion < 1
  )
    return refuse(400, 'Invalid target or record version.');
  if (
    executing &&
    (body.confirm !== 'DELETE' || typeof body.signature !== 'string' || body.signature.length < 32)
  )
    return refuse(400, 'Valid signed preview and DELETE confirmation required.');
  if (!deps.service)
    return refuse(503, 'Canonical cascade safety gates are not complete; no records were deleted.');
  try {
    const canonicalType = {
      student: 'student',
      students: 'student',
      family: 'family',
      families: 'family',
    }[body.type];
    const result = await deps.service[parts[2]]({
      actor: claims.sub,
      institution,
      ...body,
      type: canonicalType,
    });
    return {
      status: 200,
      body: executing ? result : { ...result, targetType: body.type },
    };
  } catch (e) {
    return refuse(
      Number.isInteger(e?.status) ? e.status : 503,
      e?.status ? e.message : 'Cascade operation unavailable; no success confirmed.',
    );
  }
}
