import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRouteParts } from '../src/apiRoute.ts';

test('HTTP API execute-api stage prefix resolves staff route', () => {
  assert.deepEqual(apiRouteParts({rawPath:'/dev/api/me',requestContext:{stage:'dev'}}),['me']);
});

test('API without stage resolves staff route', () => {
  assert.deepEqual(apiRouteParts({rawPath:'/api/me',requestContext:{stage:'dev'}}),['me']);
});

test('greedy route parameter takes precedence over rawPath', () => {
  assert.deepEqual(apiRouteParts({rawPath:'/dev/api/me',pathParameters:{proxy:'me'}}),['me']);
});

test('fallback supports stage prefix when stage metadata is absent', () => {
  assert.deepEqual(apiRouteParts({rawPath:'/dev/api/classes'}),['classes']);
});

test('nested resource endpoints and unknown paths behave correctly', () => {
  assert.deepEqual(apiRouteParts({rawPath:'/dev/api/practice/STU-1/2026-10-15',requestContext:{stage:'dev'}}),['practice','STU-1','2026-10-15']);
  assert.deepEqual(apiRouteParts({rawPath:'/some-other-path'}),[]);
});
