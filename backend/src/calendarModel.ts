/** Middlesbrough-only Google Calendar projection. Never ingest guests, descriptions or contact details. */
import { createHash } from 'node:crypto';

export const MIDDLESBROUGH_GOOGLE_CALENDAR_ID = '23acbda44a41f8e8dab876ab9e12849066d9212080d5ef473f15b2b4043de343@group.calendar.google.com';
export const MIDDLESBROUGH_PARTITION = 'CALENDAR#raaga#middlesbrough';

export interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  status?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}
export interface CalendarSession {
  id: string;
  summary: string;
  start: string;
  end: string;
  location: string;
  status: 'confirmed' | 'cancelled' | 'tentative';
  institution: 'raaga';
  calendar: 'middlesbrough';
  source: 'google';
}

/** Normalise and strictly validate Google event fields; all-day events are deliberately skipped. */
export function projectGoogleEvents(events: GoogleCalendarEvent[]): { sessions: CalendarSession[]; skipped: number } {
  const sessions: CalendarSession[] = [];
  let skipped = 0;
  for (const event of events) {
    if (!event.id || !event.start?.dateTime || !event.end?.dateTime) { skipped++; continue; }
    const start = new Date(event.start.dateTime);
    const end = new Date(event.end.dateTime);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) { skipped++; continue; }
    if (start.toISOString().slice(0,10) < '2000-01-01') { skipped++; continue; }
    sessions.push({
      id: event.id,
      summary: String(event.summary ?? 'Untitled session').trim().slice(0,160) || 'Untitled session',
      start: start.toISOString(), end: end.toISOString(),
      location: String(event.location ?? '').trim().slice(0,250),
      status: event.status === 'cancelled' ? 'cancelled' : event.status === 'tentative' ? 'tentative' : 'confirmed',
      institution: 'raaga', calendar: 'middlesbrough', source: 'google'
    });
  }
  sessions.sort((a,b)=>a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  return { sessions, skipped };
}
export const sessionHash = (session: CalendarSession): string =>
  createHash('sha256').update(JSON.stringify([
    session.id,session.summary,session.start,session.end,session.location,session.status
  ])).digest('hex');
export const batchHash = (sessions: CalendarSession[]): string =>
  createHash('sha256').update(sessions.map(sessionHash).sort().join('|')).digest('hex');

export function diffCalendarSessions(incoming: CalendarSession[], existing: Array<CalendarSession & { syncHash?: string }>, withinWindow: (session: CalendarSession) => boolean) {
  const oldById = new Map(existing.map(x=>[x.id,x]));
  const freshIds = new Set(incoming.map(x=>x.id));
  const additions: CalendarSession[] = [];
  const changes: CalendarSession[] = [];
  let unchanged=0;
  for (const item of incoming) {
    const old=oldById.get(item.id);
    if (!old) additions.push(item);
    else if ((old.syncHash || sessionHash(old)) !== sessionHash(item)) changes.push(item);
    else unchanged++;
  }
  // A missing event may have been removed from Google. Never physically delete historical items.
  const removed = existing.filter(item=>withinWindow(item)&&!freshIds.has(item.id)&&item.status!=='cancelled')
    .map(item=>({...item,status:'cancelled' as const}));
  return {additions,changes,removed,unchanged};
}

/** Last month through four future months, Europe/London calendar dates (month precision). */
export function calendarSyncWindow(now=new Date()) {
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit'}).formatToParts(now);
  const year=Number(parts.find(p=>p.type==='year')?.value);
  const month=Number(parts.find(p=>p.type==='month')?.value);
  const from=new Date(Date.UTC(year,month-2,1));
  const through=new Date(Date.UTC(year,month+4,1));
  return {from:from.toISOString(),through:through.toISOString()};
}
