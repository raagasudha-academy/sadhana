export type M10DirectoryEntity = 'students' | 'families' | 'enrolments';
export function projectM10Directory(
  entity: M10DirectoryEntity,
  items: Record<string, any>[],
  institution: 'raaga' | 'sruti',
  people?: Record<string, any>[],
): { records: Record<string, any>[]; more: false };
