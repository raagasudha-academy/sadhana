export type PracticeEntry = {
  id: string;
  studentId?: string;
  date: string;
  submittedAt?: string;
  updatedAt?: string;
  createdAt?: string;
  topic?: string;
  comments?: string;
  minutes?: number;
};
const submissionTime = (entry: PracticeEntry) =>
  String(entry.submittedAt || entry.updatedAt || entry.createdAt || entry.date || '');
export function newestPracticeFirst<T extends PracticeEntry>(entries: readonly T[]): T[] {
  return [...entries].sort(
    (a, b) =>
      submissionTime(b).localeCompare(submissionTime(a)) ||
      String(b.date || '').localeCompare(String(a.date || '')) ||
      a.id.localeCompare(b.id),
  );
}
export function filterPracticeEntries<T extends PracticeEntry>(
  entries: readonly T[],
  studentId: string,
  search: string,
): T[] {
  const q = search.trim().toLocaleLowerCase();
  const filtered = entries.filter(
    (p) =>
      (!studentId || p.studentId === studentId) &&
      (!q || `${p.date} ${p.topic || ''} ${p.comments || ''}`.toLocaleLowerCase().includes(q)),
  );
  return newestPracticeFirst(filtered);
}
export function practiceTotals(entries: readonly PracticeEntry[]) {
  return {
    entries: entries.length,
    minutes: entries.reduce(
      (sum, p) => sum + (Number.isFinite(Number(p.minutes)) ? Math.max(0, Number(p.minutes)) : 0),
      0,
    ),
    students: new Set(entries.map((p) => p.studentId)).size,
  };
}
