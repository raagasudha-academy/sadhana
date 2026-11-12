import { entityTable } from './entityTables.mjs';
/** Admin-only M9 directory shadow reader; leaves legacy API responses unchanged. */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { demandInstitution, httpError } from './model.ts';
import type { Claims, InstitutionId } from './model.ts';
import { projectM10Directory } from './coreDirectoryProjection.mjs';
export type M10CoreEntity = 'students' | 'families' | 'enrolments';
export type M10Client = { send: (cmd: any) => Promise<any> };
export type M10FamilyContact = {
  familyId: string;
  parentName: string;
  email: string;
  phone: string;
  location: string;
  address: Record<string, unknown>;
};
const physical: Record<M10CoreEntity, string> = {
  students: 'people',
  families: 'families',
  enrolments: 'enrolments',
};
const maxRows: Record<M10CoreEntity, number> = { students: 1500, families: 1000, enrolments: 3000 };
export function makeM10CoreDirectoryReader(client: M10Client) {
  return {
    async familyContact(
      familyId: string,
      inst: InstitutionId,
      claims: Claims,
    ): Promise<M10FamilyContact> {
      demandInstitution(claims, inst);
      if (!/^[A-Za-z0-9_-]{4,150}$/.test(familyId))
        throw httpError(400, 'Invalid family identifier.');
      const family = (
        await client.send(
          new GetCommand({
            TableName: entityTable('families'),
            Key: { familyId },
            ConsistentRead: true,
          }),
        )
      ).Item;
      if (
        !family ||
        family.familyId !== familyId ||
        family.status !== 'active' ||
        !family.institutionIds?.includes(inst) ||
        !family.primaryContactPersonId
      )
        throw httpError(404, 'Family contact details not found.');
      const contact = (
        await client.send(
          new GetCommand({
            TableName: entityTable('people'),
            Key: { personId: family.primaryContactPersonId },
            ConsistentRead: true,
          }),
        )
      ).Item;
      if (
        !contact ||
        contact.personId !== family.primaryContactPersonId ||
        contact.familyId !== familyId ||
        contact.status !== 'active' ||
        !contact.institutionIds?.includes(inst) ||
        !contact.personTypes?.includes('guardian')
      )
        throw httpError(409, 'Family contact identity requires review.');
      const parentName =
        [contact.firstName, contact.middleName, contact.lastName]
          .filter((x) => typeof x === 'string' && x)
          .join(' ')
          .trim() ||
        contact.displayName ||
        '';
      const rawAddress = family.address || contact.address || {};
      const address = Object.fromEntries(
        ['line1', 'line2', 'city', 'town', 'county', 'postcode', 'country'].flatMap((k) =>
          typeof rawAddress?.[k] === 'string' && rawAddress[k].trim()
            ? [[k, rawAddress[k].trim()]]
            : [],
        ),
      );
      return {
        familyId,
        parentName,
        email: String(contact.email || family.email || ''),
        phone: String(contact.phone || family.phone || ''),
        location: String(
          family.location ||
            family.preferredLocationId ||
            contact.location ||
            contact.preferredLocationId ||
            '',
        ),
        address,
      };
    },
    async list(entity: M10CoreEntity, inst: InstitutionId, claims: Claims) {
      demandInstitution(claims, inst);
      const records: any[] = [];
      let cursor: Record<string, unknown> | undefined;
      do {
        const response = await client.send(
          new ScanCommand({
            TableName: entityTable(physical[entity]),
            ConsistentRead: true,
            Limit: 200,
            ExclusiveStartKey: cursor,
          }),
        );
        records.push(...(response.Items || []));
        cursor = response.LastEvaluatedKey;
        if (records.length > maxRows[entity]) throw Error('M10_CORE_DIRECTORY_ROW_LIMIT');
      } while (cursor);
      const contacts: any[] = [];
      if (entity === 'families') {
        let contactCursor: Record<string, unknown> | undefined;
        do {
          const result = await client.send(
            new ScanCommand({
              TableName: entityTable('people'),
              ConsistentRead: true,
              Limit: 200,
              ExclusiveStartKey: contactCursor,
            }),
          );
          contacts.push(...(result.Items || []));
          contactCursor = result.LastEvaluatedKey;
          if (contacts.length > 1500) throw Error('M10_CORE_CONTACT_ROW_LIMIT');
        } while (contactCursor);
      }
      return projectM10Directory(entity, records, inst, contacts) as {
        records: Record<string, any>[];
        more: false;
      };
    },
  };
}
export type M10CoreDirectoryReader = ReturnType<typeof makeM10CoreDirectoryReader>;
export function defaultM10CoreDirectoryReader(): M10CoreDirectoryReader {
  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }),
    { marshallOptions: { removeUndefinedValues: true } },
  );
  return makeM10CoreDirectoryReader(client);
}
