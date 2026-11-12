/**
 * Final-table-only administrator management bridge.
 *
 * The established administrator services use Cognito (and private S3 for
 * directory photo links), not legacy DynamoDB PK/SK tables. Keep their existing
 * manager rules and payload validation. Mutations require individual opt-ins.
 * This never provisions learners or grants guardian access.
 */
const blocked = (message, status = 503) => ({ status, body: { error: message } });
const validInstitution = (value) => value === 'raaga' || value === 'sruti';
const actions = Object.freeze({
  'POST:invite': { flag: 'SADHANA_FINAL_ADMIN_INVITES', service: 'invite', status: 201 },
  'POST:access': {
    flag: 'SADHANA_FINAL_ADMIN_ACCESS_CHANGES',
    service: 'changeAccess',
    status: 200,
  },
  'PATCH:profile': {
    flag: 'SADHANA_FINAL_ADMIN_PROFILE_WRITES',
    service: 'updateProfile',
    status: 200,
  },
});

export async function finalAdministratorRoute(context, services, access, env = process.env) {
  if (env.SADHANA_ENTITY_TABLE_SET !== 'final') return undefined;
  const { parts, method, claims, query = {}, event = {} } = context;
  if (!Array.isArray(parts) || parts[0] !== 'administrators') return undefined;
  if (!claims?.sub) return blocked('Authenticated account required.', 401);
  if (env.SADHANA_DATA_MODE === 'split' || env.SADHANA_ENTITY_FINAL_ACK !== 'enabled')
    return blocked('Final-table cutover has not been authorised.');

  if (method === 'GET' && parts.length === 1) {
    if (env.SADHANA_FINAL_ADMIN_READS !== 'enabled')
      return blocked('Final administrator directory is disabled.');
    const institution = query.institution ?? context.inst;
    if (!validInstitution(institution)) return blocked('Choose a valid institution.', 400);
    access.admin(claims, institution);
    return { status: 200, body: await services.list(institution, claims) };
  }

  if (parts.length !== 2) return blocked('Unsupported administrator operation.', 405);
  const route = actions[`${method}:${parts[1]}`];
  if (!route) return blocked('Unsupported administrator operation.', 405);
  if (env[route.flag] !== 'enabled') return blocked('Final administrator operation is disabled.');
  // Re-validate the protected designated manager before a Cognito mutation.
  // Underlying services perform this check again and validate exact body keys.
  access.manager(claims);
  const raw = event.body
    ? event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body
    : '';
  const body = services.parse(raw);
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return blocked('Expected a JSON object.', 400);
  return { status: route.status, body: await services[route.service](body, claims) };
}
