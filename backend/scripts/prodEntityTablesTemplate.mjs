#!/usr/bin/env node
/** Generate isolated, retained stage-specific DynamoDB resources. No AWS calls. */
import { chmodSync, writeFileSync } from 'node:fs';
import { M9_SCHEMA, validateSchema } from './schema.mjs';

const stageName = (tableName, stage) => {
  const suffix = tableName.replace(/^sadhana-dev-/, '');
  if (suffix === tableName) throw Error(`Unexpected schema table name: ${tableName}`);
  return `${stage}-sadhana-${suffix === 'audit' ? 'audit-records' : suffix}`;
};
const logicalId = (name) =>
  name
    .replace(/[^A-Za-z0-9]/g, ' ')
    .trim()
    .split(/\s+/)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');
const key = (AttributeName, KeyType) => ({ AttributeName, KeyType });

export function makeProductionEntityTablesTemplate(stage = 'prod') {
  if (!['dev', 'prod'].includes(stage)) throw Error('Stage must be dev or prod');
  const errors = validateSchema();
  if (errors.length) throw Error(errors.join('; '));
  const Resources = {};
  for (const schema of M9_SCHEMA) {
    const TableName = stageName(schema.tableName, stage);
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
          { Key: 'Environment', Value: stage },
          {
            Key: 'DataPolicy',
            Value: stage === 'prod' ? 'SelectedDevSeed-IdentitySanitized' : 'Development',
          },
        ],
      },
    };
  }
  Resources.SrutiRegistrationSource = {
    Type: 'AWS::DynamoDB::Table',
    DeletionPolicy: 'Retain',
    UpdateReplacePolicy: 'Retain',
    Properties: {
      TableName: `${stage}-sruti-student-registrations`,
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
        { Key: 'Environment', Value: stage },
        { Key: 'DataPolicy', Value: 'SrutiPrivateIntake' },
      ],
    },
  };
  Resources.RaagasudhaRegistrationSource = {
    Type: 'AWS::DynamoDB::Table',
    DeletionPolicy: 'Retain',
    UpdateReplacePolicy: 'Retain',
    Properties: {
      TableName: `${stage}-raagasudha-student-registrations`,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [{ AttributeName: 'registrationId', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'registrationId', KeyType: 'HASH' }],
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
      SSESpecification: { SSEEnabled: true },
      DeletionProtectionEnabled: true,
      Tags: [
        { Key: 'Project', Value: 'Sadhana' },
        { Key: 'Environment', Value: stage },
        { Key: 'DataPolicy', Value: 'RaagasudhaPrivateIntake' },
      ],
    },
  };
  if (Object.keys(Resources).length !== 20) throw Error('Expected 20 stage tables.');
  return {
    AWSTemplateFormatVersion: '2010-09-09',
    Description: `Sadhana ${stage} entity tables and private academy intake sources; retained, encrypted, PITR enabled; no data migration.`,
    Resources,
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const args = process.argv.slice(2);
  let stage = 'prod';
  let output;
  if (args.length === 2 && args[0] === '--output') output = args[1];
  else if (args.length === 4 && args[0] === '--stage' && args[2] === '--output') {
    stage = args[1];
    output = args[3];
  } else {
    throw Error(
      'Usage: node scripts/prodEntityTablesTemplate.mjs [--stage dev|prod] --output <new-local-file.json>',
    );
  }
  const template = makeProductionEntityTablesTemplate(stage);
  writeFileSync(output, JSON.stringify(template, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  chmodSync(output, 0o600);
  console.log(JSON.stringify({ template: output, stage, tables: 20, awsWrites: 0 }));
}
