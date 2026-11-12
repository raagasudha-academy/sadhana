/** Final-table compatibility for DELETE /operations/family/:id.
 * It uses the canonical preview/execute service and never reaches legacy storage.
 */
const reply = (status, error) => ({ status, body: { error } });
const validFamilyId = (value) =>
  typeof value === 'string' && /^[A-Za-z0-9_#.:-]{4,180}$/.test(value);
export async function finalOperationsFamilyDeleteRoute(context, deps, env = process.env) {
  if (env.SADHANA_ENTITY_TABLE_SET !== 'final') return undefined;
  const { parts, method, claims, query = {}, event } = context;
  if (
    !Array.isArray(parts) ||
    parts[0] !== 'operations' ||
    parts[1] !== 'family' ||
    parts.length !== 3 ||
    method !== 'DELETE'
  )
    return undefined;
  if (!claims?.sub) return reply(401, 'Authenticated account required.');
  if (!deps.isSuperAdmin(claims)) return reply(403, 'Super Admin role required.');
  const institution = query.institution ?? context.inst;
  if (!['raaga', 'sruti'].includes(institution)) return reply(400, 'Choose an academy.');
  if (!validFamilyId(parts[2])) return reply(400, 'Invalid family identifier.');
  if (env.SADHANA_DATA_MODE === 'split' || env.SADHANA_ENTITY_FINAL_ACK !== 'enabled')
    return reply(503, 'Final-table cutover is not authorised.');
  let body;
  try {
    body = deps.parse(event);
  } catch {
    return reply(400, 'Invalid JSON.');
  }
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((k) => !['confirm', 'expectedVersion'].includes(k)) ||
    body.confirm !== 'DELETE' ||
    !Number.isSafeInteger(body.expectedVersion) ||
    body.expectedVersion < 1
  )
    return reply(400, 'Confirm DELETE with the current family version.');
  if (!deps.service?.preview || !deps.service?.execute)
    return reply(503, 'Canonical family deletion is not configured; no records were deleted.');
  try {
    const args = {
      actor: claims.sub,
      institution,
      type: 'family',
      id: parts[2],
      expectedVersion: body.expectedVersion,
    };
    const preview = await deps.service.preview(args);
    if (preview.executionBlocked)
      return reply(
        409,
        preview.notice ||
          'Family provenance requires manual reconciliation; no records were deleted.',
      );
    if (preview.executionEnabled !== true)
      return reply(
        503,
        preview.executionReason || 'Permanent deletion is disabled by the deployment setting.',
      );
    const result = await deps.service.execute({ ...args, signature: preview.signature });
    return {
      status: 200,
      body: { ...result, familyId: parts[2], studentsDeleted: preview.studentCount || 0 },
    };
  } catch (error) {
    return reply(
      Number.isInteger(error?.status) ? error.status : 503,
      error?.status
        ? error.message
        : 'Family deletion could not be completed. No success was confirmed.',
    );
  }
}
