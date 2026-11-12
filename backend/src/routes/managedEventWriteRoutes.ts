/** Existing /events mutation contracts, M9 pilot only. */
import type { DomainRoute } from './http.ts';
import { json, readJSON } from './http.ts';
import { httpError } from '../model.ts';
import { defaultM95ManagedEventWriter, isPilotManagedEventRequest } from '../managedEventWrite.ts';
export function makeM95ManagedEventWriteRoutes(
  writer = defaultM95ManagedEventWriter(),
): DomainRoute {
  return async ({ event, method, parts, query, claims }) => {
    if (
      process.env.M95_COMPAT_MODE !== 'pilot' ||
      process.env.M95_MANAGED_EVENT_WRITES !== 'enabled'
    )
      return undefined;
    if (!isPilotManagedEventRequest(method, parts)) return undefined;
    const body = readJSON(
      event.body
        ? event.isBase64Encoded
          ? Buffer.from(event.body, 'base64').toString('utf8')
          : event.body
        : '',
    );
    if (parts[1] === 'shared') {
      if (method === 'POST') return json(201, await writer.shared(claims, body));
      if (method === 'PATCH') return json(200, await writer.shared(claims, body, parts[2]));
      return json(200, await writer.shared(claims, body, parts[2], true));
    }
    const inst = query.institution;
    if (inst !== 'raaga' && inst !== 'sruti') throw httpError(400, 'Choose Raagasudha or Sruti.');
    if (method === 'POST') return json(201, await writer.save(inst, claims, body));
    if (method === 'PATCH') return json(200, await writer.save(inst, claims, body, parts[1]));
    return json(200, await writer.cancel(inst, claims, parts[1], body.expectedVersion));
  };
}
export const m95ManagedEventWriteRoutes = makeM95ManagedEventWriteRoutes();
