import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PracticeReview from '../../../src/PracticeReview';

afterEach(() => cleanup());

describe('teacher practice audio review', () => {
  it('loads and exposes a practice recording in the assigned class review panel', async () => {
    const teacherPracticeComments = vi.fn().mockResolvedValue({ records: [] });
    const teacherPracticeMedia = vi.fn().mockResolvedValue({
      records: [
        {
          id: 'MEDIA-1',
          mime: 'audio/mpeg',
          createdAt: '2026-11-08T10:00:00Z',
          url: 'https://private.example/audio.mp3?signature=short-lived',
        },
      ],
    });
    const cloud = {
      api: { teacherPracticeComments, teacherPracticeMedia, addTeacherPracticeComment: vi.fn() },
    } as any;
    render(
      <PracticeReview
        cloud={cloud}
        workspace="raaga"
        entries={[
          {
            id: 'PRACTICE-1',
            studentId: 'STUDENT-1',
            classId: 'CLASS-1',
            date: '2026-11-08',
            topic: 'Alapana',
            minutes: 20,
          },
        ]}
        students={[{ id: 'STUDENT-1', name: 'Student One' }]}
        onReload={async () => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    const player = await screen.findByLabelText('Practice audio for Student One on 2026-11-08');
    expect(player.tagName).toBe('AUDIO');
    expect((player as HTMLAudioElement).src).toContain('audio.mp3');
    expect(teacherPracticeMedia).toHaveBeenCalledWith('raaga', 'PRACTICE-1');
  });
});
