import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../lambda.ts';

test('final Lambda blocks exact legacy onboarding writes before repository access', async () => {
  const keys = [
    'SADHANA_ENTITY_TABLE_SET',
    'M95_ONBOARDING_MODE',
    'M91_SRUTI_REVIEW_WRITES',
    'M10_REGISTRATION_M9_READS',
    'M95_COMPAT_MODE',
    'M10_CORE_FRONTEND_WRITES',
    'M9_TARGET_REPOSITORY_WRITES',
  ] as const;
  const prior = keys.map((k) => process.env[k]);
  const calls: string[] = [];
  try {
    process.env.SADHANA_ENTITY_TABLE_SET = 'final';
    process.env.M95_ONBOARDING_MODE = 'enabled';
    process.env.M91_SRUTI_REVIEW_WRITES = 'enabled';
    process.env.M10_REGISTRATION_M9_READS = 'enabled';
    process.env.M95_COMPAT_MODE = 'pilot';
    process.env.M10_CORE_FRONTEND_WRITES = 'enabled';
    process.env.M9_TARGET_REPOSITORY_WRITES = 'enabled';
    const handler = createHandler({
      list: async (...args: any[]) => {
        calls.push(String(args[0]));
        return { records: [], more: false };
      },
    } as any);
    for (const [method, path, institution] of [
      ['GET', 'm9-onboarding/status', 'raaga'],
      ['GET', 'm9-onboarding/registrations', 'raaga'],
      ['GET', 'm9-onboarding/sruti-intake/SR-2026-ABC', 'sruti'],
      ['PATCH', 'm9-onboarding/sruti-intake/SR-2026-ABC/review', 'sruti'],
      ['POST', 'm9-onboarding/legacy-bridge/REG-1/preview', 'raaga'],
      ['POST', 'm9-onboarding/legacy-bridge/REG-1/execute', 'raaga'],
      ['POST', 'm9-onboarding/website-import/REG-1/preview', 'raaga'],
      ['POST', 'm9-onboarding/website-import/REG-1/execute', 'raaga'],
      ['POST', 'm9-onboarding/website-import/REG-1/sync-preview', 'raaga'],
      ['POST', 'm9-onboarding/website-import/REG-1/sync', 'raaga'],
      ['POST', 'm9-onboarding/verified-account/REG-1/preview', 'raaga'],
      ['POST', 'm9-onboarding/verified-account/REG-1/link', 'raaga'],
      ['POST', 'm9-onboarding/guardian/request', 'raaga'],
      ['POST', 'm9-onboarding/guardian/decision', 'raaga'],
    ]) {
      const result = await handler({
        pathParameters: { proxy: path },
        requestContext: {
          http: { method },
          authorizer: {
            jwt: { claims: { sub: 'admin-sub', 'cognito:groups': ['raagasudha-admin'] } },
          },
        },
        queryStringParameters: { institution },
        body: '{}',
      } as any);
      assert.equal(result.statusCode, 503, path);
      assert.match(result.body, /legacy database fallback blocked/, path);
    }
    assert.deepEqual(calls, []);
  } finally {
    keys.forEach((k, i) =>
      prior[i] === undefined ? delete process.env[k] : (process.env[k] = prior[i]),
    );
  }
});
