/** Canonical, fail-closed Super Admin cascade deletion.
 * BOUNDED ONLY. Never deletes a cross-academy person, an unreconciled
 * website-imported identity, a media object, or an unenumerated dependency.
 * Production execution is controlled by the explicit execute switch.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { entityTable, ENTITY_NAMES } from './entityTables.mjs';
import { markerId } from './websiteImportCore.mjs';

const KEYS = {
  people: 'personId',
  families: 'familyId',
  'family-links': 'linkId',
  enrolments: 'enrolmentId',
  attendance: 'attendanceId',
  practice: 'practiceId',
  homework: 'homeworkId',
  submissions: 'submissionId',
  rsvps: 'rsvpId',
  registrations: 'registrationId',
  notifications: 'notificationId',
  counters: 'counterId',
  classes: 'classId',
  sessions: 'sessionId',
  events: 'eventId',
  venues: 'venueId',
  institutions: 'institutionId',
};
const EXCLUDED = new Set([
  'audit',
  'classes',
  'sessions',
  'events',
  'venues',
  'institutions',
  'homework',
]);
const CAP = 10000,
  MAX_ACTIONS = 95,
  PREVIEW_SECONDS = 300;
const issue = (status, message) => Object.assign(new Error(message), { status });
const canonical = (x) => JSON.stringify(sort(x));
function sort(x) {
  if (Array.isArray(x)) return x.map(sort);
  if (x && typeof x === 'object')
    return Object.fromEntries(
      Object.keys(x)
        .sort()
        .map((k) => [k, sort(x[k])]),
    );
  return x;
}
const digest = (x) => createHash('sha256').update(canonical(x)).digest('hex');
const keyOf = (entity, row) => {
  const field = KEYS[entity];
  if (!field || typeof row?.[field] !== 'string' || !row[field])
    throw issue(409, `Unrecognised ${entity} record key; no deletion attempted.`);
  return { [field]: row[field] };
};
const table = (entity) => entityTable(entity);
const includes = (x, id) => Array.isArray(x) && x.includes(id);
const references = (value, ids) => {
  if (typeof value === 'string') return ids.has(value);
  if (Array.isArray(value)) return value.some((x) => references(x, ids));
  if (value && typeof value === 'object')
    return Object.values(value).some((x) => references(x, ids));
  return false;
};
const hasInstitution = (row, inst) =>
  row?.institutionId === inst || includes(row?.institutionIds, inst);
const importedIdentity = (row) =>
  Boolean(
    row?.sourceWebsiteRegistrationId ||
    row?.websiteRegistrationId ||
    row?.importedFromRegistrationId,
  );

function supportedTarget(row, type, inst) {
  if (!row || row.status !== 'active' || !includes(row.institutionIds, inst))
    throw issue(409, 'Target is unavailable or inactive.');
  if (row.institutionIds.length !== 1)
    throw issue(409, 'Cross-academy identities require a separate explicit cascade policy.');
  if (
    type === 'student' &&
    (!includes(row.personTypes, 'student') || !row.studentProfile?.rollNumbers?.[inst])
  )
    throw issue(409, 'Target is not an enrolled student identity in this academy.');
  if (type === 'student' && (row.personTypes || []).some((x) => x !== 'student'))
    throw issue(409, 'Student has a shared guardian/staff identity. Deletion refused.');
  // Imported people may be deleted only when their exact website import marker
  // can be reconciled in the same transaction as the academy records.
}
function dbDefault() {
  return DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
}
export function makeFinalCascadeDeletionService({
  db = dbDefault(),
  now = () => Date.now(),
  allowExecute = process.env.SADHANA_FINAL_CASCADE_EXECUTE === 'enabled',
} = {}) {
  const get = async (entity, id) =>
    (
      await db.send(
        new GetCommand({
          TableName: table(entity),
          Key: { [KEYS[entity]]: id },
          ConsistentRead: true,
        }),
      )
    ).Item;
  async function inventory() {
    const results = {};
    let inspected = 0;
    for (const entity of ENTITY_NAMES) {
      if (entity === 'audit') continue;
      if (!KEYS[entity]) throw issue(503, `Unrecognised canonical table ${entity}.`);
      results[entity] = [];
      let cursor;
      do {
        const page = await db.send(
          new ScanCommand({
            TableName: table(entity),
            ConsistentRead: true,
            ExclusiveStartKey: cursor,
            Limit: 100,
          }),
        );
        results[entity].push(...(page.Items || []));
        inspected += (page.Items || []).length;
        if (inspected > CAP)
          throw issue(409, 'Canonical dataset exceeds audited scan bound; no deletion attempted.');
        cursor = page.LastEvaluatedKey;
      } while (cursor);
    }
    return results;
  }
  async function build(type, id, institution) {
    const root = await get(type === 'student' ? 'people' : 'families', id);
    if (!root) throw issue(404, 'Target record not found.');
    supportedTarget(root, type, institution);
    const all = await inventory();
    const people = type === 'student' ? [root] : all.people.filter((p) => p.familyId === id);
    if (type === 'family') {
      if (!people.length) throw issue(409, 'Empty family requires a separate deletion policy.');
      for (const p of people) {
        if (p.personTypes?.includes('student')) supportedTarget(p, 'student', institution);
        else if (
          p.status !== 'active' ||
          !hasInstitution(p, institution) ||
          p.institutionIds.length !== 1 ||
          (p.personTypes || []).some((x) => !['guardian'].includes(x))
        )
          throw issue(409, 'Family includes a shared or protected identity.');
      }
    }
    if (type === 'student' && root.familyId) {
      const family = await get('families', root.familyId);
      if (!family) throw issue(409, 'Student has an unresolvable family.');
    }
    const memberIds = new Set(people.map((p) => p.personId));
    const familyIds = new Set(type === 'family' ? [id] : []);
    const targets = new Map();
    const retainedRegistrations = new Set();
    const registrationUpdates = [];
    function add(entity, row) {
      const k = keyOf(entity, row);
      targets.set(`${entity}:${JSON.stringify(k)}`, { entity, key: k, row });
    }
    if (type === 'family') add('families', root);
    for (const p of people) add('people', p);
    // Identify student-owned records using canonical explicit foreign keys.
    for (const [entity, records] of Object.entries(all)) {
      if (['people', 'families', 'audit'].includes(entity)) continue;
      for (const row of records) {
        // Preview tokens are workflow metadata, not student dependencies.
        // Token validation and consumption happen separately during execution.
        if (entity === 'counters' && row.recordType === 'CASCADE_PREVIEW') continue;
        const keyed = keyOf(entity, row);
        const directStudent =
          memberIds.has(row.studentId) ||
          memberIds.has(row.personId) ||
          memberIds.has(row.recipientPersonId) ||
          memberIds.has(row.senderPersonId);
        const directFamily = familyIds.has(row.familyId) || familyIds.has(row.guardianFamilyId);
        const nested = references(row, new Set([...memberIds, ...familyIds]));
        if (!directStudent && !directFamily && !nested) continue;
        if (EXCLUDED.has(entity))
          throw issue(
            409,
            `Shared ${entity} references the target; manual dependency review required.`,
          );
        if (entity === 'registrations') {
          // Website registrations are source/history records. Keep them intact, and
          // reconcile a single-student Sadhana marker when deleting an imported child.
          retainedRegistrations.add(row.registrationId);
          if (
            type === 'student' &&
            importedIdentity(root) &&
            row.registrationId === markerId(institution, root.sourceWebsiteRegistrationId) &&
            row.institutionId === institution &&
            row.source === 'website' &&
            row.externalRegistrationId === root.sourceWebsiteRegistrationId &&
            row.importStatus === 'imported' &&
            row.familyId === root.familyId &&
            Number.isSafeInteger(row.version) &&
            Array.isArray(row.studentIds) &&
            row.studentIds.includes(root.personId)
          ) {
            const sourceMappings = Object.entries(row.sourceStudentIds || {}).filter(
              ([, personId]) => personId === root.personId,
            );
            if (
              sourceMappings.length === 1 &&
              !(row.deletedStudentIds || []).some((x) => x?.personId === root.personId)
            ) {
              const [sourcePersonId] = sourceMappings[0];
              const nextSourceStudentIds = { ...row.sourceStudentIds };
              delete nextSourceStudentIds[sourcePersonId];
              registrationUpdates.push({
                entity,
                key: keyOf(entity, row),
                row,
                personId: root.personId,
                sourcePersonId,
                studentIds: row.studentIds.filter((personId) => personId !== root.personId),
                sourceStudentIds: nextSourceStudentIds,
                deletedStudentIds: [
                  ...(Array.isArray(row.deletedStudentIds) ? row.deletedStudentIds : []),
                  {
                    personId: root.personId,
                    sourcePersonId,
                    sourceRegistrationId: root.sourceWebsiteRegistrationId,
                  },
                ],
              });
            }
          }
          if (
            type === 'family' &&
            row.institutionId === institution &&
            row.source === 'website' &&
            row.importStatus === 'imported' &&
            row.familyId === id &&
            Number.isSafeInteger(row.version) &&
            typeof row.externalRegistrationId === 'string' &&
            row.registrationId === markerId(institution, row.externalRegistrationId)
          ) {
            const expectedPeople = people.filter(
              (p) =>
                p.personTypes?.includes('student') &&
                p.sourceWebsiteRegistrationId === row.externalRegistrationId,
            );
            const sourceMappings = Object.entries(row.sourceStudentIds || {});
            const mappedIds = sourceMappings.map(([, personId]) => personId);
            const exactMapping =
              expectedPeople.length > 0 &&
              sourceMappings.length === expectedPeople.length &&
              new Set(mappedIds).size === mappedIds.length &&
              mappedIds.every((personId) => memberIds.has(personId)) &&
              expectedPeople.every((person) => mappedIds.includes(person.personId)) &&
              Array.isArray(row.studentIds) &&
              row.studentIds.length === mappedIds.length &&
              new Set(row.studentIds).size === row.studentIds.length &&
              row.studentIds.every((personId) => mappedIds.includes(personId)) &&
              !sourceMappings.some(([, personId]) =>
                (row.deletedStudentIds || []).some((x) => x?.personId === personId),
              );
            if (exactMapping) {
              registrationUpdates.push({
                entity,
                key: keyOf(entity, row),
                row,
                externalRegistrationId: row.externalRegistrationId,
                studentIds: [],
                sourceStudentIds: {},
                previousStudentIds: row.studentIds,
                previousSourceStudentIds: row.sourceStudentIds,
                familyDeleted: true,
                deletedStudentIds: [
                  ...(Array.isArray(row.deletedStudentIds) ? row.deletedStudentIds : []),
                  ...sourceMappings.map(([sourcePersonId, personId]) => ({
                    personId,
                    sourcePersonId,
                    sourceRegistrationId: row.externalRegistrationId,
                  })),
                ],
              });
            }
          }
          continue;
        }
        if (entity === 'counters') {
          // A single-student cascade must preserve family-owned contact and
          // parent invitation routing records.
          if (
            type === 'student' &&
            ['PARENT_EMAIL_ROUTE', 'CONTACT_GUARD'].includes(row.sequenceType) &&
            row.familyId === root.familyId
          )
            continue;

          // Roll reservations are permanent uniqueness records. Keep them for
          // both student and family cascades so a deleted learner's roll can
          // never be assigned to a different student later.
          if (row.sequenceType === 'ROLL_UNIQUE' && memberIds.has(row.personId)) continue;

          // Account and family contact guards belong to the identities removed by
          // this family cascade. The Cognito account itself is external and remains.
          if (
            type === 'family' &&
            ['COGNITO_SUB_GUARD', 'CONTACT_GUARD', 'PARENT_EMAIL_ROUTE'].includes(row.sequenceType)
          ) {
            add(entity, row);
            continue;
          }

          // A student-specific identity guard can appear in the preview.
          // Execution remains independently release-gated.
          const allowed = [
            'IDENTITY_GUARD',
            'ROLL_UNIQUE',
            'COGNITO_SUB_GUARD',
            'CONTACT_GUARD',
            'PARENT_EMAIL_ROUTE',
            'STUDENT_EMAIL_GUARD',
            'ENROLMENT_PAIR_GUARD',
            'FAMILY_PHONE_GUARD',
          ];

          if (!allowed.includes(row.sequenceType) || (!directStudent && !directFamily))
            throw issue(409, 'Counter reference is not an approved exclusive identity lock.');
        } else if (entity === 'notifications') {
          // Messages are two-party records: deleting both copies can destroy third-party inbox history.
          if (row.recordType === 'direct-message')
            throw issue(
              409,
              'Shared message history requires a separate privacy/retention policy.',
            );
        } else if (entity === 'family-links') {
          if (!memberIds.has(row.studentId) && !memberIds.has(row.guardianPersonId))
            throw issue(409, 'Unresolved family link reference.');
        } else if (!directStudent && !directFamily) {
          throw issue(409, `Nested/indirect reference in ${entity} requires manual review.`);
        }
        if (entity !== 'counters' && !hasInstitution(row, institution))
          throw issue(409, `Cross-academy ${entity} dependency requires independent review.`);
        add(entity, row);
      }
    }
    if (type === 'student') {
      const family = all.families.find((f) => f.familyId === root.familyId);
      // Keep family and guardian as shared identities even if only one child remains.
      if (family && !hasInstitution(family, institution))
        throw issue(409, 'Family institution mismatch.');
    }
    // Fail closed on S3 receipts: deleting DynamoDB metadata alone would strand objects.
    for (const item of targets.values()) {
      const r = item.row;
      if (
        r.s3Key ||
        r.objectKey ||
        r.storageKey ||
        r.mediaKey ||
        r.attachmentIds?.length ||
        r.materialIds?.length
      )
        throw issue(409, 'Media/object storage references need an audited S3 deletion plan.');
    }
    const entries = [...targets.values()].sort(
      (a, b) =>
        a.entity.localeCompare(b.entity) || canonical(a.key).localeCompare(canonical(b.key)),
    );
    const version = (row) => (Number.isSafeInteger(row.version) ? row.version : null);
    const manifest = [
      ...entries.map(({ entity, key, row }) => ({
        operation: 'delete',
        entity,
        key,
        version: version(row),
        hash: digest(row),
      })),
      ...registrationUpdates.map(
        ({
          entity,
          key,
          row,
          studentIds,
          sourceStudentIds,
          previousStudentIds,
          previousSourceStudentIds,
          deletedStudentIds,
          familyDeleted,
          externalRegistrationId,
        }) => ({
          operation: 'reconcile-import-marker',
          entity,
          key,
          version: version(row),
          hash: digest(row),
          studentIds,
          sourceStudentIds,
          previousStudentIds,
          previousSourceStudentIds,
          deletedStudentIds,
          familyDeleted,
          externalRegistrationId,
        }),
      ),
    ].sort(
      (a, b) =>
        a.entity.localeCompare(b.entity) ||
        canonical(a.key).localeCompare(canonical(b.key)) ||
        a.operation.localeCompare(b.operation),
    );
    const imported = people.some(importedIdentity) || (type === 'family' && importedIdentity(root));
    const importedResolved = type === 'student' && imported && registrationUpdates.length === 1;
    const importedSources = new Set(
      [
        ...people.map((p) => p.sourceWebsiteRegistrationId),
        ...(type === 'family' ? [root.sourceWebsiteRegistrationId] : []),
      ].filter(Boolean),
    );
    const familyImportsResolved =
      type === 'family' &&
      imported &&
      importedSources.size > 0 &&
      [...importedSources].every((sourceId) =>
        registrationUpdates.some(
          (update) => update.familyDeleted && update.externalRegistrationId === sourceId,
        ),
      );
    const hasImportedPeople = imported && !(importedResolved || familyImportsResolved);
    return {
      root,
      entries,
      registrationUpdates,
      manifest,
      retainedRegistrations: [...retainedRegistrations].sort(),
      studentCount: people.filter((p) => p.personTypes?.includes('student')).length,
      linkedCognitoAccounts: people.filter(
        (p) => p.personTypes?.includes('guardian') && p.cognitoSub,
      ).length,
      hasImportedPeople,
    };
  }
  // An opaque, high-entropy token identifies a server-side, expiring preview.
  // Never trust client-supplied target lists or counts. Only a digest of the
  // server-derived complete manifest is stored, and execution recomputes it.
  const previewId = (token) => `CASCADE_PREVIEW#${digest(token)}`;
  function validToken(token) {
    if (typeof token !== 'string' || !/^[-_A-Za-z0-9]{43}$/.test(token))
      throw issue(400, 'Invalid deletion preview token.');
  }
  async function loadPreview(token) {
    validToken(token);
    const row = (
      await db.send(
        new GetCommand({
          TableName: table('counters'),
          Key: { counterId: previewId(token) },
          ConsistentRead: true,
        }),
      )
    ).Item;
    if (!row || row.recordType !== 'CASCADE_PREVIEW' || row.state !== 'pending')
      throw issue(409, 'Deletion preview is missing or already used. Refresh it.');
    if (!Number.isSafeInteger(row.expiresAt) || row.expiresAt < now())
      throw issue(409, 'Deletion preview expired. Refresh it.');
    return row;
  }
  async function plan({ actor, institution, type, id, expectedVersion }) {
    const result = await build(type, id, institution);
    if (result.root.version !== expectedVersion)
      throw issue(409, 'Target version has changed. Refresh the record.');
    return result;
  }
  return {
    async preview(args) {
      const { actor, institution, type, id, expectedVersion } = args;
      const current = await plan(args);
      const counts = [];
      for (const entity of new Set(current.entries.map((x) => x.entity))) {
        counts.push({
          label: entity,
          count: current.entries.filter((x) => x.entity === entity).length,
        });
      }
      const total = current.entries.length;
      if (total + current.registrationUpdates.length > MAX_ACTIONS)
        throw issue(
          409,
          'Cascade exceeds single-transaction limit; requires durable resumable job support.',
        );
      const signature = randomBytes(32).toString('base64url');
      const record = {
        counterId: previewId(signature),
        recordType: 'CASCADE_PREVIEW',
        state: 'pending',
        actorCognitoSub: actor,
        institutionId: institution,
        targetType: type,
        targetId: id,
        expectedVersion,
        manifestDigest: digest(current.manifest),
        expiresAt: now() + PREVIEW_SECONDS * 1000,
        // DynamoDB TTL is in seconds; the timestamp check above is authoritative.
        ttl: Math.ceil((now() + PREVIEW_SECONDS * 1000) / 1000),
      };
      await db.send(
        new PutCommand({
          TableName: table('counters'),
          Item: record,
          ConditionExpression: 'attribute_not_exists(counterId)',
        }),
      );
      return {
        targetType: type,
        targetId: id,
        expectedVersion,
        signature,
        counts,
        total,
        studentCount: current.studentCount,
        retained: [
          ...(current.retainedRegistrations.length
            ? [
                {
                  label: 'Website registrations retained for reconciliation',
                  count: current.retainedRegistrations.length,
                },
              ]
            : []),
          ...(current.linkedCognitoAccounts
            ? [
                {
                  label: 'Cognito login accounts retained; family access removed',
                  count: current.linkedCognitoAccounts,
                },
              ]
            : []),
        ],
        executionEnabled: allowExecute && !current.hasImportedPeople,
        executionBlocked: current.hasImportedPeople,
        executionReason: !allowExecute
          ? 'Permanent deletion is disabled by the deployment setting.'
          : current.hasImportedPeople
            ? 'Imported identity provenance is missing or ambiguous; no data has been deleted.'
            : undefined,
        notice: current.hasImportedPeople
          ? 'Preview only: imported identity provenance is missing or ambiguous; no deletion is allowed.'
          : current.registrationUpdates.length
            ? 'The source website registration is retained; its Sadhana import mapping will be updated to record this removal.'
            : undefined,
      };
    },
    async execute(args) {
      if (!allowExecute)
        throw issue(503, 'Cascade execution is disabled by the deployment setting.');
      const { actor, institution, type, id, expectedVersion, signature } = args;
      const signed = await loadPreview(signature);
      if (
        signed.actorCognitoSub !== actor ||
        signed.institutionId !== institution ||
        signed.targetType !== type ||
        signed.targetId !== id ||
        signed.expectedVersion !== expectedVersion
      )
        throw issue(403, 'Preview does not match this request.');
      const current = await plan(args);
      if (current.hasImportedPeople)
        throw issue(
          409,
          'Imported identity deletion requires verified website import-marker and registration reconciliation; no records were deleted.',
        );
      if (digest(current.manifest) !== signed.manifestDigest)
        throw issue(409, 'Linked records changed since preview; refresh the preview.');
      if (current.entries.length + current.registrationUpdates.length > MAX_ACTIONS)
        throw issue(409, 'Cascade is too large for atomic execution.');
      const timestamp = new Date(now()).toISOString();
      const audit = {
        auditId: `aud_${randomUUID()}`,
        institutionId: institution,
        actorCognitoSub: actor,
        action: 'SUPER_ADMIN_CASCADE_DELETE',
        resourceType: type,
        resourceId: id,
        deletedCounts: Object.fromEntries(
          [...new Set(current.entries.map((x) => x.entity))].map((e) => [
            e,
            current.entries.filter((x) => x.entity === e).length,
          ]),
        ),
        reconciledRegistrationMarkers: current.registrationUpdates.length,
        timestamp,
        schemaVersion: 1,
        result: 'success',
      };
      const deletes = current.entries.map(({ entity, key, row }) => {
        const idField = KEYS[entity];
        const condition = ['attribute_exists(#id)'];
        const names = { '#id': idField };
        const values = {};
        if (Number.isSafeInteger(row.version)) {
          condition.push('#v=:v');
          names['#v'] = 'version';
          values[':v'] = row.version;
        }
        // Record existence + version only is insufficient for unversioned records;
        // preserve the full snapshot with field equality checks where possible.
        else {
          throw issue(409, `Unversioned ${entity} dependency cannot be conditionally deleted.`);
        }
        return {
          Delete: {
            TableName: table(entity),
            Key: key,
            ConditionExpression: condition.join(' AND '),
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: values,
          },
        };
      });
      const reconciliations = current.registrationUpdates.map(
        ({
          entity,
          key,
          row,
          personId,
          studentIds,
          sourceStudentIds,
          previousStudentIds,
          previousSourceStudentIds,
          deletedStudentIds,
          familyDeleted,
        }) => ({
          Update: {
            TableName: table(entity),
            Key: key,
            UpdateExpression:
              'SET studentIds=:students, sourceStudentIds=:sources, deletedStudentIds=:deleted, #version=:next, updatedAt=:now' +
              (familyDeleted
                ? ', familyDeletedAt=:now, familyDeletedBy=:actor, familyDeleted=:yes'
                : ''),
            ConditionExpression:
              '#version=:version AND institutionId=:institution AND externalRegistrationId=:external AND familyId=:family AND importStatus=:imported' +
              (familyDeleted
                ? ' AND studentIds=:previousStudents AND sourceStudentIds=:previousSources'
                : ' AND contains(studentIds,:personId)'),
            ExpressionAttributeNames: { '#version': 'version' },
            ExpressionAttributeValues: {
              ':students': studentIds,
              ':sources': sourceStudentIds,
              ':deleted': deletedStudentIds.map((entry) =>
                entry.deletedAt ? entry : { ...entry, deletedAt: timestamp, deletedBy: actor },
              ),
              ':next': row.version + 1,
              ':version': row.version,
              ':now': timestamp,
              ':institution': institution,
              ':external': row.externalRegistrationId,
              ':family': row.familyId,
              ':imported': 'imported',
              ...(familyDeleted
                ? {
                    ':previousStudents': previousStudentIds,
                    ':previousSources': previousSourceStudentIds,
                    ':actor': actor,
                    ':yes': true,
                  }
                : { ':personId': personId }),
            },
          },
        }),
      );
      // Consume the preview in the same atomic transaction. A replay or an
      // expired preview must never succeed, even after concurrent requests.
      const consume = {
        Delete: {
          TableName: table('counters'),
          Key: { counterId: signed.counterId },
          ConditionExpression:
            '#state=:pending AND #expires=:expires AND #digest=:digest AND #actor=:actor',
          ExpressionAttributeNames: {
            '#state': 'state',
            '#expires': 'expiresAt',
            '#digest': 'manifestDigest',
            '#actor': 'actorCognitoSub',
          },
          ExpressionAttributeValues: {
            ':pending': 'pending',
            ':expires': signed.expiresAt,
            ':digest': signed.manifestDigest,
            ':actor': actor,
          },
        },
      };
      try {
        await db.send(
          new TransactWriteCommand({
            TransactItems: [
              ...deletes,
              ...reconciliations,
              consume,
              {
                Put: {
                  TableName: table('audit'),
                  Item: audit,
                  ConditionExpression: 'attribute_not_exists(auditId)',
                },
              },
            ],
          }),
        );
      } catch (e) {
        if (e?.name === 'TransactionCanceledException')
          throw issue(409, 'Concurrent record change. Nothing was deleted. Refresh the preview.');
        throw e;
      }
      return { deleted: true };
    },
  };
}
