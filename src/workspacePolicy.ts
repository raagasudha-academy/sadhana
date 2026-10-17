/** Pure workspace and timetable visibility rules for the Sadhana portal. */
import type { InstitutionId } from './types';
import type { ScheduleInstitution, ScheduleRecord } from './api/sadhanaClient';

export const adminPages = [
  'Dashboard', 'Families & Students', 'Classes & Timetable',
  'Practice & Reports', 'Communications', 'Teachers', 'Administrators', 'Venues', 'Settings',
] as const;

export function needsAcademySelection(workspace:string,page:string):boolean {
  return workspace==='combined' && [
    'Families & Students','Practice & Reports','Communications','Settings',
  ].includes(page);
}

export function calendarScopes(workspace:string,authorised:readonly InstitutionId[]):ScheduleInstitution[] {
  const permitted=authorised.filter((inst):inst is InstitutionId=>inst==='raaga'||inst==='sruti');
  const selected=workspace==='combined'?permitted:permitted.filter(inst=>inst===workspace);
  return selected.length?[...selected,'shared']:[];
}

/** Never render a timetable row outside the selected academy (plus shared, non-class events).
 * A mismatched backend row is discarded even if returned in an unexpected partition.
 */
export function filterCalendarResponses(
  responses:readonly {institution:ScheduleInstitution;records:ScheduleRecord[]}[],
  workspace:string,authorised:readonly InstitutionId[]
):ScheduleRecord[] {
  const accepted=new Set(calendarScopes(workspace,authorised));
  return responses.flatMap(response=>{
    if(!accepted.has(response.institution))return [];
    return (response.records||[]).filter(record=>
      record.institution===response.institution &&
      (record.institution!=='shared'||record.recordType==='holiday'||record.recordType==='special-event')
    );
  });
}
