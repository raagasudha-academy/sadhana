/** Display-only integrity hints for live class and dated-session records.
 * No writes, permissions, or historical session changes.
 */
export interface ScheduleAttentionRecord {
  recordType?: string;
  name?: string;
  programme?: string;
  teacher?: string;
  teacherId?: string;
  mode?: string;
  venueId?: string;
  location?: string;
  startTime?: string;
  endTime?: string;
}

const missing = (value?: string) => !value?.trim();

export function scheduleAttentionIssues(
  record: ScheduleAttentionRecord,
  knownVenueIds?: ReadonlySet<string>,
): string[] {
  // Special events and holidays do not require teacher identity links.
  if (record.recordType !== 'class' && record.recordType !== 'class-session') return [];
  const issues: string[] = [];
  if (missing(record.name)) issues.push('Class name is missing');
  if (missing(record.programme)) issues.push('Programme is missing');
  if (missing(record.teacher)) issues.push('Teacher is not assigned');
  else if (record.recordType === 'class' && missing(record.teacherId)) issues.push('Teacher is not linked to the Teacher Registry');
  if (missing(record.mode)) issues.push('Delivery mode is missing');
  const mode = (record.mode || '').trim().toLowerCase();
  const inPerson = /in[ -]?person|onsite|on-site/.test(mode);
  if (inPerson) {
    if (missing(record.location) && missing(record.venueId)) issues.push('Venue is missing');
    else if (missing(record.venueId)) issues.push('Venue is not linked to the Venue Directory');
    else if (knownVenueIds && !knownVenueIds.has(record.venueId!)) issues.push('Linked venue is not in the Venue Directory');
  } else if (mode && mode !== 'online' && missing(record.location)) {
    issues.push('Location is missing');
  }
  if (missing(record.startTime) || missing(record.endTime)) issues.push('Class time is incomplete');
  return issues;
}
