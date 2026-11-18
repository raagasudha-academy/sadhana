import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import WebsiteRegistrations from '../../../src/WebsiteRegistrations';

afterEach(cleanup);

it('shows learner count and location in the Raagasudha registration summary', async () => {
  const record = {
    registrationId: 'RS-SUMMARY-123',
    reviewStatus: 'pending',
    registrationType: 'adult-and-children',
    preferredLocationId: 'MIDDLESBROUGH',
    people: [{ personId: 'parent-1', fullName: 'Mohana Kamanooru' }],
    primaryContactPersonId: 'parent-1',
    students: [
      { personId: 'learner-1', preferredLocationId: 'NEWCASTLE' },
      { personId: 'learner-2', preferredLocationId: 'NEWCASTLE' },
    ],
  };
  const api = {
    listWebsiteRegistrations: vi.fn().mockResolvedValue({ registrations: [record] }),
    getWebsiteRegistration: vi.fn().mockResolvedValue(record),
  };

  render(<WebsiteRegistrations cloud={{ api } as any} />);
  fireEvent.click(await screen.findByRole('button', { name: /Mohana Kamanooru/ }));

  const summary = await screen.findByText('Learners').then((label) => label.parentElement!);
  expect(within(summary).getByText('2')).toBeTruthy();
  const location = await screen.findByText('Location');
  expect(location.parentElement?.textContent).toContain('MIDDLESBROUGH');
});

it('falls back to a learner location when the registration has none', async () => {
  const record = {
    registrationId: 'RS-SUMMARY-456',
    reviewStatus: 'pending',
    people: [{ personId: 'parent-1', fullName: 'Test Parent' }],
    primaryContactPersonId: 'parent-1',
    students: [{ personId: 'learner-1', preferredLocationId: 'NEWCASTLE' }],
  };
  const api = {
    listWebsiteRegistrations: vi.fn().mockResolvedValue({ registrations: [record] }),
    getWebsiteRegistration: vi.fn().mockResolvedValue(record),
  };

  render(<WebsiteRegistrations cloud={{ api } as any} />);
  fireEvent.click(await screen.findByRole('button', { name: /Test Parent/ }));

  const location = await screen.findByText('Location');
  expect(location.parentElement?.textContent).toContain('NEWCASTLE');
});

it('keeps the approval, import, and invitation stages visible for a pending application', async () => {
  const record = {
    registrationId: 'RS-PENDING-123',
    reviewStatus: 'pending',
    registrationType: 'child',
    primaryContactPersonId: 'parent-1',
    people: [{ personId: 'parent-1', fullName: 'Test Parent', email: 'parent@example.org' }],
    students: [{ personId: 'learner-1' }],
  };
  const api = {
    listWebsiteRegistrations: vi.fn().mockResolvedValue({ registrations: [record] }),
    getWebsiteRegistration: vi.fn().mockResolvedValue(record),
  };

  render(<WebsiteRegistrations cloud={{ api } as any} />);
  fireEvent.click(await screen.findByRole('button', { name: /Test Parent/ }));

  const progress = await screen.findByRole('group', { name: 'Registration progress' });
  expect(within(progress).getByRole('button', { name: 'Approve application' }).disabled).toBe(
    false,
  );
  expect(within(progress).getByRole('button', { name: 'Import to Sadhana' }).disabled).toBe(true);
  expect(within(progress).getByRole('button', { name: 'Send parent invitation' }).disabled).toBe(
    true,
  );
});

it('shows the approved, imported, and parent-account stages for an imported registration', async () => {
  const record = {
    registrationId: 'RS-SUMMARY-789',
    reviewStatus: 'approved',
    sadhanaImport: { status: 'imported' },
    primaryContactPersonId: 'parent-1',
    people: [{ personId: 'parent-1', fullName: 'Test Parent', email: 'parent@example.org' }],
    students: [{ personId: 'learner-1' }],
  };
  const api = {
    listWebsiteRegistrations: vi.fn().mockResolvedValue({ registrations: [record] }),
    getWebsiteRegistration: vi.fn().mockResolvedValue(record),
    getParentAccessStatus: vi.fn().mockResolvedValue({
      registrationId: record.registrationId,
      imported: true,
      status: 'ACCOUNT_FOUND',
      email: 'parent@example.org',
      updatedAt: null,
    }),
  };

  render(<WebsiteRegistrations cloud={{ api } as any} />);
  fireEvent.click(await screen.findByRole('button', { name: /Test Parent/ }));

  const progress = await screen.findByRole('group', { name: 'Registration progress' });
  expect(await within(progress).findByText('Account already exists')).toBeTruthy();
  expect(within(progress).getByRole('button', { name: '✓ Approved' }).disabled).toBe(true);
  expect(within(progress).getByRole('button', { name: '✓ Imported to Sadhana' }).disabled).toBe(
    true,
  );
  expect(within(progress).getByRole('button', { name: 'Account already exists' }).disabled).toBe(
    true,
  );
  expect(await screen.findByText('parent@example.org')).toBeTruthy();
});
