import { describe, expect, it } from 'vitest';
import { getEnrolmentStatus, maskPhone } from '../src/registry';

describe('enrolment status regression', () => {
  const base = { archived: false, startDate: '2026-01-01', endDate: '' };
  it('shows archived records as Archived', () => {
    expect(getEnrolmentStatus({ ...base, archived: true } as never, '2026-10-22')).toBe('Archived');
  });
  it('shows future starts as Upcoming', () => {
    expect(getEnrolmentStatus({ ...base, startDate: '2026-12-01' } as never, '2026-10-22')).toBe('Upcoming');
  });
  it('shows active enrolments as Active', () => {
    expect(getEnrolmentStatus(base as never, '2026-10-22')).toBe('Active');
  });
  it('shows ended enrolments as Archived', () => {
    expect(getEnrolmentStatus({ ...base, endDate: '2026-08-31' } as never, '2026-10-22')).toBe('Archived');
  });
});

describe('privacy helpers', () => {
  it('masks the phone except the last four digits', () => {
    expect(maskPhone('+447700900123')).toBe('•••• 0123');
  });
});
