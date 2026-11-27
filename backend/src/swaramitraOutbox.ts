/** Durable, per-student outbound WhatsApp jobs. Phone numbers are resolved only at claim time. */
import { createHash, randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { entityTable } from './entityTables.mjs';
import type { InstitutionId } from './model.ts';

type DB = { send: (command: any) => Promise<any> };
type Enqueue = {
  institution: InstitutionId;
  classId: string;
  studentIds: string[];
  resourceId: string;
  title: string;
  message: string;
  requestId: string;
};
const queueTable = () => process.env.SWARAMITRA_WHATSAPP_OUTBOX_TABLE || '';
const isoAfter = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();
const deliveryId = (requestId: string, studentId: string) =>
  createHash('sha256').update(`${requestId}\n${studentId}`).digest('hex');

export function makeSwaraMitraOutbox(db: DB, now = () => new Date().toISOString()) {
  const table = () => {
    const value = queueTable();
    if (!value) throw new Error('SwaraMitra WhatsApp outbox is not configured.');
    return value;
  };
  return {
    async enqueue(input: Enqueue) {
      const createdAt = now();
      let queued = 0;
      for (const studentId of [...new Set(input.studentIds)]) {
        const id = deliveryId(input.requestId, studentId);
        try {
          await db.send(
            new PutCommand({
              TableName: table(),
              Item: {
                deliveryId: id,
                institutionId: input.institution,
                classId: input.classId,
                studentId,
                resourceId: input.resourceId,
                title: input.title,
                message: input.message,
                status: 'pending',
                GSI1PK: 'pending',
                GSI1SK: createdAt,
                availableAt: createdAt,
                attempts: 0,
                createdAt,
                updatedAt: createdAt,
                expiresAt: Math.floor(Date.now() / 1000) + 60 * 24 * 60 * 60,
              },
              ConditionExpression: 'attribute_not_exists(deliveryId)',
            }),
          );
          queued += 1;
        } catch (error: any) {
          if (error?.name !== 'ConditionalCheckFailedException') throw error;
        }
      }
      return { queued };
    },
    async consumeNonce(nonce: string) {
      try {
        await db.send(
          new PutCommand({
            TableName: table(),
            Item: {
              deliveryId: `nonce#${nonce}`,
              recordType: 'request-nonce',
              expiresAt: Math.floor(Date.now() / 1000) + 3 * 60,
            },
            ConditionExpression: 'attribute_not_exists(deliveryId)',
          }),
        );
        return true;
      } catch (error: any) {
        if (error?.name === 'ConditionalCheckFailedException') return false;
        throw error;
      }
    },
    async claim(limit = 5) {
      const expired = await db.send(
        new QueryCommand({
          TableName: table(),
          IndexName: 'QueueByLease',
          KeyConditionExpression: 'GSI2PK=:leased AND GSI2SK<=:now',
          ExpressionAttributeValues: { ':leased': 'leased', ':now': now() },
          Limit: 25,
        }),
      );
      for (const row of expired.Items || []) {
        const exhausted = Number(row.attempts) >= 3;
        const status = exhausted ? 'failed' : 'pending';
        const availableAt = now();
        try {
          await db.send(
            new UpdateCommand({
              TableName: table(),
              Key: { deliveryId: row.deliveryId },
              UpdateExpression:
                'SET #status=:status, GSI1PK=:status, GSI1SK=:availableAt, availableAt=:availableAt, updatedAt=:now REMOVE leaseUntil, leaseToken, GSI2PK, GSI2SK',
              ConditionExpression: '#status=:leased AND leaseUntil<=:now',
              ExpressionAttributeNames: { '#status': 'status' },
              ExpressionAttributeValues: {
                ':status': status,
                ':leased': 'leased',
                ':availableAt': availableAt,
                ':now': now(),
              },
            }),
          );
        } catch (error: any) {
          if (error?.name !== 'ConditionalCheckFailedException') throw error;
        }
      }
      const result = await db.send(
        new QueryCommand({
          TableName: table(),
          IndexName: 'QueueByStatus',
          KeyConditionExpression: 'GSI1PK = :pending AND GSI1SK <= :now',
          ExpressionAttributeValues: { ':pending': 'pending', ':now': now() },
          Limit: Math.max(1, Math.min(10, limit)),
          ScanIndexForward: true,
        }),
      );
      const claimed: Record<string, any>[] = [];
      for (const row of result.Items || []) {
        const leaseUntil = isoAfter(120);
        const leaseToken = randomUUID();
        try {
          const updated = await db.send(
            new UpdateCommand({
              TableName: table(),
              Key: { deliveryId: row.deliveryId },
              UpdateExpression:
                'SET #status=:leased, GSI1PK=:leased, GSI1SK=:leaseUntil, GSI2PK=:leased, GSI2SK=:leaseUntil, leaseUntil=:leaseUntil, leaseToken=:leaseToken, updatedAt=:now ADD attempts :one',
              ConditionExpression: '#status=:pending',
              ExpressionAttributeNames: { '#status': 'status' },
              ExpressionAttributeValues: {
                ':pending': 'pending',
                ':leased': 'leased',
                ':leaseUntil': leaseUntil,
                ':leaseToken': leaseToken,
                ':now': now(),
                ':one': 1,
              },
              ReturnValues: 'ALL_NEW',
            }),
          );
          claimed.push(updated.Attributes);
        } catch (error: any) {
          if (error?.name !== 'ConditionalCheckFailedException') throw error;
        }
      }
      return claimed;
    },
    async acknowledge(id: string, leaseToken: string, outcome: 'sent' | 'failed' | 'suppressed') {
      const result = await db.send(
        new GetCommand({ TableName: table(), Key: { deliveryId: id }, ConsistentRead: true }),
      );
      const row = result.Item;
      if (!row || row.status !== 'leased' || row.leaseToken !== leaseToken) return { ok: false };
      const retry = outcome === 'failed' && row.attempts < 3;
      const status = retry ? 'pending' : outcome;
      const availableAt = retry ? isoAfter(30 * Math.max(1, row.attempts)) : now();
      await db.send(
        new UpdateCommand({
          TableName: table(),
          Key: { deliveryId: id },
          UpdateExpression:
            'SET #status=:status, GSI1PK=:status, GSI1SK=:availableAt, availableAt=:availableAt, updatedAt=:now REMOVE leaseUntil, leaseToken, GSI2PK, GSI2SK',
          ConditionExpression: '#status=:leased AND leaseToken=:leaseToken',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':status': status,
            ':leased': 'leased',
            ':leaseToken': leaseToken,
            ':availableAt': availableAt,
            ':now': now(),
          },
        }),
      );
      return { ok: true };
    },
  };
}

let singleton: ReturnType<typeof makeSwaraMitraOutbox> | undefined;
export function swaraMitraOutbox() {
  return (singleton ??= makeSwaraMitraOutbox(
    DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }),
      { marshallOptions: { removeUndefinedValues: true } },
    ),
  ));
}
