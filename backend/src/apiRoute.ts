/**
 * Resolve the path below /api for API Gateway HTTP API v2 events.
 * API Gateway can include the stage (for example /dev) in rawPath when called
 * through execute-api. The greedy route's pathParameters.proxy is preferred.
 * This helper never grants access; authorisation remains in API Gateway/Lambda.
 */
export interface ApiRouteEvent {
  rawPath?: string;
  path?: string;
  pathParameters?: { proxy?: string } | null;
  requestContext?: { stage?: string } | null;
}

export function apiRouteParts(event: ApiRouteEvent): string[] {
  const proxy = event.pathParameters?.proxy;
  if (typeof proxy === 'string') return proxy.split('/').filter(Boolean);

  const raw = event.rawPath ?? event.path ?? '';
  const stage = event.requestContext?.stage;
  const withoutStage = stage && stage !== '$default' && raw.startsWith(`/${stage}/`)
    ? raw.slice(stage.length + 1)
    : raw;

  // The first form is /api/me; the fallback covers /dev/api/me for events
  // that do not populate pathParameters or requestContext.stage.
  const prefix = withoutStage.match(/^\/api(?:\/|$)/)
    ?? withoutStage.match(/^\/[^/]+\/api(?:\/|$)/);
  if (!prefix) return [];
  return withoutStage.slice(prefix[0].length).split('/').filter(Boolean);
}
