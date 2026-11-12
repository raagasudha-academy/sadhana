import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFinalCascadeDeletionService } from '../finalCascadeDeletionService.mjs';
import { markerId } from '../websiteImportCore.mjs';

Object.assign(process.env, {
  SADHANA_ENTITY_TABLE_SET: 'final',
  SADHANA_ENTITY_FINAL_ACK: 'enabled',
  SADHANA_DATA_MODE: 'final',
  SADHANA_ENTITY_STAGE: 'dev',
});

function fixture() {
  const personId = 'per_00ffdf2357951fa8f0f9c97065bde18f527a55d4855ec8812463121a8759ce64';
  const registrationId = 'SR-2026-EXAMPLE';
  const people = [
    {
      personId,
      version: 1,
      status: 'active',
      institutionIds: ['sruti'],
      personTypes: ['student'],
      studentProfile: { rollNumbers: { sruti: 'SR-010' } },
      familyId: 'fam-example',
      sourceWebsiteRegistrationId: registrationId,
    },
  ];
  const data = {
    people,
    families: [
      { familyId: 'fam-example', version: 1, status: 'active', institutionIds: ['sruti'] },
    ],
    registrations: [
      {
        registrationId: markerId('sruti', registrationId),
        version: 1,
        institutionId: 'sruti',
        source: 'website',
        externalRegistrationId: registrationId,
        importStatus: 'imported',
        familyId: 'fam-example',
        studentIds: [personId],
        sourceStudentIds: { one: personId },
      },
      {
        registrationId,
        version: 2,
        institutionId: 'sruti',
        source: 'sruti-website',
        sadhanaImport: { studentIds: { one: personId } },
      },
    ],
    counters: [],
  };
  const db = {
    async send(cmd) {
      const op = cmd.constructor.name;
      if (op === 'TransactWriteCommand')
        throw Error('No destructive transaction should be attempted');
      const tableName = cmd.input.TableName;
      const entity = tableName.replace(/^dev-sadhana-/, '').replace(/^audit-records$/, 'audit');
      if (op === 'GetCommand')
        return {
          Item: (data[entity] || []).find((row) =>
            Object.entries(cmd.input.Key).every(([key, value]) => row[key] === value),
          ),
        };
      if (op === 'ScanCommand') return { Items: data[entity] || [] };
      if (op === 'PutCommand') {
        (data[entity] ||= []).push(cmd.input.Item);
        return {};
      }
      throw Error(`Unexpected command ${op}`);
    },
  };
  return { db, data, personId };
}

test('imported Sruti student can be previewed when its import marker can be reconciled', async () => {
  const { db, data, personId } = fixture();
  const service = makeFinalCascadeDeletionService({ db, allowExecute: true });
  const args = {
    actor: 'super-admin-1',
    institution: 'sruti',
    type: 'student',
    id: personId,
    expectedVersion: 1,
  };
  const preview = await service.preview(args);
  assert.equal(preview.total, 1);
  assert.deepEqual(preview.counts, [{ label: 'people', count: 1 }]);
  assert.equal(preview.executionBlocked, false);
  assert.equal(preview.executionEnabled, true);
  assert.deepEqual(preview.retained, [
    { label: 'Website registrations retained for reconciliation', count: 2 },
  ]);
  assert.match(preview.notice, /source website registration is retained/i);
  assert.equal(data.registrations.length, 2);
  assert.equal(data.people.length, 1);
});
