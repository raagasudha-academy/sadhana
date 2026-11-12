#!/usr/bin/env node
/** Generate a deployment-ready CloudFormation JSON template locally. No AWS calls. */
import { writeFileSync } from 'node:fs';
import { M9_SCHEMA, validateSchema } from './schema.mjs';

export function makeTemplate(environment = 'dev') {
  if (environment !== 'dev')
    throw new Error('M9 provisioning currently allows dev environment only');
  const errors = validateSchema();
  if (errors.length) throw new Error(errors.join('; '));
  const resources = {};
  for (const def of M9_SCHEMA) {
    const tableName = def.tableName.replace(/^sadhana-dev-/, `sadhana-${environment}-m9-`);
    const attributes = [
      ...new Set([
        def.partitionKey,
        ...def.indexes.flatMap((g) => [g.partitionKey, g.sortKey].filter(Boolean)),
      ]),
    ];
    const key = (name, type) => ({ AttributeName: name, KeyType: type });
    const logicalId = `M9${tableName
      .replace(/^sadhana-dev-/, '')
      .split('-')
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join('')}Table`;
    resources[logicalId] = {
      Type: 'AWS::DynamoDB::Table',
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
      Properties: {
        TableName: tableName,
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: attributes.map((AttributeName) => ({
          AttributeName,
          AttributeType: 'S',
        })),
        KeySchema: [key(def.partitionKey, 'HASH')],
        ...(def.indexes.length
          ? {
              GlobalSecondaryIndexes: def.indexes.map((i) => ({
                IndexName: i.name,
                KeySchema: [
                  key(i.partitionKey, 'HASH'),
                  ...(i.sortKey ? [key(i.sortKey, 'RANGE')] : []),
                ],
                Projection: { ProjectionType: 'ALL' },
              })),
            }
          : {}),
        PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
        DeletionProtectionEnabled: true,
        Tags: [
          { Key: 'Project', Value: 'Sadhana' },
          { Key: 'Milestone', Value: 'M9' },
          { Key: 'Environment', Value: environment },
          { Key: 'DataPolicy', Value: 'FreshOnly-NoLegacyImport' },
        ],
      },
    };
  }
  if (Object.keys(resources).length !== 18) throw new Error('Expected exactly 18 tables');
  return {
    AWSTemplateFormatVersion: '2010-09-09',
    Description: 'Sadhana M9 fresh dev tables only; does not modify existing five-table stack',
    Resources: resources,
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !args[0].endsWith('.json'))
    throw Error('Usage: node scripts/provisionTemplate.mjs ./provision-dev.json');
  const output = args[0];
  writeFileSync(output, JSON.stringify(makeTemplate('dev'), null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
  console.log(
    JSON.stringify(
      { template: output, physicalTables: 18, environment: 'dev', awsWrites: 0 },
      null,
      2,
    ),
  );
}
