import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { m9FinalLearner } from './finalLearner.ts';
import { m10FinalFamilyAccessReader } from './finalFamilyAccessData.ts';
import { m10FinalLearnerProfiles } from './finalLearnerProfilesData.ts';
import { finalLinkedStudents } from './finalFamilyAccess.mjs';
import { apiRouteParts } from './apiRoute.ts';
import { json, type SadhanaHttpEvent } from './routes/http.ts';

const ssm = new SSMClient({});
const cognito = new CognitoIdentityProviderClient({});
let secretPromise: Promise<string> | undefined;

function header(event: SadhanaHttpEvent, name: string): string {
  const key = Object.keys(event.headers ?? {}).find(
    (candidate) => candidate.toLowerCase() === name,
  );
  return key ? event.headers?.[key] || '' : '';
}

function rawBody(event: SadhanaHttpEvent): string {
  if (!event.body) return '';
  return event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
}

async function hmacSecret(): Promise<string> {
  if (!secretPromise) {
    secretPromise = (async () => {
      const name = process.env.SWARAMITRA_SERVICE_CREDENTIAL_PARAMETER;
      if (!name) throw new Error('SwaraMitra service credential parameter is not configured.');
      const result = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
      const value = result.Parameter?.Value?.trim();
      if (!value) throw new Error('SwaraMitra service credential is empty.');
      return value;
    })().catch((error: unknown) => {
      secretPromise = undefined;
      throw error;
    });
  }
  return secretPromise;
}

function unauthorized() {
  return json(401, { error: 'Authenticated SwaraMitra service request required.' });
}

function normalizedPhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

function cleanDashboard(dashboard: Record<string, any>, classDetails: Record<string, any>) {
  return {
    student: dashboard.student ? { name: dashboard.student.name } : undefined,
    classes: Array.isArray(dashboard.classes)
      ? dashboard.classes.map((entry: any) => ({ className: entry.className }))
      : [],
    classDetails: Array.isArray(classDetails.classes)
      ? classDetails.classes.map((entry: any) => ({
          name: entry.name,
          teacher: entry.teacher,
          venue: entry.venue,
        }))
      : [],
    nextSessions: Array.isArray(dashboard.nextSessions)
      ? dashboard.nextSessions.slice(0, 20).map((entry: any) => ({
          className: entry.className,
          date: entry.date,
          startTime: entry.startTime,
          status: entry.status,
        }))
      : [],
    practice: Array.isArray(dashboard.practice)
      ? dashboard.practice.slice(-20).map((entry: any) => ({
          date: entry.date,
          minutes: entry.minutes,
          topic: entry.topic,
          comments: entry.comments,
          teacherComments: Array.isArray(entry.teacherComments)
            ? entry.teacherComments.slice(0, 10).map((comment: any) => ({
                comment: comment.comment,
                text: comment.text,
                createdAt: comment.createdAt,
              }))
            : [],
        }))
      : [],
    attendance: dashboard.attendance
      ? {
          attended: dashboard.attendance.attended,
          counted: dashboard.attendance.counted,
          percent: dashboard.attendance.percent,
        }
      : undefined,
  };
}

