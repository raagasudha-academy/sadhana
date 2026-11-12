import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const component = readFileSync('app/src/features/learning/StudentAcademy.tsx', 'utf8');
const controller = readFileSync('app/src/features/learning/useStudentPortalController.ts', 'utf8');
const compact = (value) => value.replace(/\s+/g, '');

test('single people directory labels each academy role', () => {
  assert.match(component, /function ApprovedAcademiesStaffDirectory/);
  assert.match(component, /<span className="sv1396c-eyebrow">ACADEMY DIRECTORY<\/span>/);
  assert.match(compact(component), />Teachers<\/button>/);
  assert.match(compact(component), />Directors\/Admin<\/button>/);
  assert.match(component, /Teacher/);
  assert.match(component, /Administrator/);
  assert.doesNotMatch(component, /All Teachers|All Administrators/);
  assert.match(component, /Śruti Vedam/);
  assert.match(component, /Raagasudha/);
});

test('academy content is gated by approved linked-student records', () => {
  assert.match(compact(controller), /myLinkedStudents\(institution\)/);
  assert.match(compact(controller), /if\(!approved\)returnnull/);
  assert.match(compact(controller), /learnerAcademyDirectory\(institution,approved.id\)/);
});

test('only published HTTPS photo URLs are displayed', () => {
  assert.match(compact(component), /photoUrl\?:string/);
  assert.match(compact(component), /publicId\?:string/);
  assert.match(component, /referrerPolicy="no-referrer"/);
  assert.ok(component.includes('^https:'));
  assert.doesNotMatch(
    component,
    /listTeachers|listAdministrators|listOperations|email|phone_number/,
  );
});
