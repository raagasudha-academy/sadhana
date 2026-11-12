export function validatePractice(
  body: unknown,
  withinWindow: (date: string) => boolean,
): {
  classId: string;
  date: string;
  minutes: number;
  topic: string;
  comments: string;
  expectedVersion?: number;
};
export function validateRsvp(body: unknown): { sessionId: string; intention: string };
export function isActiveEnrolment(
  e: any,
  institution: string,
  studentId: string,
  classId: string,
  date: string,
): boolean;
export function canRsvp(session: any, today: string, clock: string): boolean;
