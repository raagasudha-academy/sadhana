#!/usr/bin/env node
/** Generate isolated, retained production DynamoDB resources. No AWS calls. */
import { chmodSync, writeFileSync } from 'node:fs';
import { M9_SCHEMA, validateSchema } from './schema.mjs';

const prodName = (tableName) => {
  const suffix = tableName.replace(/^sadhana-dev-/, '');
  if (suffix === tableName) throw Error(`Unexpected schema table name: ${tableName}`);
  return `sadhana-prod-${suffix === 'audit' ? 'audit-records' : suffix}`;
};
const logicalId = (name) =>
  name
    .replace(/[^A-Za-z0-9]/g, ' ')
    .trim()
    .split(/\s+/)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');
const key = (AttributeName, KeyType) => ({ AttributeName, KeyType });

export function makeProductionEntityTablesTemplate() {
  const errors = validateSchema();
  if (errors.length) throw Error(errors.join('; '));
  const Resources = {};
  for (const schema of M9_SCHEMA) {
    const TableName = prodName(schema.tableName);
    const indexes = schema.indexes.map((index) => ({
      IndexName: index.name,
      KeySchema: [
        key(index.partitionKey, 'HASH'),
        ...(index.sortKey ? [key(index.sortKey, 'RANGE')] : []),
      ],
      Projection: { ProjectionType: 'ALL' },
    }));
    const attributes = new Set([
      schema.partitionKey,
      ...schema.indexes.flatMap((index) => [index.partitionKey, index.sortKey].filter(Boolean)),
    ]);
    Resources[logicalId(TableName)] = {
      Type: 'AWS::DynamoDB::Table',
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
      Properties: {
        TableName,
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [...attributes].map((AttributeName) => ({
          AttributeName,
          AttributeType: 'S',
        })),
        KeySchema: [key(schema.partitionKey, 'HASH')],
        ...(indexes.length ? { GlobalSecondaryIndexes: indexes } : {}),
        PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
        SSESpecification: { SSEEnabled: true },
        DeletionProtectionEnabled: true,
        Tags: [
          { Key: 'Project', Value: 'Sadhana' },
          { Key: 'Environment', Value: 'prod' },
          { Key: 'DataPolicy', Value: 'SelectedDevSeed-IdentitySanitized' },
        ],
      },
    };
  }
  Resources.SrutiRegistrationSource = {
    Type: 'AWS::DynamoDB::Table',
    DeletionPolicy: 'Retain',
    UpdateReplacePolicy: 'Retain',
    Properties: {
      TableName: 'sruti-student-registrations',
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [
        { AttributeName: 'registrationId', AttributeType: 'S' },
        { AttributeName: 'institutionId', AttributeType: 'S' },
        { AttributeName: 'submittedAt', AttributeType: 'S' },
      ],
      KeySchema: [{ AttributeName: 'registrationId', KeyType: 'HASH' }],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'InstitutionRegistrationsIndex',
          KeySchema: [
            { AttributeName: 'institutionId', KeyType: 'HASH' },
            { AttributeName: 'submittedAt', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
      SSESpecification: { SSEEnabled: true },
      DeletionProtectionEnabled: true,
      Tags: [
        { Key: 'Project', Value: 'Sadhana' },
        { Key: 'Environment', Value: 'prod' },
        { Key: 'DataPolicy', Value: 'SrutiPrivateIntake' },
      ],
    },
  };
  if (Object.keys(Resources).length !== 19) throw Error('Expected 19 production tables.');
  return {
    AWSTemplateFormatVersion: '2010-09-09',
    Description:
      'Sadhana prod entity tables and private Sruti source; retained, encrypted, PITR enabled; no data migration.',
    Resources,
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--output')
    throw Error('Usage: node scripts/prodEntityTablesTemplate.mjs --output <new-local-file.json>');
  const output = args[1];
  const template = makeProductionEntityTablesTemplate();
  writeFileSync(output, JSON.stringify(template, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  chmodSync(output, 0o600);
  console.log(JSON.stringify({ template: output, productionTables: 19, awsWrites: 0 }));
}
