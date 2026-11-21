/** Read-only impact analysis. This never rewrites calendar sessions. */
import { projectSeriesRecord } from './scheduleSeries.ts';
import type { SeriesRule } from './scheduleSeries.ts';
import type { ScheduleRecord } from './scheduleModel.ts';
export function calculateSeriesImpact(
  records: readonly ScheduleRecord[],
  rules: readonly SeriesRule[],
  candidate: SeriesRule,
) {
  const relevant = records.filter((r) => {
    if (
      r.recordType !== 'class-session' ||
      r.classId !== candidate.classId ||
      r.institution !== candidate.institution ||
      !r.date
    )
      return false;
    // Existing weekday rules can make a session's visible date differ from its
    // stored date. Scope a new change using the visible date teachers saw.
    const before = projectSeriesRecord(r, rules);
    return (
      !!before.date &&
      before.date >= candidate.effectiveFrom &&
      (!candidate.effectiveUntil || before.date <= candidate.effectiveUntil)
    );
  });
  const changed: string[] = [];
  const protectedSessions: string[] = [];
  for (const r of relevant) {
    const before = projectSeriesRecord(r, rules);
    const after = projectSeriesRecord(r, [...rules, candidate]);
    const differences = Object.keys(candidate.changes).filter((k) =>
      k === 'weekday' ? before.date !== after.date : (before as any)[k] !== (after as any)[k],
    );
    if (differences.length) changed.push(r.id);
    else if (
      Object.keys(candidate.changes).some((k) =>
        r.sessionOverrideFields?.includes(k === 'weekday' ? 'date' : k),
      )
    )
      protectedSessions.push(r.id);
  }
  const conflicts = rules
    .filter(
      (r) =>
        r.classId === candidate.classId &&
        r.institution === candidate.institution &&
        r.effectiveFrom >= candidate.effectiveFrom &&
        (!candidate.effectiveUntil || r.effectiveFrom <= candidate.effectiveUntil) &&
        Object.keys(candidate.changes).some(
          (k) => r.changes[k as keyof typeof r.changes] !== undefined,
        ),
    )
    .map((r) => ({
      effectiveFrom: r.effectiveFrom,
      effectiveUntil: r.effectiveUntil || null,
      changes: r.changes,
    }));
  return {
    totalSessions: relevant.length,
    changedCount: changed.length,
    changedSessionIds: changed,
    protectedCount: protectedSessions.length,
    protectedSessionIds: protectedSessions,
    overlappingRules: conflicts,
  };
}
