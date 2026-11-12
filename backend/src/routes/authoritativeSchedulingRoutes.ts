/** Existing frontend scheduling and managed-event API, backed ONLY by M9 tables.
 * Explicit opt-in. Unsupported requests fail closed rather than reaching the
 * PK/SK calendar handlers. The M95 writers retain their own independent flags.
 */
import type { DomainRoute } from './http.ts';
import { json, readJSON } from './http.ts';
import {
  demandInstitution,
  demandViewInstitution,
  httpError,
  viewableInstitutions,
} from '../model.ts';
import { defaultM95Reader } from '../compatibility.ts';
import { defaultM95CalendarWriter } from '../calendarWrite.ts';
import { defaultM95SeriesWriter } from '../seriesWrite.ts';
import { defaultM95ManagedEventWriter } from '../managedEventWrite.ts';

export type M10ScheduleDeps = {
  reader: Pick<ReturnType<typeof defaultM95Reader>, 'schedule' | 'managedEvents'>;
  calendar: Pick<ReturnType<typeof defaultM95CalendarWriter>, 'create' | 'patch'>;
  series: Pick<ReturnType<typeof defaultM95SeriesWriter>, 'preview' | 'change'>;
  events: Pick<ReturnType<typeof defaultM95ManagedEventWriter>, 'save' | 'shared' | 'cancel'>;
};
let live: M10ScheduleDeps | undefined;
const deps = () =>
  (live ??= {
    reader: defaultM95Reader(),
    calendar: defaultM95CalendarWriter(),
    series: defaultM95SeriesWriter(),
    events: defaultM95ManagedEventWriter(),
  });
const disabled = () =>
  json(503, { error: 'M9 scheduling operation not migrated. No legacy fallback.' });
const parsedBody = (event: { body?: string | null; isBase64Encoded?: boolean }) =>
  readJSON(
    event.body
      ? event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf8')
        : event.body
      : '',
  );

export function makeM10AuthoritativeSchedulingRoutes(
  factory: () => M10ScheduleDeps = deps,
): DomainRoute {
  return async ({ parts, method, query, claims, event }) => {
    const root = parts[0];
    if (root !== 'schedule' && root !== 'events') return undefined;
    if (process.env.M10_SCHEDULING_AUTHORITATIVE !== 'enabled') return undefined;
    // These two older flags are deliberate independent checks in the existing M9 writers.
    if (process.env.M95_COMPAT_MODE !== 'pilot') return disabled();
    const inst = query.institution;
    if (root === 'schedule') {
      if (method === 'GET' && parts.length === 1) {
        if (inst === 'shared') {
          if (!viewableInstitutions(claims).length) throw httpError(403, 'Staff access required.');
        } else if (inst === 'raaga' || inst === 'sruti') demandViewInstitution(claims, inst);
        else throw httpError(400, 'Choose institution=raaga, sruti or shared.');
        return json(200, await factory().reader.schedule(inst));
      }
      if (inst !== 'raaga' && inst !== 'sruti') throw httpError(400, 'Choose Raagasudha or Sruti.');
      demandInstitution(claims, inst);
      if (process.env.M95_CALENDAR_WRITES !== 'enabled') return disabled();
      if (method === 'POST' && parts.length === 1)
        return json(201, await factory().calendar.create(inst, parsedBody(event), claims));
      if (method === 'PATCH' && parts.length === 2)
        return json(200, await factory().calendar.patch(inst, parts[1], parsedBody(event), claims));
      if (parts[1] === 'series' && process.env.M95_SERIES_WRITES === 'enabled') {
        if (method === 'PATCH' && parts.length === 3)
          return json(
            200,
            await factory().series.change(inst, parts[2], parsedBody(event), claims),
          );
        if (method === 'POST' && parts.length === 4 && parts[3] === 'preview')
          return json(
            200,
            await factory().series.preview(inst, parts[2], parsedBody(event), claims),
          );
      }
      return disabled();
    }
    // Managed events are currently administrator-scoped. Do not accidentally
    // broaden access to teachers by reusing the old event listing handler.
    if (method === 'GET' && parts.length === 1) {
      if (inst !== 'raaga' && inst !== 'sruti') throw httpError(400, 'Select a valid institution.');
      demandInstitution(claims, inst);
      return json(200, await factory().reader.managedEvents(inst));
    }
    if (process.env.M95_MANAGED_EVENT_WRITES !== 'enabled') return disabled();
    if (parts[1] === 'shared') {
      if (!viewableInstitutions(claims).length) throw httpError(403, 'Staff access required.');
      if (method === 'POST' && parts.length === 2)
        return json(201, await factory().events.shared(claims, parsedBody(event)));
      if (method === 'PATCH' && parts.length === 3)
        return json(200, await factory().events.shared(claims, parsedBody(event), parts[2]));
      if (method === 'DELETE' && parts.length === 3)
        return json(200, await factory().events.shared(claims, parsedBody(event), parts[2], true));
      return disabled();
    }
    if (inst !== 'raaga' && inst !== 'sruti') throw httpError(400, 'Select a valid institution.');
    demandInstitution(claims, inst);
    if (method === 'POST' && parts.length === 1)
      return json(201, await factory().events.save(inst, claims, parsedBody(event)));
    if (method === 'PATCH' && parts.length === 2)
      return json(200, await factory().events.save(inst, claims, parsedBody(event), parts[1]));
    if (method === 'DELETE' && parts.length === 2) {
      const body = parsedBody(event);
      if (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 1)
        throw httpError(400, 'Expected a positive record version.');
      return json(200, await factory().events.cancel(inst, claims, parts[1], body.expectedVersion));
    }
    return disabled();
  };
}
export const m10AuthoritativeSchedulingRoutes = makeM10AuthoritativeSchedulingRoutes();
