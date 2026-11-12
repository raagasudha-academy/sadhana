import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import SrutiWebsiteRegistrations from '../../../src/SrutiWebsiteRegistrations';
afterEach(cleanup);
it('imports an approved application with a short confirmation and no identity file', async () => {
  const record = {
    registrationId: 'SR-TEST-123',
    institutionId: 'sruti',
    reviewStatus: 'approved',
    importStatus: 'pending',
    version: 1,
    submission: {
      guardian: { firstName: 'Mohana', lastName: 'Kamanooru', email: 'parent@example.org' },
      students: [{ firstName: 'Child', lastName: 'One' }],
    },
  };
  const api = {
    listSrutiWebsiteRegistrations: vi.fn().mockResolvedValue({ records: [record] }),
    getSrutiWebsiteRegistration: vi.fn().mockResolvedValue({ record, reviewAvailable: true }),
    previewSrutiNewFamilyImport: vi.fn().mockResolvedValue({
      registrationId: record.registrationId,
      readyForExecute: true,
      importWritesEnabled: true,
      studentCount: 1,
    }),
    executeSrutiNewFamilyImport: vi
      .fn()
      .mockResolvedValue({ imported: true, studentIds: ['student-1'] }),
  };
  render(<SrutiWebsiteRegistrations cloud={{ api } as any} />);
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'all' } });
  fireEvent.click(await screen.findByText(record.registrationId));
  fireEvent.click(await screen.findByRole('button', { name: 'Import to Sadhana' }));
  const dialog = await screen.findByRole('alertdialog');
  expect(within(dialog).queryByRole('textbox')).toBeNull();
  expect(within(dialog).queryByRole('checkbox')).toBeNull();
  expect(screen.queryByText('Link learners already in Sadhana')).toBeNull();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm import' }));
  await screen.findByText(/Imported into Sadhana/);
  expect(api.executeSrutiNewFamilyImport).toHaveBeenCalledWith(
    record.registrationId,
    record.registrationId,
  );
});
it.each([
  ['pending', 'pending', 'NOT_INVITED', false, true, true],
  ['approved', 'pending', 'NOT_INVITED', true, false, true],
  ['approved', 'imported', 'NOT_INVITED', true, true, false],
  ['approved', 'imported', 'INVITATION_SENT', true, true, true],
])(
  'enables only the next stage for %s / %s / %s',
  async (reviewStatus, importStatus, status, approvalDisabled, importDisabled, inviteDisabled) => {
    const record = {
      registrationId: 'SR-STAGES',
      institutionId: 'sruti',
      reviewStatus,
      importStatus,
      version: 1,
      submission: { guardian: { firstName: 'Parent' }, students: [] },
    };
    const api = {
      listSrutiWebsiteRegistrations: vi.fn().mockResolvedValue({ records: [record] }),
      getSrutiWebsiteRegistration: vi.fn().mockResolvedValue({ record, reviewAvailable: true }),
      getSrutiParentAccessStatus: vi
        .fn()
        .mockResolvedValue({ status, email: 'parent@example.org' }),
    };
    render(<SrutiWebsiteRegistrations cloud={{ api } as any} />);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'all' } });
    fireEvent.click(await screen.findByText(record.registrationId));
    const row = await screen.findByRole('group', { name: 'Registration stages' });
    if (importStatus === 'imported') await screen.findByText('parent@example.org');
    const buttons = within(row).getAllByRole('button') as HTMLButtonElement[];
    expect(buttons).toHaveLength(3);
    expect(buttons.map((button) => button.disabled)).toEqual([
      approvalDisabled,
      importDisabled,
      inviteDisabled,
    ]);
  },
);
