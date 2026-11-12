export type FinalBoundaryResult = { status: number; error: string } | null;
export function finalOnlyGate(
  parts: string[],
  method: string,
  phase?: 'early' | 'fallback',
  env?: Record<string, string | undefined>,
): FinalBoundaryResult;