/** HMAC-protected WhatsApp identity resolution; never trusts a client-supplied Sadhana identity. */
export async function swaraMitraWhatsappRoute(event: SadhanaHttpEvent) {
  const parts = apiRouteParts(event);
  const method = event.requestContext?.http?.method ?? event.httpMethod;
  if (parts.join('/') !== 'integrations/swaramitra/whatsapp') return undefined;
  if (method !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (process.env.SADHANA_SWARAMITRA_WHATSAPP !== 'enabled')
    return json(404, { error: 'Integration is not available.' });

  const raw = rawBody(event);
  if (Buffer.byteLength(raw, 'utf8') > 4_000) return json(413, { error: 'Request too large.' });
  const timestamp = header(event, 'x-swaramitra-timestamp');
  const nonce = header(event, 'x-swaramitra-nonce');
  const signature = header(event, 'x-swaramitra-signature');
  const timestampMs = Number(timestamp);
  if (
    !/^\d{13}$/.test(timestamp) ||
    !Number.isFinite(timestampMs) ||
    Math.abs(Date.now() - timestampMs) > 60_000 ||
    !/^[0-9a-f-]{36}$/i.test(nonce) ||
    !/^[0-9a-f]{64}$/i.test(signature)
  )
    return unauthorized();
  const expected = Buffer.from(
    createHmac('sha256', await hmacSecret())
      .update(`${timestamp}.${nonce}.${raw}`)
      .digest('hex'),
  );
  const supplied = Buffer.from(signature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied))
    return unauthorized();

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return json(400, { error: 'JSON object required.' });
  const input = body as Record<string, unknown>;
  const phone = normalizedPhone(input.phone);
  const institution = input.institution;
  const studentId = input.studentId;
  if (!phone || (institution !== 'raaga' && institution !== 'sruti'))
    return json(400, { error: 'Valid phone and institution required.' });
  if (
    studentId !== undefined &&
    (typeof studentId !== 'string' || !/^[\w-]{4,150}$/.test(studentId))
  )
    return json(400, { error: 'Invalid learner selection.' });

  if (
    process.env.SADHANA_ENTITY_TABLE_SET !== 'final' ||
    process.env.SADHANA_ENTITY_FINAL_ACK !== 'enabled' ||
    process.env.SADHANA_DATA_MODE === 'split' ||
    process.env.SADHANA_FINAL_FAMILY_READS !== 'enabled' ||
    process.env.SADHANA_FINAL_LEARNER_READS !== 'enabled' ||
    process.env.SADHANA_FINAL_LEARNER_EXTRAS_READS !== 'enabled' ||
    process.env.SADHANA_FINAL_LEARNER_PREFERENCES_PARITY !== 'enabled'
  )
    return json(503, { error: 'Sadhana identity reads are not ready.' });

  const poolId = process.env.SADHANA_COGNITO_USER_POOL_ID;
  if (!poolId) return json(503, { error: 'Sadhana identity service is not configured.' });
  const listed = await cognito.send(
    new ListUsersCommand({ UserPoolId: poolId, Filter: `phone_number = "${phone}"`, Limit: 10 }),
  );
  const verifiedUsers = (listed.Users ?? []).filter((user) => {
    const attr = (name: string) => user.Attributes?.find((value) => value.Name === name)?.Value;
    return (
      user.Enabled === true &&
      user.UserStatus === 'CONFIRMED' &&
      attr('phone_number') === phone &&
      attr('phone_number_verified') === 'true' &&
      Boolean(attr('sub'))
    );
  });
  if (listed.PaginationToken || verifiedUsers.length > 1)
    return json(200, { status: 'ambiguous', learners: [] });
  const subject = verifiedUsers[0]?.Attributes?.find((value) => value.Name === 'sub')?.Value;
  if (!subject) return json(200, { status: 'unmatched', learners: [] });

  const baseReader = m10FinalFamilyAccessReader();
  const reader = {
    peopleForSubject: baseReader.peopleForSubject,
    person: baseReader.person,
    linksForGuardian: baseReader.linksForGuardian,
    link: baseReader.link,
  };
  const linked = await finalLinkedStudents(institution, subject, reader);
  const learners = linked.records.map(({ id, name, relationship }) => ({ id, name, relationship }));
  if (learners.length === 0) return json(200, { status: 'unlinked', learners: [] });
  if (studentId === undefined) return json(200, { status: 'linked', learners });

  const learner = learners.find((record) => record.id === studentId);
  if (!learner) return json(403, { error: 'Learner is outside the verified account scope.' });
  const claims = { sub: subject };
  const [dashboard, classDetails] = await Promise.all([
    m9FinalLearner().dashboard(institution, claims, learner.id),
    m10FinalLearnerProfiles().extras(institution, claims, learner.id),
  ]);
  return json(200, {
    status: 'linked',
    learner,
    dashboard: cleanDashboard(dashboard, classDetails),
  });
}
