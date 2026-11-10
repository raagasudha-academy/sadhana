/** Minimal, explicit archive mutation. No client-side rewriting of identity fields. */
export type ArchiveKind = 'family' | 'student';
export type ArchiveRecord = { id: string; version: number; archived?: boolean; [key: string]: unknown };
export type ArchiveUpdater = (kind: ArchiveKind, workspace: string, id: string, changes: { archived: boolean }, version: number) => Promise<unknown>;

export async function persistArchiveState(
  update: ArchiveUpdater,
  kind: ArchiveKind,
  workspace: string,
  record: ArchiveRecord,
  restore: boolean,
): Promise<void> {
  if (!record?.id || !Number.isFinite(record.version)) throw new Error('Cannot update record without an ID and version.');
  if (kind !== 'family' && kind !== 'student') throw new Error('Unsupported record type.');
  // Only the archive flag may be patched; identity, roll number, family links and history are untouched.
  await update(kind, workspace, record.id, { archived: !restore }, record.version);
}
