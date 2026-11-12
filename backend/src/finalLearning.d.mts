import type { RouteContext, JsonResponse } from './routes/http.ts';
export function finalLearningRoute(
  context: RouteContext,
  deps: {
    assertConfigured: () => void;
    parse: (event: RouteContext['event']) => Record<string, unknown>;
    learner: () => ReturnType<typeof import('./finalLearner.ts').m9FinalLearner>;
    learnerWrites: () => ReturnType<typeof import('./learnerWrites.ts').m9LearnerWrites>;
    homework: () => ReturnType<typeof import('./legacyHomework.ts').m9Homework>;
    teacherPractice: (context: RouteContext) => Promise<JsonResponse | undefined>;
  },
  env?: Record<string, string | undefined>,
): Promise<{ status: number; body: unknown } | undefined>;
