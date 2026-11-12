import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compactSource } from '../../sourceText';

const read = (p: string) => readFileSync(new URL('../../../../' + p, import.meta.url), 'utf8');

describe('image-only homework scope', () => {
  it('supports three images and blocks new video/audio', () => {
    const m = compactSource(read('backend/src/homeworkMediaPolicy.ts'));
    expect(m).toContain(compactSource('mimes.length <= 3'));
    expect(m).not.toContain("'video/mp4':");
    expect(m).not.toContain("'audio/mpeg':");
  });

  it('renders teacher/student images inline', () => {
    expect(read('app/src/HomeworkMaterials.tsx')).toContain('sadhana-homework-image');
    expect(read('app/src/features/learning/StudentHomework.tsx')).toContain(
      'Submitted homework image',
    );
  });

  it('preserves one homework identity on republish', () => {
    const s = compactSource(read('backend/src/homework.ts'));
    expect(s).toContain(compactSource('SK: `ITEM#${homeworkId}`'));
    expect(s).toContain(compactSource('id: homeworkId'));
  });
});
