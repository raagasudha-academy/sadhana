import {
  beginLearningResourceUpload,
  createLearningResource,
  deleteLearningResource,
  listLearningResourceClasses,
  listLearningResources,
  updateLearningResource,
} from '../learningResources.ts';
import { httpError } from '../model.ts';
import { json, readJSON } from './http.ts';
import type { RouteContext, JsonResponse } from './http.ts';

const idPattern = /^RESOURCE-[0-9a-f-]{36}$/i;
export async function learningResourcesRoutes({
  event,
  parts,
  method,
  inst,
  claims,
  query,
}: RouteContext): Promise<JsonResponse | undefined> {
  if (parts[0] !== 'learning-resources') return undefined;
  if (inst !== 'raaga' && inst !== 'sruti') throw httpError(400, 'Select a valid academy.');
  if (parts.length === 2 && parts[1] === 'classes' && method === 'GET')
    return json(200, await listLearningResourceClasses(inst, claims, query.studentId));
  if (parts.length === 2 && parts[1] === 'uploads' && method === 'POST')
    return json(200, await beginLearningResourceUpload(inst, claims, readJSON(event.body || '')));
  if (parts.length === 1) {
    if (method === 'GET')
      return json(200, await listLearningResources(inst, claims, query.studentId));
    if (method === 'POST')
      return json(201, await createLearningResource(inst, claims, readJSON(event.body || '')));
    return json(405, { error: 'Unsupported learning resource action.' });
  }
  if (parts.length !== 2 || !idPattern.test(parts[1]))
    throw httpError(400, 'Invalid learning resource identifier.');
  if (method === 'PUT')
    return json(
      200,
      await updateLearningResource(inst, claims, parts[1], readJSON(event.body || '')),
    );
  if (method === 'DELETE') {
    const body = readJSON(event.body || '');
    return json(200, await deleteLearningResource(inst, claims, parts[1], body.expectedVersion));
  }
  return json(405, { error: 'Unsupported learning resource action.' });
}
