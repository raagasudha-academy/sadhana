import { srutiGuardianCandidates, requestSrutiGuardianFromRaaga } from '../crossAcademyGuardian.ts';
import {
  myStudentLinks,
  requestStudentAccess,
  listAccessRequests,
  decideStudentAccess,
  myStudentOverview,
} from '../familyAccess.ts';
import { json, readJSON } from './http.ts';
import type { RouteContext, JsonResponse } from './http.ts';

export async function familyRoutes({
  event,
  parts,
  method,
  inst,
  claims,
}: RouteContext): Promise<JsonResponse | undefined> {
  if (parts[0] === 'family-access') {
    const body =
      method === 'POST'
        ? readJSON(
            event.body
              ? event.isBase64Encoded
                ? Buffer.from(event.body, 'base64').toString('utf8')
                : event.body
              : '',
          )
        : {};
    if (method === 'GET' && parts[1] === 'sruti-candidates')
      return json(200, await srutiGuardianCandidates(claims));
    if (method === 'POST' && parts[1] === 'sruti-request')
      return json(201, await requestSrutiGuardianFromRaaga(claims, body));
    if (method === 'GET' && parts[1] === 'mine' && parts.length === 2)
      return json(200, await myStudentOverview(inst, claims));
    if (method === 'GET' && parts[1] === 'links' && parts.length === 2)
      return json(200, await myStudentLinks(inst, claims));
    if (method === 'POST' && parts[1] === 'request' && parts.length === 2)
      return json(201, await requestStudentAccess(inst, claims, body));
    if (method === 'GET' && parts[1] === 'requests' && parts.length === 2)
      return json(200, await listAccessRequests(inst, claims));
    if (method === 'POST' && parts[1] === 'decide' && parts.length === 2)
      return json(200, await decideStudentAccess(inst, claims, body));
    return json(405, { error: 'Unsupported account access action.' });
  }
  return undefined;
}
