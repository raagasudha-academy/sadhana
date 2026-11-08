/** Shared frontend types. Institutional academic records are always scoped to an institution. */
export type InstitutionId = 'raaga' | 'sruti';
export type WorkspaceId = InstitutionId | 'combined';
export type DeliveryMode = 'Online' | 'In Person';
export type RegistrationType = 'family' | 'independent';
export type EnrolmentStatus = 'Active' | 'Upcoming' | 'Archived';
export type PracticeStatus = 'Active' | 'Voided';
export type NoteStatus = 'Pending' | 'In Progress' | 'Completed';
export type ISODate = string; // YYYY-MM-DD, validated at persistence boundary.
export type E164Phone = string; // +<country code><national number>, validated at persistence boundary.

export interface FamilyRecord {
  id: string;
  parentName: string;
  phone: E164Phone;
  createdIn: InstitutionId;
  archived?: boolean;
}
export interface StudentRecord {
  id: string;
  name: string;
  familyId: string;
  phone?: E164Phone;
  registrationType?: RegistrationType;
  adultConfirmed?: boolean;
  createdIn?: InstitutionId;
  archived?: boolean;
}
export interface ClassRecord {
  id: string;
  institution: InstitutionId;
  name: string;
  teacher: string;
  teacherUserId?: string;
  day: number;  // Sunday=0 ... Saturday=6 in Europe/London
  time: string; // UK local HH:mm
  duration: number;
  mode: DeliveryMode;
  venue: string;
  venueId?: string;
  startDate: ISODate;
  endDate: ISODate | '';
  archived?: boolean;
  studentCount?: number;
  rate?: number;
  submission?: number;
  status?: string;
}
export interface VenueRecord {
  id: string;
  name: string;
  location: string;
  address: string;
  linked?: number;
}
export interface EnrolmentRecord {
  id: string;
  institution: InstitutionId;
  studentId: string;
  classId: string;
  startDate: ISODate;
  endDate: ISODate | '';
  archived?: boolean;
}
export interface PracticeHistory {
  action: string;
  at: string;
  reason?: string;
  previous?: { date?: ISODate; minutes: number; didPractice: boolean; comments?: string };
}
export interface PracticeRecord {
  id: string;
  institution: InstitutionId;
  studentId: string;
  date: ISODate;
  didPractice: boolean;
  minutes: number;
  comments: string;
  reason: string;
  source: string;
  status: PracticeStatus;
  history: PracticeHistory[];
}
export interface StudentSummary {
  id: string;
  institution: InstitutionId;
  name: string;
  initials: string;
  status: EnrolmentStatus;
  classId: string;
  practice: number | null;
  submission: number | null;
  minutes: number;
  contact: string;
  missingDays?: number;
  notes: { by: string; date: string; text: string; status: NoteStatus }[];
}
export interface PracticeReport {
  expected: number;
  submitted: number;
  practised: number;
  missing: number;
  minutes: number;
  practiceRate: number | null;
  submissionRate: number | null;
  notPractised?: number;
  entries?: number;
}
