/** Canonical venue writes for the final entity tables; never uses the PK/SK router. */
import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { entityTable } from './entityTables.mjs';
import { demandInstitution, httpError, newId, validate, ALLOWED_FIELDS } from './model.ts';
import type { Claims, InstitutionId } from './model.ts';

type DB = { send: (command: any) => Promise<any> };
const object = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const validId = (value: unknown) =>
  typeof value === 'string' && /^[A-Za-z0-9_#.:-]{1,180}$/.test(value);

export function makeFinalVenueWriter(db: DB, now = () => new Date().toISOString()) {
  return async function writeVenue(
    institution: InstitutionId,
    claims: Claims,
    id: string | undefined,
    body: any,
  ) {
    demandInstitution(claims, institution);
    const allowedFields = new Set([
      ...ALLOWED_FIELDS.venues,
      ...(id ? ['expectedVersion'] : []),
    ]);
    if (!object(body) || Object.keys(body).some((key) => !allowedFields.has(key)))
      throw httpError(400, 'Invalid venue details.');
    const timestamp = now();
    const audit = (action: string, resourceId: string) => ({
      auditId: `AUDIT-${randomUUID()}`,
      institutionId: institution,
      action,
      actorCognitoSub: claims.sub,
      resourceType: 'venue',
      resourceId,
      timestamp,
    });

    if (!id) {
      const clean = validate('venues', body);
      const venueId = newId('VENUE');
      const legacyPayload = {
        ...clean,
        id: venueId,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        archived: false,
      };
      const item = {
        venueId,
        institutionId: institution,
        name: clean.name,
        nameSort: clean.name.toLocaleLowerCase('en-GB'),
        status: 'active',
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        legacyPayload,
      };
      await db.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: entityTable('venues'),
                Item: item,
                ConditionExpression: 'attribute_not_exists(venueId)',
              },
            },
            {
              Put: {
                TableName: entityTable('audit'),
                Item: audit('VENUE_CREATED', venueId),
                ConditionExpression: 'attribute_not_exists(auditId)',
              },
            },
          ],
        }),
      );
      return legacyPayload;
    }

    if (!validId(id) || !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 1)
      throw httpError(400, 'Expected venue version required.');
    const { expectedVersion, ...changes } = body;
    const response = await db.send(
      new GetCommand({
        TableName: entityTable('venues'),
        Key: { venueId: id },
        ConsistentRead: true,
      }),
    );
    const previous = response.Item;
    if (!previous) throw httpError(404, 'Venue not found.');
    if (
      previous.institutionId &&
      previous.institutionId !== institution &&
      previous.institutionId !== 'shared' &&
      !previous.institutionIds?.includes(institution)
    )
      throw httpError(403, 'Venue is not available to this institution.');
    if (previous.version !== expectedVersion)
      throw httpError(409, 'Venue changed. Refresh and retry.');
    const prior = [previous.legacyPayload, previous.calendarRecord].find(
      (payload) => object(payload) && payload.id === id,
    );
    if (!prior)
      throw httpError(409, 'Venue requires canonical data reconciliation before editing.');
    const editable = Object.fromEntries(
      ALLOWED_FIELDS.venues.map((field) => [
        field,
        Object.hasOwn(changes, field) ? changes[field] : prior[field],
      ]),
    );
    const clean = validate('venues', editable, { creating: false });
    const nextVersion = expectedVersion + 1;
    const legacyPayload = {
      ...prior,
      ...clean,
      version: nextVersion,
      updatedAt: timestamp,
    };
    const next = {
      ...previous,
      name: clean.name,
      nameSort: clean.name.toLocaleLowerCase('en-GB'),
      location: clean.location,
      address: clean.address,
      postcode: clean.postcode,
      notes: clean.notes,
      version: nextVersion,
      updatedAt: timestamp,
      legacyPayload,
      ...(object(previous.calendarRecord)
        ? {
            calendarRecord: {
              ...previous.calendarRecord,
              id,
              ...clean,
              version: nextVersion,
              updatedAt: timestamp,
            },
          }
        : {}),
    };
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: entityTable('venues'),
              Item: next,
              ConditionExpression: 'attribute_exists(venueId) AND #version=:expected',
              ExpressionAttributeNames: { '#version': 'version' },
              ExpressionAttributeValues: { ':expected': expectedVersion },
            },
          },
          {
            Put: {
              TableName: entityTable('audit'),
              Item: audit('VENUE_UPDATED', id),
              ConditionExpression: 'attribute_not_exists(auditId)',
            },
          },
        ],
      }),
    );
    return legacyPayload;
  };
}

export async function finalVenueRoute(context: any, deps: any, env = process.env) {
  if (env.SADHANA_ENTITY_TABLE_SET !== 'final') return undefined;
  const { parts, method, claims, query = {}, event = {} } = context;
  if (parts?.[0] !== 'venues' || !['POST', 'PATCH'].includes(method)) return undefined;
  if (!claims?.sub)
    return { status: 401, body: { error: 'Authenticated administrator required.' } };
  if (env.SADHANA_DATA_MODE === 'split' || env.SADHANA_ENTITY_FINAL_ACK !== 'enabled')
    return { status: 503, body: { error: 'Canonical tables not acknowledged.' } };
  if (env.SADHANA_FINAL_VENUE_WRITES !== 'enabled')
    return { status: 503, body: { error: 'Final venue writes are disabled.' } };
  const institution = query.institution ?? context.inst;
  if (institution !== 'raaga' && institution !== 'sruti')
    return { status: 400, body: { error: 'Choose a valid institution.' } };
  demandInstitution(claims, institution);
  if (method === 'POST' && parts.length === 1) {
    const record = await deps.write(institution, claims, undefined, deps.parse(event));
    return { status: 201, body: { record } };
  }
  if (method === 'PATCH' && parts.length === 2) {
    const record = await deps.write(institution, claims, parts[1], deps.parse(event));
    return { status: 200, body: { record } };
  }
  return { status: 405, body: { error: 'Unsupported venue action.' } };
}

let singleton: ReturnType<typeof makeFinalVenueWriter> | undefined;
export function finalVenueWriter() {
  if (!singleton)
    singleton = makeFinalVenueWriter(
      DynamoDBDocumentClient.from(
        new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }),
        {
          marshallOptions: { removeUndefinedValues: true },
        },
      ),
    );
  return singleton;
}
