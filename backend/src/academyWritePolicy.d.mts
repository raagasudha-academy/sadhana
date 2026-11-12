export type M10AcademyEntity = 'classes' | 'venues';
export function validateM10AcademyWrite(
  entity: M10AcademyEntity,
  operation: 'create' | 'update',
  body: Record<string, unknown>,
  institution: 'raaga' | 'sruti',
): Record<string, unknown>;
