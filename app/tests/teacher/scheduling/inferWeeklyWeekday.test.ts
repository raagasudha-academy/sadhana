import { describe, expect, it } from 'vitest';
import { inferWeeklyWeekday } from '../../../src/inferWeeklyWeekday';

describe('legacy class weekday inference', () => {
  it('infers a weekly weekday from at least three matching session dates', () => {
    expect(inferWeeklyWeekday(['2026-11-06', '2026-11-13', '2026-11-20'])).toEqual({
      frequency: 'weekly',
      interval: 1,
      weekdays: [5],
    });
  });

  it('does not infer from too few dates or inconsistent weekdays', () => {
    expect(inferWeeklyWeekday(['2026-11-06', '2026-11-13'])).toBeUndefined();
    expect(inferWeeklyWeekday(['2026-11-06', '2026-11-13', '2026-11-21'])).toBeUndefined();
  });
});
