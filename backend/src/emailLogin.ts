import {
  AdminInitiateAuthCommand,
  AdminRespondToAuthChallengeCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { json, readJSON } from './routes/http.ts';
import type { JsonResponse, SadhanaHttpEvent } from './routes/http.ts';

type CognitoClient = { send(command: unknown): Promise<any> };
type LoginEnvironment = { userPoolId?: string; clientId?: string };

const cognito = new CognitoIdentityProviderClient({});
const genericFailure = () => json(401, { error: 'Incorrect email or password.' });
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function authRouteParts(event: SadhanaHttpEvent) {
  const rawPath = event.rawPath || event.path || '';
  const match = rawPath.match(/\/api\/auth(?:\/(.*))?$/);
  return match ? (match[1] || '').split('/').filter(Boolean) : [];
}

function normalizedEmail(value: unknown) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return emailPattern.test(email) && email.length <= 254 ? email : '';
}

async function resolveUsername(client: CognitoClient, userPoolId: string, email: string) {
  const escaped = email.replace(/[\\"]/g, (character) => `\\${character}`);
  const result = await client.send(
    new ListUsersCommand({ UserPoolId: userPoolId, Filter: `email = "${escaped}"`, Limit: 20 }),
  );
  const matches = (result.Users || []).filter(
    (user: any) =>
      String(user.Attributes?.find((attribute: any) => attribute.Name === 'email')?.Value || '')
        .trim()
        .toLowerCase() === email && user.Username,
  );
  return matches.length === 1 ? String(matches[0].Username) : '';
}

function resultBody(result: any, username: string) {
  if (result.AuthenticationResult) return json(200, { ...result, Username: username });
  if (result.ChallengeName && result.Session) return json(200, { ...result, Username: username });
  return genericFailure();
}

export async function emailLoginRoute(
  event: SadhanaHttpEvent,
  dependencies: {
    client?: CognitoClient;
    environment?: LoginEnvironment;
  } = {},
): Promise<JsonResponse | undefined> {
  const parts = authRouteParts(event);
  if (!parts.length) return undefined;
  const method = event.requestContext?.http?.method ?? event.httpMethod;
  if (method !== 'POST') return json(405, { error: 'Method not supported.' });
  const body = readJSON(event.body || '');
  const email = normalizedEmail(body.email);
  const userPoolId =
    dependencies.environment?.userPoolId || process.env.SADHANA_COGNITO_USER_POOL_ID;
  const clientId = dependencies.environment?.clientId || process.env.SADHANA_COGNITO_APP_CLIENT_ID;
  const client = dependencies.client || cognito;
  if (!email) return genericFailure();
  if (!userPoolId || !clientId) return json(503, { error: 'Email sign-in is unavailable.' });

  try {
    if (parts.length === 1 && parts[0] === 'login') {
      if (typeof body.password !== 'string' || !body.password || body.password.length > 256)
        return genericFailure();
      const username = await resolveUsername(client, userPoolId, email);
      if (!username) return genericFailure();
      const result = await client.send(
        new AdminInitiateAuthCommand({
          UserPoolId: userPoolId,
          ClientId: clientId,
          AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
          AuthParameters: { USERNAME: username, PASSWORD: body.password },
        }),
      );
      return resultBody(result, username);
    }

    if (parts.length === 1 && parts[0] === 'challenge') {
      const username = await resolveUsername(client, userPoolId, email);
      const session = typeof body.session === 'string' ? body.session : '';
      const challengeName = body.challengeName;
      if (
        !username ||
        username !== body.username ||
        !session ||
        session.length > 8192 ||
        challengeName !== 'NEW_PASSWORD_REQUIRED' ||
        typeof body.newPassword !== 'string' ||
        !body.newPassword ||
        body.newPassword.length > 256
      )
        return genericFailure();

      const challengeResponses: Record<string, string> = {
        USERNAME: username,
        NEW_PASSWORD: body.newPassword,
      };
      if (body.phone) {
        if (typeof body.phone !== 'string' || !/^\+[1-9]\d{7,14}$/.test(body.phone))
          return json(400, { error: 'Enter a valid international phone number.' });
        challengeResponses['userAttributes.phone_number'] = body.phone;
      }
      const result = await client.send(
        new AdminRespondToAuthChallengeCommand({
          UserPoolId: userPoolId,
          ClientId: clientId,
          ChallengeName: 'NEW_PASSWORD_REQUIRED',
          Session: session,
          ChallengeResponses: challengeResponses,
        }),
      );
      return resultBody(result, username);
    }
    return json(404, { error: 'Authentication route not found.' });
  } catch {
    // Cognito intentionally returns the same response for unknown users and bad passwords.
    // Do not log credentials, email addresses, challenge sessions, or Cognito error detail.
    return genericFailure();
  }
}
