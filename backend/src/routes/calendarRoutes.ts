import { createAdditionalSessions } from '../additionalSessions.ts';
import { previewRecurringClass, createRecurringClass } from '../recurringClasses.ts';
import { listMiddlesbrough } from '../calendarSync.ts';
import {
  listManagedEvents,
  saveManagedEvent,
  cancelManagedEvent,
  saveSharedEvent,
  cancelSharedEvent,
} from '../eventManagement.ts';
import {
  listSchedule,
  changeSchedule,
  createSchedule,
  changeScheduleSeries,
  previewScheduleSeries,
  deleteScheduleSession,
  deleteSeriesSessions,
  deleteMasterClass,
  changeMasterLifecycle,
} from '../scheduleStore.ts';
import type { ScheduleInstitution } from '../scheduleModel.ts';
import { httpError } from '../model.ts';
import { listTeacherLinks, linkTeacherIdentity } from '../teacherLinking.ts';
import type { InstitutionId } from '../model.ts';
import { json, readJSON } from './http.ts';
import type { RouteContext, JsonResponse } from './http.ts';

export async function calendarRoutes({
  event,
  parts,
  method,
  query,
  groups,
  claims,
}: RouteContext): Promise<JsonResponse | undefined> {
  if (parts[0] === 'recurring-classes') {
    const academy = query.institution as InstitutionId;
    if (academy !== 'raaga' && academy !== 'sruti') throw httpError(400, 'Choose an academy.');
    const body = readJSON(
      event.body
        ? event.isBase64Encoded
          ? Buffer.from(event.body, 'base64').toString('utf8')
          : event.body
        : '',
    );
    if (method === 'POST' && parts.length === 2 && parts[1] === 'preview')
      return json(200, await previewRecurringClass(academy, claims, body));
    if (method === 'POST' && parts.length === 1)
      return json(201, await createRecurringClass(academy, claims, body));
    return json(405, { error: 'Unsupported recurring-class action.' });
  }
  if (parts[0] === 'events' && parts[1] === 'shared') {
    const body = readJSON(
      event.body
        ? event.isBase64Encoded
          ? Buffer.from(event.body, 'base64').toString('utf8')
          : event.body
        : '',
    );
    if (method === 'POST' && parts.length === 2)
      return json(201, await saveSharedEvent(claims, body));
    if (method === 'PATCH' && parts.length === 3)
      return json(200, await saveSharedEvent(claims, body, parts[2]));
    if (method === 'DELETE' && parts.length === 3)
      return json(200, await cancelSharedEvent(claims, parts[2], body.expectedVersion));
    return json(405, { error: 'Unsupported shared event action.' });
  }
  if (parts[0] === 'events') {
    const academy = query.institution as InstitutionId;
    if (academy !== 'raaga' && academy !== 'sruti') throw httpError(400, 'Choose an academy.');
    if (method === 'GET' && parts.length === 1)
      return json(200, await listManagedEvents(academy, claims));
    const body = readJSON(
      event.body
        ? event.isBase64Encoded
          ? Buffer.from(event.body, 'base64').toString('utf8')
          : event.body
        : '',
    );
    if (method === 'POST' && parts.length === 1)
      return json(201, await saveManagedEvent(academy, claims, body));
    if (method === 'PATCH' && parts.length === 2)
      return json(200, await saveManagedEvent(academy, claims, body, parts[1]));
    if (method === 'DELETE' && parts.length === 2)
      return json(200, await cancelManagedEvent(academy, claims, parts[1], body.expectedVersion));
    return json(405, { error: 'Unsupported event action.' });
  }
  if (parts[0] === 'additional-sessions' && method === 'POST' && parts.length === 1) {
    const academy = query.institution as InstitutionId;
    if (academy !== 'raaga' && academy !== 'sruti') throw httpError(400, 'Choose an academy.');
    const body = readJSON(
      event.body
        ? event.isBase64Encoded
          ? Buffer.from(event.body, 'base64').toString('utf8')
          : event.body
        : '',
    );
    return json(201, await createAdditionalSessions(academy, claims, body));
  }
  // Sadhana-owned, individually editable timetable (never invokes Google Calendar).
  if (parts[0] === 'schedule') {
    const target = query.institution as ScheduleInstitution;
    if (!['raaga', 'sruti', 'shared'].includes(target))
      throw httpError(400, 'Choose institution=raaga, sruti or shared.');
    if (parts[1] === 'teacher-links') {
      if (method === 'GET' && parts.length === 2 && target !== 'shared')
        return json(200, await listTeacherLinks(target, claims));
      if (method === 'PATCH' && parts.length === 3 && target !== 'shared') {
        const linkBody = readJSON(
          event.body
            ? event.isBase64Encoded
              ? Buffer.from(event.body, 'base64').toString('utf8')
              : event.body
            : '',
        );
        return json(200, await linkTeacherIdentity(target, parts[2], linkBody, claims));
      }
      return json(405, { error: 'Unsupported teacher-link action.' });
    }
    if (method === 'GET' && parts.length === 1)
      return json(200, await listSchedule(target, claims));
    const body = readJSON(
      event.body
        ? event.isBase64Encoded
          ? Buffer.from(event.body, 'base64').toString('utf8')
          : event.body
        : '',
    );
    if (method === 'POST' && parts.length === 1)
      return json(201, await createSchedule(target, body, claims));
    if (method === 'POST' && parts.length === 4 && parts[1] === 'series' && parts[3] === 'preview')
      return json(200, await previewScheduleSeries(target, parts[2], body, claims));
    if (
      method === 'POST' &&
      parts.length === 4 &&
      parts[1] === 'master' &&
      parts[3] === 'delete-preview'
    )
      return json(200, await deleteMasterClass(target, parts[2], body, claims, true));
    if (method === 'DELETE' && parts.length === 3 && parts[1] === 'master')
      return json(200, await deleteMasterClass(target, parts[2], body, claims, false));
    if (
      method === 'POST' &&
      parts.length === 4 &&
      parts[1] === 'series' &&
      parts[3] === 'delete-preview'
    )
      return json(200, await deleteSeriesSessions(target, parts[2], body, claims, true));
    if (method === 'DELETE' && parts.length === 3 && parts[1] === 'series')
      return json(200, await deleteSeriesSessions(target, parts[2], body, claims, false));
    if (method === 'PATCH' && parts.length === 3 && parts[1] === 'series')
      return json(200, await changeScheduleSeries(target, parts[2], body, claims));
    if (
      method === 'PATCH' &&
      parts.length === 4 &&
      parts[1] === 'master' &&
      parts[3] === 'lifecycle'
    )
      return json(200, await changeMasterLifecycle(target, parts[2], body, claims));
    if (method === 'PATCH' && parts.length === 2)
      return json(200, await changeSchedule(target, parts[1], body, claims));
    if (method === 'DELETE' && parts.length === 2)
      return json(200, await deleteScheduleSession(target, parts[1], body, claims));
    return json(405, { error: 'Unsupported schedule action.' });
  }
  // Legacy Middlesbrough mirror can still be read, but Google syncing is retired.
  if (parts[0] === 'calendar' && parts[1] === 'middlesbrough') {
    if (!groups.includes('raaga')) throw httpError(403, 'Raagasudha administrator role required.');
    if (method === 'GET' && parts.length === 2) return json(200, await listMiddlesbrough());
    if (method === 'POST' && parts[2] === 'sync')
      return json(410, {
        error: 'Google Calendar sync has been retired. Manage the timetable directly in Sadhana.',
      });
    return json(405, { error: 'Unsupported calendar action.' });
  }
  return undefined;
}
