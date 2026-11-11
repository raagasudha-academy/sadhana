/**
 * Strict final-table facade for the EXISTING Sruti website-registration API.
 *
 * The public intake writer must be migrated/frozen/reconciled separately. This
 * Sruti imports are explicit, mode-scoped and separately gated; this never routes Raagasudha through its legacy
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
  const parentStatus = method === 'GET' && parts.length === 3 && parts[2] === 'access-status' && importId(parts[1]);
  const parentAction = method === 'POST' && parts.length === 3 && ['provision-parent','resend-parent-invitation'].includes(parts[2]) && importId(parts[1]);
  const preview = method === 'POST' && parts.length === 3 && parts[2] === 'import-preview' && importId(parts[1]);
  const execute = method === 'POST' && parts.length === 3 && parts[2] === 'import-execute' && importId(parts[1]);
  if (!list && !detail && !review && !parentStatus && !parentAction && !preview && !execute)
    return stop('Registration operation not migrated. Import execution is disabled.');
  if ((list || detail || parentStatus || preview || execute) && env.SADHANA_FINAL_SRUTI_REGISTRATION_READS !== 'enabled')
    return stop('Final Sruti registration reads are disabled.');
  if (review && (env.SADHANA_FINAL_SRUTI_REVIEW_WRITES !== 'enabled' || env.M91_SRUTI_REVIEW_WRITES !== 'enabled'))
    return stop('Final Sruti registration review writes are disabled.');
  if(parentStatus){
    if(typeof dependencies.parentStatus!=='function')return stop('Sruti parent-account status reader is not configured.');
    dependencies.assertConfigured();
    return {status:200,body:await dependencies.parentStatus(parts[1])};
  }
  if(parentAction){
    const body=dependencies.parse(context.event);
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1||body.confirmReference!==parts[1])
      return stop('Confirm the exact registration reference before requesting an invitation.',400);
    const flag=parts[2]==='provision-parent'?'SADHANA_FINAL_SRUTI_PARENT_INVITATIONS':'SADHANA_FINAL_SRUTI_PARENT_RESENDS';
    if(env[flag]!=='enabled')return stop('Parent invitation actions are not enabled for this academy.');
    if(typeof dependencies.parentAction!=='function')return stop('Sruti parent invitation handler is not configured.');
    dependencies.assertConfigured();
    return {status:200,body:await dependencies.parentAction(parts[2],parts[1],claims.sub,body.confirmReference)};
  }
  if (preview || execute) {
    const body = dependencies.parse(context.event);
    if (body?.mode === 'new-family') {
      if (execute && body.confirmReference !== parts[1])
        return stop('Confirm the exact Sruti registration reference before importing.', 400);
      if (execute && env.SADHANA_FINAL_SRUTI_IMPORT_WRITES !== 'enabled')
        return stop('New-family Sruti imports are disabled until the final-table import gate is enabled.');
      if (typeof dependencies.freshImport !== 'function')
        return stop('New-family Sruti import is not configured.');
      dependencies.assertConfigured();
      const result=await dependencies.freshImport(parts[1],claims,execute);
      return {status:200,body:execute?result:{...result,importWritesEnabled:
        env.SADHANA_FINAL_SRUTI_IMPORT_WRITES==='enabled'&&env.M91_SRUTI_IMPORT_WRITES==='enabled'}};
    }
    if (execute && (!body || body.mode !== 'existing'))
      return stop('Choose an explicit new-family import or provide verified existing-student identities.', 409);
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
