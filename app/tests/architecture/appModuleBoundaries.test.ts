import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), 'app', relativePath), 'utf8');

describe('application shell module boundaries', () => {
  it('keeps App as the single root shell and routes through feature modules', () => {
    const app = source('src/App.tsx');
    expect(app).toContain('export default function App');
    for (const moduleName of ['AppOverview', 'AppTimetable', 'AppRecords', 'AppDrawers']) {
      expect(app).toContain(`./app/${moduleName}`);
    }
    expect(app).toContain('learnerNavigation');
    expect(app).toContain('switchToStudent');
    expect(app).toContain('setChosenStudent');
  });

  it('keeps managed events and timetable logic separate', () => {
    const timetable = source('src/app/AppTimetable.tsx');
    const events = source('src/app/AppManagedEvents.tsx');
    expect(timetable).toContain('export function Timetable');
    expect(timetable).toContain('ManagedEvents');
    expect(events).toContain('export function ManagedEvents');
  });

  it('preserves scheduling correction and session deletion workflows', () => {
    const drawers = source('src/app/AppDrawers.tsx');
    expect(drawers).toContain('export function SessionDrawer');
    expect(drawers).toContain('sadhanaConfirmDialog');
    expect(drawers).toContain('deleteFuture');
    expect(drawers).toContain('deleteOne');
  });

  it('keeps visual and policy boundaries intact', () => {
    const app = source('src/App.tsx');
    expect(app).toContain("import './sharedShell.css'");
    expect(app).toContain('needsAcademySelection');
    expect(source('src/app/learnerNavigation.ts')).toContain('learnerSectionMap');
    expect(source('src/app/AppDrawers.tsx')).toContain('StaffPortrait');
    expect(source('src/app/AppRecords.tsx')).toContain('ProfileScreen');
  });
});
