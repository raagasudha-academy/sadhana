/** Real AWS M9 core-write integration test. Preflight only unless --apply is supplied. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { execFileSync } from 'node:child_process';
import { makeM10CoreWriteService } from '../src/coreWriteService.ts';

const REGION = 'us-east-1';
const ACCOUNT = '627821644317';
const prefix = 'sadhana-dev-m9-';
const apply = process.argv.includes('--apply');
const confirm = process.env.M10_E2E_CONFIRM;
const inst = 'raaga' as const;
const other = 'sruti' as const;
const admin = { sub: 'M10-E2E-SYNTHETIC-ADMIN', 'cognito:groups': 'raagasudha-admin' };
const base = new DynamoDBClient({ region: REGION });
const db = DynamoDBDocumentClient.from(base, { marshallOptions: { removeUndefinedValues: true } });
const svc = makeM10CoreWriteService(db);
const get = async (domain: string, key: string, value: string) =>
  (
    await db.send(
      new GetCommand({ TableName: prefix + domain, Key: { [key]: value }, ConsistentRead: true }),
    )
  ).Item;
const requireRejection = async (p: Promise<unknown>, label: string) => {
  let rejected = false;
  try {
    await p;
  } catch (e: any) {
    rejected = true;
    assert.ok(
      [400, 401, 403, 404, 409].includes(e?.status),
      `${label}: unexpected error ${e?.message}`,
    );
  }
  assert.ok(rejected, `${label}: request unexpectedly succeeded`);
  console.log('PASS:', label);
};

async function main() {
  const identity = JSON.parse(
    execFileSync('aws', ['sts', 'get-caller-identity', '--region', REGION, '--output', 'json'], {
      encoding: 'utf8',
    }),
  );
  assert.equal(identity.Account, ACCOUNT, 'Incorrect AWS account');
  console.log('AWS account:', identity.Account);
  for (const domain of [
    'families',
    'people',
    'family-links',
    'classes',
    'enrolments',
    'counters',
    'audit',
  ]) {
    const described = await base.send(new DescribeTableCommand({ TableName: prefix + domain }));
    assert.equal(described.Table?.TableStatus, 'ACTIVE', `${domain} table not active`);
    console.log('ACTIVE:', prefix + domain);
  }
  for (const name of ['FAMILY_NUMBER', 'STUDENT_ROLL']) {
    const item = await get('counters', 'counterId', `${inst}#${name}`);
    if (item)
      assert.ok(
        Number.isSafeInteger(item.lastAllocated) && item.lastAllocated >= 0,
        `${name} invalid`,
      );
    console.log('COUNTER:', name, item?.lastAllocated ?? 0);
  }
  const classes: any[] = [];
  let start: any;
  do {
    const page = await db.send(
      new QueryCommand({
        TableName: prefix + 'classes',
        IndexName: 'InstitutionClassesIndex',
        KeyConditionExpression: '#inst=:inst',
        ExpressionAttributeNames: { '#inst': 'institutionId' },
        ExpressionAttributeValues: { ':inst': inst },
        ExclusiveStartKey: start,
        Limit: 50,
      }),
    );
    classes.push(...(page.Items ?? []));
    start = page.LastEvaluatedKey;
  } while (start && classes.length < 300);
  const cls = classes.find(
    (c) =>
      c.classId && c.institutionId === inst && c.status !== 'archived' && c.status !== 'inactive',
  );
  assert.ok(cls, 'No active Raagasudha class found. Do not create E2E family without a class.');
  console.log('CLASS:', cls.classId, 'status:', cls.status ?? 'unset');
  console.log('PREFLIGHT PASSED. M9 table dependencies, counters and target class checked.');
  if (!apply) {
    console.log(
      'READ-ONLY: no records created. To test writes run with --apply and M10_E2E_CONFIRM=WRITE_SYNTHETIC_M9_DEV_DATA.',
    );
    return;
  }
  assert.equal(confirm, 'WRITE_SYNTHETIC_M9_DEV_DATA', 'Explicit E2E opt-in missing');
  const unique = randomUUID().replaceAll('-', '');
  // E.164 synthetic-only prefix. Never use actual user contact details in tests.
  // Test phone is not used to call or message anyone.
  const digits = String(BigInt('0x' + unique.slice(0, 12)) % 1000000000n).padStart(9, '0');
  const phone = '+447000' + digits;
  const mark = `M10 E2E ${unique.slice(0, 8)}`;
  const recordPath = '/tmp/sadhana-m10-core-aws-e2e-results.json';
  const fs = await import('node:fs');
  const write = (data: any) =>
    fs.writeFileSync(recordPath, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  const result: any = {
    account: ACCOUNT,
    region: REGION,
    inst,
    synthetic: true,
    createdAt: new Date().toISOString(),
    status: 'started',
    classId: cls.classId,
    phone,
    results: [],
  };
  write(result);
  try {
    const f = await svc.create('families', inst, admin, {
      parentName: mark + ' Guardian',
      phone,
      createdIn: inst,
    });
    result.familyId = f.id;
    result.familyNumber = f.familyNumber;
    write(result);
    const family = await get('families', 'familyId', f.id);
    assert.equal(family?.familyNumber, f.familyNumber);
    assert.ok(family?.primaryContactPersonId);
    const contact = await get('people', 'personId', family.primaryContactPersonId);
    assert.equal(contact?.familyId, f.id);
    console.log('PASS: family + contact + allocated family number');
    await requireRejection(
      svc.create('families', inst, admin, {
        parentName: mark + ' Duplicate',
        phone,
        createdIn: inst,
      }),
      'duplicate phone guard',
    );
    await requireRejection(
      svc.create('families', other, admin, {
        parentName: mark + ' Wrong Institution',
        phone,
        createdIn: inst,
      }),
      'family institution mismatch',
    );
    const s = await svc.create('students', inst, admin, {
      name: mark + ' Student',
      phone: '',
      familyId: f.id,
      registrationType: 'family',
      createdIn: inst,
    });
    result.studentId = s.id;
    result.rollNumber = s.rollNumber;
    write(result);
    const student = await get('people', 'personId', s.id);
    assert.equal(student?.familyId, f.id);
    assert.equal(student?.studentProfile?.rollNumbers?.raaga, s.rollNumber);
    const guardianId = family.primaryContactPersonId;
    const { guardianLinkId } = await import('../src/websiteImportCore.mjs');
    const link = await get('family-links', 'linkId', guardianLinkId(inst, guardianId, s.id));
    assert.equal(link?.accessStatus, 'pending');
    assert.equal(link?.relationshipVerified, false);
    console.log('PASS: student + roll number + pending guardian link (no approval)');
    await requireRejection(
      svc.create('students', other, admin, {
        name: mark + ' Wrong Student',
        phone: '',
        familyId: f.id,
        registrationType: 'family',
        createdIn: other,
      }),
      'cross-institution family denied',
    );
    const date = new Date().toISOString().slice(0, 10);
    const e = await svc.create('enrolments', inst, admin, {
      institution: inst,
      studentId: s.id,
      classId: cls.classId,
      startDate: date,
      endDate: '',
    });
    result.enrolmentId = e.id;
    write(result);
    const enrol = await get('enrolments', 'enrolmentId', e.id);
    assert.equal(enrol?.studentId, s.id);
    assert.equal(enrol?.classId, cls.classId);
    console.log('PASS: enrolment created, student/class relationship verified');
    await requireRejection(
      svc.create('enrolments', inst, admin, {
        institution: inst,
        studentId: s.id,
        classId: cls.classId,
        startDate: date,
        endDate: '',
      }),
      'duplicate enrolment denied',
    );
    await requireRejection(
      svc.create('enrolments', other, admin, {
        institution: other,
        studentId: s.id,
        classId: cls.classId,
        startDate: date,
        endDate: '',
      }),
      'cross-institution enrolment denied',
    );
    result.status = 'PASS';
    write(result);
    console.log('RESULT: ALL CORE WRITE AWS CHECKS PASSED');
  } catch (e: any) {
    result.status = 'FAILED';
    result.error = String(e?.message ?? e);
    write(result);
    throw e;
  } finally {
    console.log('Test record IDs:', recordPath);
    console.log(
      'Synthetic records remain for inspection; do not reset counters or bulk-delete records.',
    );
  }
}
main().catch((e) => {
  console.error('STOP:', e?.name ?? 'Error', e?.message ?? e);
  process.exitCode = 1;
});
