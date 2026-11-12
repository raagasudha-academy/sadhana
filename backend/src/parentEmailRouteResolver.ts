import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { parentEmailRouteKey, parentUsernameFor } from './parentEmailRoute.mjs';

type DB = { send: (command: any) => Promise<any> };

const fail = (): never => {
  throw new Error('Parent email route could not be verified');
};

export async function resolveParentEmailRoute(
  db: DB,
  tables: { counters: string; registrations: string },
  username: string,
  recipientEmail: string,
): Promise<'raaga' | 'sruti'> {
  if (!/^parent-[A-Za-z0-9_-]{8,128}$/.test(username)) fail();

  if (typeof recipientEmail !== 'string') fail();
  const email = recipientEmail.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail();

  const route = (
    await db.send(
      new GetCommand({
        TableName: tables.counters,
        Key: { counterId: parentEmailRouteKey(username) },
        ConsistentRead: true,
      }),
    )
  ).Item;

  if (
    !route ||
    route.sequenceType !== 'PARENT_EMAIL_ROUTE' ||
    !['raaga', 'sruti'].includes(route.institutionId) ||
    route.recipientEmail !== email ||
    !route.registrationId ||
    !route.familyId ||
    route.status !== 'pending'
  )
    fail();

  if (parentUsernameFor(route.registrationId) !== username) fail();

  const reg = (
    await db.send(
      new GetCommand({
        TableName: tables.registrations,
        Key: { registrationId: route.registrationId },
        ConsistentRead: true,
      }),
    )
  ).Item;

  if (
    !reg ||
    reg.institutionId !== route.institutionId ||
    reg.familyId !== route.familyId ||
    reg.importStatus !== 'imported' ||
    reg.source !== 'website' ||
    !['INVITATION_CREATING', 'INVITATION_SENT'].includes(reg.provisioningStatus)
  ) {
    fail();
  }

  if (reg.provisioningStatus === 'INVITATION_CREATING' && !reg.invitationOperationId) fail();

  if (
    reg.provisioningStatus === 'INVITATION_SENT' &&
    (reg.parentAccountUsername !== username || reg.parentAccountEmail !== email)
  )
    fail();

  return route.institutionId;
}
