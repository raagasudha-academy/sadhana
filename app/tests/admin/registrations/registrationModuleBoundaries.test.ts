import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), 'app', relativePath), 'utf8');

describe('registration feature boundaries', () => {
  it('retains the stable RegistrationModule entrypoint and delegated views', () => {
    const entry = source('src/RegistrationModule.tsx');
    expect(entry).toContain('export default function RegistrationModule');
    for (const module of [
      'registrationShared',
      'registrationForms',
      'registrationEnrolment',
      'registrationFamilies',
      'registrationStudents',
    ]) {
      expect(entry).toContain(`from './features/registration/${module}'`);
    }
  });

  it('preserves creation, enrolment and family edit components', () => {
    expect(source('src/features/registration/registrationForms.tsx')).toContain(
      'export function RegisterFamily',
    );
    expect(source('src/features/registration/registrationForms.tsx')).toContain(
      'export function RegisterIndependent',
    );
    expect(source('src/features/registration/registrationEnrolment.tsx')).toContain(
      'export function EnrolModal',
    );
    expect(source('src/features/registration/registrationFamilies.tsx')).toContain(
      'export function FamilyDetail',
    );
    expect(source('src/features/registration/registrationStudents.tsx')).toContain(
      'export function StudentRecord',
    );
  });
});
