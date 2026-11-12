export function matchingCognitoPerson(
  rows: Record<string, any>[],
  subject: string,
  institution: string,
): Record<string, any> | null;
export function authorisedStudent(
  actor: Record<string, any> | null,
  student: Record<string, any> | null,
  links: Record<string, any>[],
  institution: string,
): { kind: string; studentId: string };
export function projectLearnerDashboard(
  student: Record<string, any>,
  enrolments: Record<string, any>[],
  classes: Record<string, any>[],
  sessions: Record<string, any>[],
  practice: Record<string, any>[],
  attendance: Record<string, any>[],
  rsvps: Record<string, any>[],
  referenceDate: string,
  institution?: string,
): Record<string, any>;
export function buildReadinessReport(input: {
  counts: Record<string, number>;
  requiredTables: string[];
  actualTables: string[];
  checks?: Record<string, boolean>;
}): {
  schema: number;
  readOnly: boolean;
  canExecute: boolean;
  checks: Record<string, boolean>;
  tableCount: number;
  counts: Record<string, number>;
  blockers: string[];
  blockerCount: number;
  fullCutoverReady: boolean;
};
