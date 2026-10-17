import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DirectoryDataMenu, StudentCardBadges } from '../src/DirectoryComponents';

afterEach(cleanup);

describe('Family Details student status badges', () => {
  it('shows Archived exactly once for archived students, even with an archived enrolment label', () => {
    const { container } = render(<StudentCardBadges archived activeEnrolmentCount={0} enrolmentStatus="Archived" />);
    expect(screen.getAllByText('Archived')).toHaveLength(1);
    expect(container.querySelectorAll('.reg-card-badges > span')).toHaveLength(1);
    expect(screen.queryByText('Registered')).toBeNull();
  });
  it('shows Registered and Enrolled for active learners', () => {
    render(<StudentCardBadges archived={false} activeEnrolmentCount={1} enrolmentStatus="Enrolled" />);
    expect(screen.getByText('Registered')).toBeTruthy();
    expect(screen.getByText('Enrolled')).toBeTruthy();
  });
  it('shows Registered and Not enrolled for students without enrolments', () => {
    render(<StudentCardBadges archived={false} activeEnrolmentCount={0} enrolmentStatus="Not enrolled" />);
    expect(screen.getByText('Not enrolled')).toBeTruthy();
    expect(screen.queryByText('Archived')).toBeNull();
  });
});

describe('Directory CSV actions', () => {
  it('uses a downward arrow for Import and upward arrow for Export', () => {
    render(<DirectoryDataMenu onImport={() => {}} onExport={() => {}} />);
    const importButton = screen.getByRole('button', { name: 'Import CSV' });
    const exportButton = screen.getByRole('button', { name: 'Export filtered CSV' });
    expect(within(importButton).getByTestId('import-arrow').classList.contains('lucide-download')).toBe(true);
    expect(within(exportButton).getByTestId('export-arrow').classList.contains('lucide-upload')).toBe(true);
  });
  it('dispatches only the requested CSV action and closes the menu', () => {
    const onImport = vi.fn(); const onExport = vi.fn();
    const { container } = render(<DirectoryDataMenu onImport={onImport} onExport={onExport} />);
    const details = container.querySelector('details')!;
    details.open = true;
    fireEvent.click(screen.getByRole('button', { name: 'Import CSV' }));
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onExport).not.toHaveBeenCalled();
    expect(details.hasAttribute('open')).toBe(false);
    details.open = true;
    fireEvent.click(screen.getByRole('button', { name: 'Export filtered CSV' }));
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(details.hasAttribute('open')).toBe(false);
  });
});
