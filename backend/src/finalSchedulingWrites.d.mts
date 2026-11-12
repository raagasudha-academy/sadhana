import type { RouteContext } from './routes/http.ts';
import type { InstitutionId } from './model.ts';
type Client = Record<string, any>;
export type FinalScheduleWriteDependencies = {
  assertConfigured: () => void;
  parse: (event: RouteContext['event']) => Record<string, any>;
  calendar: () => Client;
  sessions: () => Client;
  series: () => Client;
  events: () => Client;
};
export type FinalScheduleWriteAccess = {
  admin: (claims: RouteContext['claims'], inst: InstitutionId) => void;
  view: (claims: RouteContext['claims'], inst: InstitutionId) => void;
  viewableInstitutions: (claims: RouteContext['claims']) => InstitutionId[];
  permittedInstitutions: (claims: RouteContext['claims']) => InstitutionId[];
  deny: () => never;
};
export function finalSchedulingWriteRoute(
  context: RouteContext,
  dependencies: FinalScheduleWriteDependencies,
  access: FinalScheduleWriteAccess,
  env?: Record<string, string | undefined>,
): Promise<{ status: number; body: unknown } | undefined>;
