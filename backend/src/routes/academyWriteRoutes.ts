/** First real M9 Academy Core write endpoint. Opt-in only, never falls back to legacy. */
import type { DomainRoute } from './http.ts';
import { json, readJSON } from './http.ts';
import { demandInstitution, httpError } from '../model.ts';
import { makeM9TargetWriter, makeM9TargetWriterClient } from '../targetWriter.ts';
import { validateM10AcademyWrite } from '../academyWritePolicy.mjs';
import type { M10AcademyEntity } from '../academyWritePolicy.mjs';

type Writer = Pick<ReturnType<typeof makeM9TargetWriter>, 'create' | 'update'>;
let live: Writer | undefined;
const writer = () => (live ??= makeM9TargetWriter(makeM9TargetWriterClient(), { enabled: true }));
export function makeM10AcademyWriteRoutes(getWriter: () => Writer = writer): DomainRoute {
  return async ({ parts, method, inst, claims, event }) => {
    if (parts[0] !== 'm10-academy') return undefined;
    // Deliberately fail closed even if the general M9 writer is enabled.
    if (
      process.env.M10_ACADEMY_CORE_WRITES !== 'enabled' ||
      process.env.M9_TARGET_REPOSITORY_WRITES !== 'enabled'
    )
      return json(503, { error: 'M10 Academy Core writes are disabled.' });
    demandInstitution(claims, inst);
    if (parts.length < 2 || !['classes', 'venues'].includes(parts[1]))
      return json(404, { error: 'Unsupported academy entity.' });
    const entity = parts[1] as M10AcademyEntity;
    if (method !== 'POST' && method !== 'PATCH')
      return json(405, { error: 'Unsupported academy operation.' });
    const operation = method === 'POST' ? 'create' : 'update';
    if (
      (operation === 'create' && parts.length !== 2) ||
      (operation === 'update' && parts.length !== 3)
    )
      return json(404, { error: 'Invalid academy path.' });
    const body = readJSON(event.body || '');
    try {
      validateM10AcademyWrite(
        entity,
        operation,
        operation === 'update' ? body.changes : body,
        inst,
      );
    } catch {
      return json(400, { error: 'Invalid academy data or forbidden fields.' });
    }
    try {
      if (operation === 'create')
        return json(201, { record: await getWriter().create(entity, body) });
      if (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 1)
        return json(400, { error: 'Expected record version required.' });
      const id = parts[2];
      if (typeof id !== 'string' || !id.length || id.length > 180)
        return json(400, { error: 'Invalid record identifier.' });
      const updated = await getWriter().update(
        entity,
        id,
        body.expectedVersion,
        body.changes,
        inst,
      );
      return json(200, { record: updated });
    } catch (e) {
      if ((e as { name?: string })?.name === 'ConditionalCheckFailedException')
        return json(409, { error: 'Duplicate record, version conflict, or institution mismatch.' });
      throw e;
    }
  };
}
export const m10AcademyWriteRoutes = makeM10AcademyWriteRoutes();
