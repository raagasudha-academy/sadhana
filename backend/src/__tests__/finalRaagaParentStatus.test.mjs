import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCodeWhitespace } from '../../scripts/sourceText.mjs';
import { markerId } from '../websiteImportCore.mjs';
import { finalRaagaParentStatusProjection } from '../finalRaagaParentStatus.mjs';
import { finalRaagaIntakeRoute } from '../finalRaagaIntake.mjs';
import { finalRegistrationRoute } from '../finalRegistration.mjs';

const readNormalizedSource = (...args) => normalizeCodeWhitespace(readFileSync(...args));

const external = 'RS-2026-726C9A';
const registration = {
  registrationId: markerId('raaga', external),
  institutionId: 'raaga',
  source: 'website',
  externalRegistrationId: external,
  importStatus: 'imported',
  familyId: 'fam_abc',
  studentIds: ['per_student'],
  provisioningStatus: 'EXISTING_ACCOUNT_LINKED',
  identityResolutionStatus: 'pending_guardian_verification',
  websiteSyncStatus: 'legacy-authoritative',
};
const enabled = {
  SADHANA_ENTITY_TABLE_SET: 'final',
  SADHANA_ENTITY_FINAL_ACK: 'enabled',
  SADHANA_DATA_MODE: 'final',
  SADHANA_FINAL_RAAGA_PARENT_STATUS_READS: 'enabled',
};
const ctx = {
  parts: ['website-registrations', external, 'access-status'],
  method: 'GET',
  query: {},
  inst: undefined,
  claims: { sub: 'verified-admin' },
  event: { body: '' },
};
const deps = () => {
  const calls = [];
  return {
    calls,
    reader: {
      assertConfigured: () => calls.push('config'),
      parentStatus: async (id) => (
        calls.push(['status', id]),
        finalRaagaParentStatusProjection(id, registration)
      ),
    },
  };
};

