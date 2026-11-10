/**
 * Strict final-table facade for the EXISTING Sruti website-registration API.
 *
 * The public intake writer must be migrated/frozen/reconciled separately. This
 * adapter cannot enable imports and never routes Raagasudha through its legacy
 * website registration gateway. No final-mode request reaches an M9 pilot route
 * unless it matches one of the exact endpoints listed below.
 */
const stop = (message, status = 503) => ({status, body: {error: message}});
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value);
const importId = value => typeof value === 'string' && /^SR-[A-Za-z0-9-]{1,110}$/.test(value);

export async function finalRegistrationRoute(context, dependencies, access, env = process.env) {
  if (env.SADHANA_ENTITY_TABLE_SET !== 'final') return undefined;
  const {parts, method, query = {}, claims} = context;
  if (!Array.isArray(parts) || parts[0] !== 'website-registrations') return undefined;
  if (!claims?.sub) return stop('Authenticated account required.', 401);
  if (env.SADHANA_DATA_MODE === 'split' || env.SADHANA_ENTITY_FINAL_ACK !== 'enabled')
    return stop('Final-table cutover has not been authorised.');
  // Existing Raagasudha registration client does not send an institution
  // query parameter. Only an explicit ?institution=sruti selects Sruti.
  // The staff academy permission check below still applies to both.
  const institution = query.institution ?? context.inst ?? 'raaga';
  if (institution !== 'sruti' && institution !== 'raaga')
    return stop('Choose a valid institution.', 400);
  // Do not let a Sruti-only operator infer or modify Raagasudha registrations.
  access.admin(claims, institution);
  if (institution === 'raaga') {
    if (!dependencies.raaga) return stop('Raagasudha final intake is not configured.');
    return dependencies.raaga(context);
  }
  // Live Sruti intake still writes to the M9 table. This ACK is only appropriate
  // once ingress is redirected/fenced and a fresh parity check has passed.
  if (env.SADHANA_FINAL_SRUTI_INGRESS_READY !== 'enabled')
    return stop('Sruti public-intake destination has not been verified.');

  const list = method === 'GET' && parts.length === 1;
  const detail = method === 'GET' && parts.length === 2 && safeId(parts[1]);
  const review = method === 'PATCH' && parts.length === 2 && safeId(parts[1]);
  const preview = method === 'POST' && parts.length === 3 && parts[2] === 'import-preview' && importId(parts[1]);
  const execute = method === 'POST' && parts.length === 3 && parts[2] === 'import-execute' && importId(parts[1]);
  if (!list && !detail && !review && !preview && !execute)
    return stop('Registration operation not migrated. Import execution is disabled.');
  if ((list || detail || preview || execute) && env.SADHANA_FINAL_SRUTI_REGISTRATION_READS !== 'enabled')
    return stop('Final Sruti registration reads are disabled.');
  if (review && (env.SADHANA_FINAL_SRUTI_REVIEW_WRITES !== 'enabled' || env.M91_SRUTI_REVIEW_WRITES !== 'enabled'))
    return stop('Final Sruti registration review writes are disabled.');
  if (preview || execute) {
    const body = dependencies.parse(context.event);
    if (execute && (!body || body.mode !== 'existing'))
      return stop('Existing-student import requires explicit confirmed identities. Fresh import remains disabled.', 409);
    if (preview && body?.mode !== 'existing')
      return {status: 200, body: {preview: true, readyForExecute: false,
        requiresIdentityMapping: true, registrationId: parts[1],
        message: 'Select existing verified Sadhana identities before importing Sruti students.'}};
    if (body?.mode === 'existing') {
      if (env.SADHANA_FINAL_SRUTI_REGISTRATION_READS !== 'enabled')
        return stop('Sruti registration preview is disabled.');
      if (execute && env.SADHANA_FINAL_SRUTI_EXISTING_IMPORT_WRITES !== 'enabled')
        return stop('Existing-student Sruti import writes are disabled.');
      dependencies.assertConfigured();
      return {status: 200,body: await dependencies.existingImport(parts[1],claims.sub,Object.fromEntries(Object.entries(body).filter(([key])=>key!=='mode')),execute)};
    }
  }
  dependencies.assertConfigured();
  // The reused M10 route verifies JWT administrator scope again and uses
  // conditional review updates. Preview does not execute student imports.
  const response = await dependencies.registration(context);
  if (!response || !Number.isInteger(response.statusCode) || typeof response.body !== 'string')
    throw new Error('Invalid Sruti registration adapter response');
  return {status: response.statusCode, body: JSON.parse(response.body)};
}
