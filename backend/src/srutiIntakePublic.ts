/** Deploy as a DISTINCT, throttled public Lambda/API, never on the JWT-only Sadhana API. */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { validateSrutiSubmission, newSrutiIntakeRecord } from './srutiIntakeCore.mjs';
import { srutiWriterTables } from './srutiMirrorPolicy.mjs';
const db = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }),
);
const origins = new Set(['https://sruti.co.uk', 'https://www.sruti.co.uk']);
const response = (statusCode: number, body: unknown, origin: string) => ({
  statusCode,
  headers: {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    ...(origins.has(origin) ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}),
  },
  body: JSON.stringify(body),
});
export function makeM91SrutiIntakeHandler(dbClient: { send: (command: any) => Promise<any> } = db) {
  return async function handler(event: any) {
    const origin = event.headers?.origin || event.headers?.Origin || '';
    const method = event.requestContext?.http?.method || event.httpMethod;
    if (!origins.has(origin)) return response(403, { error: 'Origin not allowed.' }, origin);
    if (method === 'OPTIONS')
      return {
        statusCode: 204,
        headers: {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'POST,OPTIONS',
          'access-control-allow-headers': 'Content-Type',
          vary: 'Origin',
        },
        body: '',
      };
    if (method !== 'POST') return response(405, { error: 'Method not allowed.' }, origin);
    if (
      process.env.SADHANA_ENTITY_STAGE !== 'prod' ||
      process.env.M91_SRUTI_PUBLIC_INTAKE !== 'enabled'
    )
      return response(503, { error: 'Registrations are not enabled.' }, origin);
    try {
      if (typeof event.body !== 'string' || event.body.length > 25000)
        return response(413, { error: 'Registration exceeds size limit.' }, origin);
      const raw = JSON.parse(
        event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body,
      );
      if (raw?.website?.company) return response(202, { received: true }, origin); // honeypot; no persistence
      const payload = validateSrutiSubmission(raw);
      // Six random hexadecimal digits match Raagasudha's concise receipt style.
      // Every candidate is reserved by a conditional database write; retry on a
      // real ID collision rather than overwrite a previous family's registration.
      const writer = srutiWriterTables(process.env);
      for (let attempt = 0; attempt < 8; attempt++) {
        const record = newSrutiIntakeRecord(payload);
        try {
          await dbClient.send(
            new PutCommand({
              TableName: writer.primary,
              Item: record,
              ConditionExpression: 'attribute_not_exists(registrationId)',
            }),
          );
          return response(202, { received: true, registrationId: record.registrationId }, origin);
        } catch (error: any) {
          if (error?.name === 'ConditionalCheckFailedException') continue;
          // A transaction may be cancelled for reasons other than an ID collision.
          // In mirror mode we fail closed rather than silently accept a partial write.
          throw error;
        }
      }
      throw new Error('Registration reference allocation exhausted.');
    } catch (e: any) {
      if (e?.status === 400 || e instanceof SyntaxError)
        return response(400, { error: 'Please check your registration details.' }, origin);
      console.error('Sruti intake unavailable', { errorType: e?.name || 'Error' }); // never log PII
      return response(503, { error: 'Registration service unavailable.' }, origin);
    }
  };
}
export const handler = makeM91SrutiIntakeHandler();
