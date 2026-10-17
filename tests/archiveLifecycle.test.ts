import { describe, expect, it, vi } from 'vitest';
import { persistArchiveState } from '../src/archiveLifecycle';
const record = Object.freeze({ id: 'student-1', version: 7, rollNumber: 'RS-0021', familyId: 'family-1', archived: false });

describe('archive/restore persistence contract', () => {
  it('archives by changing only archived, using record id/version', async () => {
    const update = vi.fn().mockResolvedValue({});
    await persistArchiveState(update, 'student', 'sruti', record, false);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith('student', 'sruti', 'student-1', { archived: true }, 7);
  });
  it('restores by changing only archived, retaining permanent identity', async () => {
    const update = vi.fn().mockResolvedValue({});
    await persistArchiveState(update, 'student', 'sruti', { ...record, archived: true }, true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith('student', 'sruti', 'student-1', { archived: false }, 7);
    expect(record.rollNumber).toBe('RS-0021');
    expect(record.familyId).toBe('family-1');
  });
  it('does not create records during repeated archive/restore operations', async () => {
    const update = vi.fn().mockResolvedValue({});
    await persistArchiveState(update, 'student', 'sruti', record, false);
    await persistArchiveState(update, 'student', 'sruti', record, true);
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls.every(call => Object.keys(call[3]).join() === 'archived')).toBe(true);
  });
  it('supports family archive while leaving student links untouched', async () => {
    const update = vi.fn().mockResolvedValue({});
    await persistArchiveState(update, 'family', 'raagasudha', { id: 'family-1', version: 3, studentIds: ['student-1'] }, false);
    expect(update).toHaveBeenCalledWith('family', 'raagasudha', 'family-1', { archived: true }, 3);
  });
  it('propagates write failures rather than reporting success', async () => {
    const update = vi.fn().mockRejectedValue(new Error('DynamoDB conflict'));
    await expect(persistArchiveState(update, 'student', 'sruti', record, false)).rejects.toThrow('DynamoDB conflict');
  });
  it('refuses malformed records before issuing a write', async () => {
    const update = vi.fn();
    await expect(persistArchiveState(update, 'student', 'sruti', { id: '', version: 0 }, false)).rejects.toThrow();
    await expect(persistArchiveState(update, 'student', 'sruti', { id: 'x', version: NaN }, false)).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });
});
