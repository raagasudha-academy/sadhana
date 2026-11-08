import { describe, expect, it } from 'vitest';
import { learnerPageMap, learnerSectionMap } from '../../../src/app/learnerNavigation';

describe('student sidebar mappings', () => {
  it('keeps all student subsections attached to their sidebar parents', () => {
    expect(learnerSectionMap.calendar).toBe('My classes');
    expect(learnerSectionMap.attendance).toBe('My classes');
    expect(learnerSectionMap.practice).toBe('My learning');
    expect(learnerSectionMap.privacy).toBe('My profile');
  });
  it('preserves default student pages and round trips', () => {
    for (const [sidebar, page] of Object.entries(learnerPageMap)) {
      expect(learnerSectionMap[page]).toBe(sidebar);
    }
  });
});
