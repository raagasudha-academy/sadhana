import test from 'node:test';
import assert from 'node:assert/strict';
import { isSupportedAccessRollNumber } from '../familyAccess.ts';

test('family access accepts canonical academy and legacy roll number formats', () => {
  for (const roll of ['RS-006', 'SR-006', '001-002', 'rs-006', '  RS-006  '])
    assert.equal(isSupportedAccessRollNumber(roll), true, roll);
});

test('family access rejects incomplete or malformed roll numbers', () => {
  for (const roll of ['', 'RS-6', 'RS-06', '001-2', 'R-006', '001002'])
    assert.equal(isSupportedAccessRollNumber(roll), false, roll);
});
