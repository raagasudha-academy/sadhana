import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { entityTable } from './entityTables.mjs';
import { httpError, permittedInstitutions } from './model.ts';
import type { Claims, InstitutionId } from './model.ts';
import { defaultM95CalendarWriter, utcForWallTime } from './calendarWrite.ts';
import { parseRecurringClassInput } from './recurringClasses.ts';
import type { ScheduleRecord } from './scheduleModel.ts';

const MAX_CLASSES = 3000;

export function makeFinalRecurringClassWriter(
  client = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }),
    { marshallOptions: { removeUndefinedValues: true } },
  ),
  calendar = defaultM95CalendarWriter(),
) {
  const scanClasses = async (institution: InstitutionId) => {
    const matches: Record<string, any>[] = [];
    let cursor: Record<string, any> | undefined;
    do {
      const page = await client.send(
        new ScanCommand({
          TableName: entityTable('classes'),
          ConsistentRead: true,
          ExclusiveStartKey: cursor,
          Limit: 250,
        }),
      );
      matches.push(
        ...(page.Items ?? []).filter(
          (item) => item.institutionId === institution && item.recordType === 'class',
        ),
      );
      cursor = page.LastEvaluatedKey;
      if (matches.length > MAX_CLASSES)
        throw httpError(413, 'Too many classes to verify a recurring class safely.');
    } while (cursor);
    return matches;
  };

  const scanLinkedTeacher = async (institution: InstitutionId, claims: Claims) => {
    const people: Record<string, any>[] = [];
    let cursor: Record<string, any> | undefined;
    do {
      const page = await client.send(
        new ScanCommand({
          TableName: entityTable('people'),
          ConsistentRead: true,
          ExclusiveStartKey: cursor,
          Limit: 250,
        }),
      );
      people.push(...(page.Items ?? []));
      cursor = page.LastEvaluatedKey;
      if (people.length > MAX_CLASSES)
        throw httpError(413, 'Too many people to verify a teacher safely.');
    } while (cursor);
    const linked = people.filter(
      (person) =>
        person.status === 'active' &&
        person.personTypes?.includes('teacher') &&
        person.institutionIds?.includes(institution) &&
        (person.cognitoSub === claims.sub ||
          person.staffProfile?.cognitoSub === claims.sub ||
          person.legacyPayload?.cognitoSub === claims.sub),
    );
    if (linked.length !== 1)
      throw httpError(403, 'Verified teacher identity required for this academy.');
    const teacherIds = [
      linked[0].legacyPayload?.id,
      linked[0].legacyPayload?.teacherId,
      linked[0].staffProfile?.teacherId,
      linked[0].teacherId,
      linked[0].personId,
    ].filter((id) => typeof id === 'string' && /^TEACHER-[0-9a-f-]{36}$/i.test(id));
    if (!teacherIds.length)
      throw httpError(409, 'Your linked teacher profile needs administrator reconciliation.');
    return { person: linked[0], teacherIds: [...new Set(teacherIds)] as string[] };
  };

  const inspect = async (institution: InstitutionId, claims: Claims, body: Record<string, any>) => {
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw httpError(400, 'Invalid class.');
    const isAdmin = permittedInstitutions(claims).includes(institution);
    let selfTeacherId: string | undefined;
    let person: Record<string, any> | undefined;
    if (isAdmin) {
      const teacher = await client.send(
        new GetCommand({
          TableName: entityTable('people'),
          Key: { personId: body.teacherId },
          ConsistentRead: true,
        }),
      );
      person = teacher.Item;
    } else {
      const linked = await scanLinkedTeacher(institution, claims);
      if (!linked.teacherIds.includes(body?.teacherId))
        throw httpError(403, 'Teachers may create recurring classes only for themselves.');
      selfTeacherId = body.teacherId;
      person = linked.person;
    }
    const { dates } = parseRecurringClassInput(institution, claims, body, selfTeacherId);
    const classes = await scanClasses(institution);
    if (
      !person ||
      person.status !== 'active' ||
      !person.personTypes?.includes('teacher') ||
      !person.institutionIds?.includes(institution)
    )
      throw httpError(400, 'Teacher is not active in this academy.');
    const sought = body.name.trim().toLocaleLowerCase();
    const duplicateNames = classes
      .filter(
        (item) =>
          String(item.name || item.legacyPayload?.name || '')
            .trim()
            .toLocaleLowerCase() === sought,
      )
      .map((item) => ({
        id: item.classId,
        name: String(item.name || item.legacyPayload?.name || '').trim(),
      }));
    return { dates, teacher: person, duplicateNames, selfTeacherId };
  };

  const preview = async (institution: InstitutionId, claims: Claims, body: Record<string, any>) => {
    const found = await inspect(institution, claims, body);
    return {
      dates: found.dates,
      count: found.dates.length,
      duplicateNames: found.duplicateNames,
      first: found.dates[0],
      last: found.dates.at(-1),
    };
  };

  const create = async (institution: InstitutionId, claims: Claims, body: Record<string, any>) => {
    const found = await inspect(institution, claims, body);
    if (found.duplicateNames.length)
      throw httpError(
        409,
        'A master class with this name already exists. Rename the class or review the existing class.',
      );
    const classId = `CLASS-${randomUUID()}`;
    const now = new Date().toISOString();
    const common = {
      institution,
      name: body.name.trim(),
      programme: body.programme,
      teacher: String(found.teacher.displayName || '').trim(),
      teacherId: body.teacherId,
      mode: body.mode,
      location: body.location,
      venueId: body.venueId,
      startTime: body.startTime,
      endTime: body.endTime,
      timezone: 'Europe/London' as const,
      status: 'confirmed' as const,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    const master = {
      ...common,
      id: classId,
      recordType: 'class' as const,
      endDate: found.dates.at(-1),
      recurrence: body.recurrence,
    } as ScheduleRecord;
    const sessions: ScheduleRecord[] = found.dates.map((date) => ({
      ...common,
      id: `EVT-${randomUUID()}`,
      recordType: 'class-session',
      classId,
      date,
      endDate: date,
      allDay: false,
    }));
    // Validate UK wall times before creating any data; DST gaps/folds must not
    // produce ambiguous session timestamps.
    for (const session of sessions) {
      utcForWallTime(session.date!, session.startTime);
      utcForWallTime(session.endDate!, session.endTime);
    }
    await calendar.createRecurring(institution, master, sessions, claims, found.selfTeacherId);
    return {
      record: { ...master, date: found.dates[0] },
      sessionCount: sessions.length,
      dates: found.dates,
    };
  };

  return { preview, create };
}

export const finalRecurringClasses = makeFinalRecurringClassWriter();
