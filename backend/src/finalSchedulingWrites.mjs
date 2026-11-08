/**
 * Final-entity-table scheduling WRITE facade.
 * Uses the existing schema-aware M95 conditional/transactional writers.
 * Each category requires its own explicit final-only opt-in; all old M9 flags
 * remain independent and unchanged. Unsupported actions never fall back to
 * the legacy PK/SK backend.
 */
const fail = (error, status = 503) => ({status, body: {error}});
const idOK = x => typeof x === 'string' && /^[-a-zA-Z0-9]{4,90}$/.test(x);

export async function finalSchedulingWriteRoute(context, dependencies, access, env = process.env) {
  if (env.SADHANA_ENTITY_TABLE_SET !== 'final') return undefined;
  const {parts, method, claims, query = {}, event} = context;
  if (!Array.isArray(parts) || !['schedule', 'events', 'additional-sessions'].includes(parts[0]) || method === 'GET') return undefined;
  // Block *all* other writes here, before the legacy / M10 pilot dispatch.
  if (!['POST', 'PATCH', 'DELETE'].includes(method)) return fail('Unsupported scheduling method.', 405);
  if (!claims?.sub) return fail('Authenticated account required.', 401);
  if (env.SADHANA_DATA_MODE === 'split' || env.SADHANA_ENTITY_FINAL_ACK !== 'enabled')
    return fail('Final-table cutover has not been authorised.');
  const root = parts[0], institution = query.institution ?? context.inst;
  if (root === 'additional-sessions') {
    if (method !== 'POST' || parts.length !== 1) return fail('Unsupported additional-sessions action.', 405);
    if (institution !== 'raaga' && institution !== 'sruti') return fail('Choose an academy.', 400);
    if (env.SADHANA_FINAL_CALENDAR_WRITES !== 'enabled') return fail('This final-table scheduling write is disabled.');
    access.view(claims, institution);
    dependencies.assertConfigured();
    return {status:201,body:await dependencies.sessions().createAdditionalSessions(institution, dependencies.parse(event), claims, access.permittedInstitutions(claims).includes(institution))};
  }
  const series = root === 'schedule' && parts[1] === 'series';
  const category = root === 'events' ? 'SADHANA_FINAL_EVENT_WRITES'
    : series ? 'SADHANA_FINAL_SERIES_WRITES' : 'SADHANA_FINAL_CALENDAR_WRITES';
  if (env[category] !== 'enabled') return fail('This final-table scheduling write is disabled.');
  // On live dependencies this invokes entityTable(), verifying that routing
  // resolves to the authorised *final* set before opening any DB clients.
  dependencies.assertConfigured();
  const payload = () => dependencies.parse(event);

  if (root === 'schedule') {
    if (institution !== 'raaga' && institution !== 'sruti') return fail('Select an academy for calendar changes.', 400);
    const isAdmin = access.permittedInstitutions(claims).includes(institution);
    // All authority checks for teacher actions happen server-side using the
    // verified Cognito sub and the canonical master class teacherPersonIds.
    access.view(claims, institution);
    if (!series && parts.length === 1 && method === 'POST')
      return {status:201,body:isAdmin
        ? await dependencies.calendar().create(institution,payload(),claims)
        : await dependencies.sessions().createTeacherSession(institution,payload(),claims)};
    if (!series && parts.length === 2 && method === 'PATCH' && idOK(parts[1]))
      return {status:200,body:isAdmin
        ? await dependencies.calendar().patch(institution,parts[1],payload(),claims)
        : await dependencies.sessions().updateTeacherSession(institution,parts[1],payload(),claims)};
    if (!series && parts.length === 2 && method === 'DELETE' && idOK(parts[1]))
      return {status:200,body:await dependencies.sessions().deleteSession(institution,parts[1],payload(),claims,isAdmin)};
    if (parts.length === 4 && parts[1]==='master' && parts[3]==='delete-preview' && method==='POST' && idOK(parts[2])) {
      access.admin(claims,institution);
      return {status:200,body:await dependencies.sessions().previewDeleteClass(institution,parts[2],payload())};
    }
    if (parts.length === 3 && parts[1]==='master' && method==='DELETE' && idOK(parts[2])) {
      access.admin(claims,institution);
      return {status:200,body:await dependencies.sessions().deleteClass(institution,parts[2],payload(),claims)};
    }
    if (parts.length === 4 && parts[1]==='series' && parts[3]==='delete-preview' && method==='POST' && idOK(parts[2])) {
      access.admin(claims,institution);
      return {status:200,body:await dependencies.sessions().previewDeleteSeries(institution,parts[2],payload())};
    }
    if (parts.length === 3 && parts[1]==='series' && method==='DELETE' && idOK(parts[2])) {
      access.admin(claims,institution);
      return {status:200,body:await dependencies.sessions().deleteSeries(institution,parts[2],payload(),claims)};
    }
    if (series && parts.length === 3 && method === 'PATCH' && idOK(parts[2]))
      access.admin(claims,institution);
    if (series && parts.length === 3 && method === 'PATCH' && idOK(parts[2]))
      return {status: 200, body: await dependencies.series().change(institution, parts[2], payload(), claims)};
    if (series && parts.length === 4 && parts[3] === 'preview' && method === 'POST' && idOK(parts[2]))
      access.admin(claims,institution);
    if (series && parts.length === 4 && parts[3] === 'preview' && method === 'POST' && idOK(parts[2]))
      return {status: 200, body: await dependencies.series().preview(institution, parts[2], payload(), claims)};
    return fail('Unsupported calendar write. No legacy fallback.');
  }

  if (parts[1] === 'shared') {
    // The managed-event writer independently requires both academy admin
    // roles; viewing either academy is not enough to author shared events.
    if (!access.viewableInstitutions(claims).length) access.deny();
    if (parts.length === 2 && method === 'POST')
      return {status: 201, body: await dependencies.events().shared(claims, payload())};
    if (parts.length === 3 && idOK(parts[2]) && method === 'PATCH')
      return {status: 200, body: await dependencies.events().shared(claims, payload(), parts[2])};
    if (parts.length === 3 && idOK(parts[2]) && method === 'DELETE')
      return {status: 200, body: await dependencies.events().shared(claims, payload(), parts[2], true)};
    return fail('Unsupported shared event write. No legacy fallback.');
  }
  if (institution !== 'raaga' && institution !== 'sruti') return fail('Select an academy for event changes.', 400);
  access.view(claims, institution);
  // The managed-event writer performs the further administrator/active-teacher
  // identity, assignment, and owner checks before it writes.
  if (parts.length === 1 && method === 'POST')
    return {status: 201, body: await dependencies.events().save(institution, claims, payload())};
  if (parts.length === 2 && idOK(parts[1]) && method === 'PATCH')
    return {status: 200, body: await dependencies.events().save(institution, claims, payload(), parts[1])};
  if (parts.length === 2 && idOK(parts[1]) && method === 'DELETE') {
    const body = payload();
    if (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 1)
      return fail('Expected a positive record version.', 400);
    return {status: 200, body: await dependencies.events().cancel(institution, claims, parts[1], body.expectedVersion)};
  }
  return fail('Unsupported managed event write. No legacy fallback.');
}
