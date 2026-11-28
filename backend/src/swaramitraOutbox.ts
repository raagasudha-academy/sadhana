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
  className: string;
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
      const recipientCount = new Set(input.studentIds).size;
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
                className: input.className,
                studentId,
                resourceId: input.resourceId,
                requestId: input.requestId,
                requestedRecipientCount: recipientCount,
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
    async history(institution: InstitutionId, limit = 20) {
      const states = ['pending', 'leased', 'sent', 'failed', 'suppressed'];
      const rows: Record<string, any>[] = [];
      let truncated = false;
      for (const state of states) {
        let cursor: Record<string, any> | undefined;
        let read = 0;
        do {
          const page = await db.send(
            new QueryCommand({
              TableName: table(),
              IndexName: 'QueueByStatus',
              KeyConditionExpression: 'GSI1PK=:state',
              ExpressionAttributeValues: { ':state': state },
              ExclusiveStartKey: cursor,
              Limit: 1000,
              ScanIndexForward: false,
            }),
          );
          for (const row of page.Items || []) {
            if (row.institutionId === institution) rows.push(row);
          }
          read += (page.Items || []).length;
          cursor = page.LastEvaluatedKey;
        } while (cursor && read < 5000);
        if (cursor) truncated = true;
      }

      const grouped = new Map<string, Record<string, any>>();
      for (const row of rows) {
        const requestId =
          typeof row.requestId === 'string' ? row.requestId : `legacy:${row.deliveryId}`;
        const key = `${row.institutionId}:${requestId}`;
        const existing = grouped.get(key) || {
          requestId,
          institution: row.institutionId,
          classId: row.classId,
          className: row.className || row.classId,
          title: row.title,
          message: row.message,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          recipientCount: Number(row.requestedRecipientCount) || 0,
          sentCount: 0,
          failedCount: 0,
          queuedCount: 0,
          sendingCount: 0,
          notSentCount: 0,
        };
        existing.recipientCount = Math.max(
          existing.recipientCount,
          Number(row.requestedRecipientCount) || 0,
        );
        if (!Number(row.requestedRecipientCount)) existing.recipientCount += 1;
        if (row.status === 'sent') existing.sentCount += 1;
        else if (row.status === 'failed') existing.failedCount += 1;
        else if (row.status === 'pending') existing.queuedCount += 1;
        else if (row.status === 'leased') existing.sendingCount += 1;
        else if (row.status === 'suppressed') existing.notSentCount += 1;
        if (String(row.updatedAt || '') > String(existing.updatedAt || ''))
          existing.updatedAt = row.updatedAt;
        grouped.set(key, existing);
      }
      const records: Record<string, any>[] = [...grouped.values()]
        .map((record) => ({
          ...record,
          status:
            record.queuedCount || record.sendingCount
              ? 'in-progress'
              : (record.failedCount || record.notSentCount) && record.sentCount
                ? 'partial'
                : record.failedCount
                  ? 'failed'
                  : record.sentCount
                    ? 'sent'
                    : 'not-sent',
          countsMayBePartial: truncated,
        }))
        .sort((a: Record<string, any>, b: Record<string, any>) =>
          String(b.createdAt).localeCompare(String(a.createdAt)),
        )
        .slice(0, Math.max(1, Math.min(50, limit)));
      return { records };
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
