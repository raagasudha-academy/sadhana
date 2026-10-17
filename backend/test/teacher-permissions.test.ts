import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/lambda.ts';
import type { SadhanaRepository } from '../src/repository.ts';

const handler = createHandler({} as SadhanaRepository);

const teacher = {
  displayName: 'Mrs Amruta Hasa',
  institutions: ['sruti'],
  subjects: ['Vedic Chanting'],
  aliases: ['Amruta', 'Amrutha'],
  cognitoSub: '',
  active: true,
};

function call(
  groups: string[],
  method: string,
  path: string,
  body?: object,
  institution = 'sruti'
) {
  return handler({
    pathParameters: { proxy: path },
    requestContext: {
      http: { method },
      authorizer: {
        jwt: {
          claims: {
            sub: 'test-user',
            'cognito:groups': groups,
          },
        },
      },
    },
    queryStringParameters: { institution },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test('viewer cannot register teachers', async () => {
  const result = await call(
    ['sruti-viewer'], 'POST', 'teachers', teacher
  );
  assert.equal(result.statusCode, 403);
});

test('viewer cannot edit teacher profiles', async () => {
  const result = await call(
    ['sruti-viewer'], 'PATCH',
    'teachers/TEACHER-example', teacher
  );
  assert.equal(result.statusCode, 403);
});

test('Raagasudha admin cannot register Sruti teachers', async () => {
  const result = await call(
    ['raagasudha-admin'], 'POST', 'teachers', teacher
  );
  assert.equal(result.statusCode, 403);
});

test('viewer cannot read another institution registry', async () => {
  const result = await call(
    ['raagasudha-viewer'], 'GET', 'teachers',
    undefined, 'sruti'
  );
  assert.equal(result.statusCode, 403);
});

test('teacher registration validates required name', async () => {
  const result = await call(
    ['sruti-admin'], 'POST', 'teachers',
    { ...teacher, displayName: '' }
  );
  assert.equal(result.statusCode, 400);
});
