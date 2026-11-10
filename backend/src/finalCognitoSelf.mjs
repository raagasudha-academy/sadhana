/**
 * Narrow, authenticated self-service bridge for a future final-table cutover.
 * Only routes whose implementation is exclusively Cognito/S3 are permitted.
 * Never reads or writes legacy DynamoDB. All services are injected for tests.
 */
export async function finalCognitoSelfRoute(context, services, codecs, env = process.env) {
  if (env.SADHANA_ENTITY_TABLE_SET !== 'final') return undefined;
  const {parts, method, claims, event} = context;
  if (!claims?.sub || !Array.isArray(parts)) return undefined;
  const body = () => event?.body
    ? event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body
    : '';
  if (parts.length === 2 && parts[0] === 'me' && parts[1] === 'profile') {
    if (method === 'GET') return {status: 200, body: await services.getProfile(claims.sub)};
    if (method === 'PATCH') return {status: 200, body: await services.saveProfile(claims.sub, codecs.readJSON(body()))};
    return {status: 405, body: {error: 'Unsupported profile action.'}};
  }
  if (parts.length === 2 && parts[0] === 'photos' && parts[1] === 'me') {
    if (method !== 'POST') return {status: 405, body: {error: 'Unsupported photo action.'}};
    return {status: 200, body: await services.uploadOwnPhoto(codecs.readPhotoJSON(body()), claims)};
  }
  return undefined;
}