test('canonical existing-account link displays ACCOUNT_FOUND, never ACTIVE or guardian approval', () => {
  assert.deepEqual(finalRaagaParentStatusProjection(external, registration), {
    registrationId: external,
    imported: true,
    status: 'ACCOUNT_FOUND',
    updatedAt: null,
  });
  assert.equal(
    finalRaagaParentStatusProjection(external, { ...registration, provisioningStatus: 'ACTIVE' })
      .status,
    'ACCOUNT_FOUND',
  );
  assert.equal(
    finalRaagaParentStatusProjection(external, {
      ...registration,
      provisioningStatus: 'EXISTING_ACCOUNT_REVIEW_REQUIRED',
    }).status,
    'NEEDS_VERIFICATION',
  );
  assert.equal(
    finalRaagaParentStatusProjection(external, {
      ...registration,
      provisioningStatus: 'NOT_INVITED',
    }).status,
    'NOT_INVITED',
  );
  assert.equal(
    finalRaagaParentStatusProjection(external, {
      ...registration,
      provisioningStatus: 'UNEXPECTED',
    }).status,
    'NEEDS_VERIFICATION',
  );
  assert.equal(
    finalRaagaParentStatusProjection(external, { ...registration, provisioningStatus: 'toString' })
      .status,
    'NEEDS_VERIFICATION',
  );
});
test('status projector rejects missing marker, crossed academy, wrong reference and incomplete import', () => {
  assert.throws(() => finalRaagaParentStatusProjection(external, null), { status: 404 });
  assert.throws(
    () => finalRaagaParentStatusProjection(external, { ...registration, institutionId: 'sruti' }),
    { status: 409 },
  );
  assert.throws(
    () =>
      finalRaagaParentStatusProjection(external, {
        ...registration,
        externalRegistrationId: 'RS-OTHER',
      }),
    { status: 409 },
  );
  assert.throws(
    () => finalRaagaParentStatusProjection(external, { ...registration, studentIds: [] }),
    { status: 409 },
  );
  assert.throws(
    () => finalRaagaParentStatusProjection(external, { ...registration, importStatus: 'pending' }),
    { status: 409 },
  );
  assert.throws(() => finalRaagaParentStatusProjection('malformed!', registration), {
    status: 400,
  });
});
test('final Raaga parent-status route uses canonical reader only under independent opt-in', async () => {
  const { calls, reader } = deps();
  let res = await finalRaagaIntakeRoute(ctx, reader, enabled);
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ACCOUNT_FOUND');
  assert.deepEqual(calls, ['config', ['status', external]]);
  for (const env of [
    { ...enabled, SADHANA_FINAL_RAAGA_PARENT_STATUS_READS: '' },
    { ...enabled, SADHANA_DATA_MODE: 'split' },
    { ...enabled, SADHANA_ENTITY_FINAL_ACK: '' },
  ]) {
    const t = deps();
    res = await finalRaagaIntakeRoute(ctx, t.reader, env);
    assert.equal(res.status, 503);
    assert.deepEqual(t.calls, []);
  }
  const t = deps();
  res = await finalRaagaIntakeRoute({ ...ctx, claims: null }, t.reader, enabled);
  assert.equal(res.status, 401);
  assert.deepEqual(t.calls, []);
});
test('existing Raaga client without institution query is still staff-checked', async () => {
  const { calls, reader } = deps();
  const depsReg = {
    assertConfigured: reader.assertConfigured,
    registration: async () => {
      throw Error('Sruti handler reached');
    },
    raaga: (context) => finalRaagaIntakeRoute(context, reader, enabled),
  };
  const access = {
    admin: (who, inst) => {
      calls.push(['admin', inst]);
      if (!who?.raagaAllowed)
        throw Object.assign(new Error('No Raaga permission'), { status: 403 });
    },
  };
  const success = await finalRegistrationRoute(
    { ...ctx, claims: { sub: 'admin', raagaAllowed: true } },
    depsReg,
    access,
    enabled,
  );
  assert.equal(success.status, 200);
  assert.deepEqual(calls, [['admin', 'raaga'], 'config', ['status', external]]);
  await assert.rejects(() => finalRegistrationRoute(ctx, depsReg, access, enabled), {
    status: 403,
  });
  await assert.rejects(
    () =>
      finalRegistrationRoute({ ...ctx, query: { institution: 'sruti' } }, depsReg, access, enabled),
    { status: 403 },
  );
  const invalid = await finalRegistrationRoute(
    { ...ctx, query: { institution: 'unknown' } },
    depsReg,
    access,
    enabled,
  );
  assert.equal(invalid.status, 400);
});
test('parent invitation and provisioning commands require independent canonical action opt-in', async () => {
  const { calls, reader } = deps();
  for (const name of ['provision-parent', 'queue-parent-links', 'resend-parent-invitation']) {
    const res = await finalRaagaIntakeRoute(
      { ...ctx, method: 'POST', parts: ['website-registrations', external, name] },
      reader,
      enabled,
    );
    assert.equal(res.status, 503);
    assert.deepEqual(calls, []);
  }
});
test('Lambda exposes read-only status service before final-only fence; no legacy parent markers', () => {
  const lambda = readNormalizedSource(new URL('../lambda.ts', import.meta.url), 'utf8');
  const service = readNormalizedSource(
    new URL('../finalRaagaParentStatus.ts', import.meta.url),
    'utf8',
  );
  assert.match(lambda, /parentStatus:finalRaagaParentStatus/);
  assert.ok(
    lambda.indexOf('parentStatus:finalRaagaParentStatus') <
      lambda.indexOf("finalOnlyGate(parts,method,'fallback')"),
  );
  assert.match(service, /ConsistentRead:true/);
  assert.match(service, /entityTable\('registrations'\)/);
  assert.doesNotMatch(
    service,
    /sadhana-dev-main|OPS#GLOBAL|UpdateCommand|PutCommand|TransactWriteCommand/,
  );
});
