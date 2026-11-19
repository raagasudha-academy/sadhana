import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compactSource } from '../../sourceText';
const teacher = readFileSync('app/src/TeacherWorkspace.tsx', 'utf8');
const materials = readFileSync('app/src/HomeworkMaterials.tsx', 'utf8');
const media = compactSource(readFileSync('backend/src/homeworkMediaPolicy.ts', 'utf8'));
describe('v13.6.1 homework scope regression', () => {
  it('keeps upload controls in the teacher form without published-card materials panel', () => {
    expect(teacher).toContain('Attachments · {homeworkAttachmentCount}/4');
    expect(teacher.indexOf('Attachments · {homeworkAttachmentCount}/4')).toBeLessThan(
      teacher.indexOf('Publish homework'),
    );
    expect(teacher).toContain('multiple');
    expect(teacher).toContain('Add attachments');
    expect(teacher).not.toContain('<TeacherHomeworkMaterials');
  });
  it('does not offer document upload', () => {
    expect(materials).not.toContain('Document (soon)');
    expect(teacher).not.toContain('accept="application/pdf"');
  });
  it('retains the four-file attachment limit and per-file type/size policy', () => {
    expect(media).toContain('5_000_000');
    expect(media).toContain('image/jpeg');
    expect(media).toContain('image/png');
    expect(media).toContain('image/webp');
    expect(media).toContain(compactSource('mimes.length > 4'));
    expect(media).toContain(compactSource('mimes.length > 4'));
    expect(media).toContain("'video/mp4'");
    expect(media).toContain("'audio/mp4'");
    expect(compactSource(teacher)).toContain('setEditingHomework({id,version})');
  });
  it('locks homework feedback after review and labels the action Reviewed', () => {
    expect(teacher).toContain('row.reviewedAt');
    expect(teacher).toContain("'Reviewed'");
    expect(teacher).toContain('is-reviewed');
  });
});
