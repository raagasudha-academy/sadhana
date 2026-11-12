import type { RouteContext } from './routes/http.ts';
import type { CanonicalReadDependencies, CanonicalAccess } from './finalReadRoutes.mjs';
export type OperationsDependencies = CanonicalReadDependencies & {
  teacherEnrolments: (
    institution: 'raaga' | 'sruti',
    assignedClassIds: ReadonlySet<string>,
  ) => Promise<{ records: Array<Record<string, unknown>> }>;
  attendance: (
    institution: 'raaga' | 'sruti',
    assignedClassIds?: ReadonlySet<string>,
    teacherId?: string,
  ) => Promise<{ records: Array<Record<string, unknown>> }>;
  feedback: {
    list: (
      institution: 'raaga' | 'sruti',
      assignedClassIds?: ReadonlySet<string>,
    ) => Promise<{ records: Array<Record<string, unknown>> }>;
    get: (institution: 'raaga' | 'sruti', id: string) => Promise<Record<string, unknown> | null>;
    save: (
      institution: 'raaga' | 'sruti',
      actor: string,
      data: Record<string, unknown>,
      existingId?: string,
    ) => Promise<{ record: Record<string, unknown> }>;
  };
  history: (
    kind: 'rsvp' | 'practice',
    institution: 'raaga' | 'sruti',
    assignedClassIds?: ReadonlySet<string>,
    teacherId?: string,
  ) => Promise<{ records: Array<Record<string, unknown>> }>;
  teacherStudents: (
    institution: 'raaga' | 'sruti',
    assignedClassIds: ReadonlySet<string>,
  ) => Promise<Array<{ id: string; name: string; rollNumber: string; institution: string }>>;
};
export function finalOperationsRoute(
  context: RouteContext,
  readers: OperationsDependencies,
  access: CanonicalAccess,
  env?: Record<string, string | undefined>,
): Promise<{ status: number; body: unknown } | undefined>;
