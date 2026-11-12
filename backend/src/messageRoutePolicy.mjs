const threadIdPattern = /^[a-f0-9]{64}$/;

/** Exact authenticated message operations that may be used by learner accounts. */
export function isMessageRoute(method, parts) {
  if (!Array.isArray(parts) || parts[0] !== 'messages') return false;
  if (method === 'GET' && parts.length === 2 && (parts[1] === 'contacts' || parts[1] === 'threads'))
    return true;
  if (method === 'GET' && parts.length === 2 && parts[1] === 'notifications') return true;
  if (
    method === 'POST' &&
    parts.length === 4 &&
    parts[1] === 'notifications' &&
    parts[3] === 'read' &&
    /^[A-Za-z0-9_-]{4,150}$/.test(parts[2] || '')
  )
    return true;
  if (method === 'POST' && parts.length === 1) return true;
  const threadPath =
    parts.length >= 3 && parts[1] === 'threads' && threadIdPattern.test(parts[2] || '');
  return (
    Boolean(threadPath && parts.length === 3 && (method === 'GET' || method === 'POST')) ||
    Boolean(threadPath && parts.length === 4 && parts[3] === 'read' && method === 'POST')
  );
}
