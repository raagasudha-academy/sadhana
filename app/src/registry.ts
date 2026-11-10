import type { FamilyRecord,StudentRecord,EnrolmentRecord,EnrolmentStatus } from './types';

/** Start clean. Registration CRUD is not yet connected to DynamoDB. */
export const initialFamilies: FamilyRecord[] = [];
export const initialMembers: StudentRecord[] = [];
export const initialEnrolments: EnrolmentRecord[] = [];

export const ukISODate = () => {
  const p = new Intl.DateTimeFormat('en-GB', {timeZone: 'Europe/London', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(new Date());
  const d = Object.fromEntries(p.map(x => [x.type, x.value]));
  return `${d.year}-${d.month}-${d.day}`;
};
export const getEnrolmentStatus = (e: EnrolmentRecord, today = ukISODate()): EnrolmentStatus => e.archived ? 'Archived' : e.startDate > today ? 'Upcoming' : e.endDate && e.endDate < today ? 'Archived' : 'Active';
export const newId = (prefix: string, rows: Array<{id:string}>) => {
  const biggest = rows.reduce((m, r) => Math.max(m, Number(r.id?.match(/(\d+)$/)?.[1] ?? 0)), 0);
  return `${prefix}-${String(biggest + 1).padStart(4, '0')}`;
};
export const maskPhone = (phone?: string) => phone ? `•••• ${phone.replace(/\D/g, '').slice(-4)}` : 'Not recorded';
