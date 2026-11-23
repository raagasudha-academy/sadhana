/** Pure, read-only directory selectors. Never mutate persisted records. */
export type SortColumn = 'roll' | 'name' | 'created';
export type SortDirection = 'asc' | 'desc';
export type DirectoryStudent = {
  id: string;
  name?: string;
  createdAt?: string;
  [key: string]: unknown;
};

export function filterStudentsByLocation<T>(
  rows: readonly T[],
  location: string,
  getLocation: (row: T) => string,
): T[] {
  if (location === 'All') return [...rows];
  return rows.filter(
    (row) =>
      String(getLocation(row) ?? '')
        .trim()
        .toLocaleLowerCase() === location.trim().toLocaleLowerCase(),
  );
}

export function sortDirectoryStudents<T extends DirectoryStudent>(
  rows: readonly T[],
  column: SortColumn,
  direction: SortDirection,
  getRoll: (row: T) => string,
): T[] {
  const factor = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const compared =
      column === 'created'
        ? (Date.parse(String(a.createdAt || '')) || 0) -
          (Date.parse(String(b.createdAt || '')) || 0)
        : column === 'roll'
          ? String(getRoll(a)).localeCompare(String(getRoll(b)), undefined, {
              numeric: true,
              sensitivity: 'base',
            })
          : String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, {
              sensitivity: 'base',
            });
    return (compared || String(a.id).localeCompare(String(b.id))) * factor;
  });
}

export function filterFamiliesByLocation<T>(
  rows: readonly T[],
  location: string,
  getLocation: (row: T) => string,
): T[] {
  return filterStudentsByLocation(rows, location, getLocation);
}
