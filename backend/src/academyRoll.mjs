/** A student keeps one roll number for life, even with multiple academy memberships. */
export function academyRoll(institution, sequence) {
  if (!['raaga', 'sruti'].includes(institution) || !Number.isSafeInteger(sequence) || sequence < 1)
    throw new Error('Invalid originating academy or roll sequence');
  return `${institution === 'raaga' ? 'RS' : 'SR'}-${String(sequence).padStart(3, '0')}`;
}
export function permanentRoll(profile, institutions = []) {
  const existing = profile?.rollNumber;
  if (typeof existing === 'string' && /^(RS|SR)-[0-9]{3,}$/.test(existing)) return existing;
  const values = Object.values(profile?.rollNumbers || {}).filter(
    (v) => typeof v === 'string' && /^(RS|SR)-[0-9]{3,}$/.test(v),
  );
  if (values.length && values.every((v) => v === values[0]) && institutions.length)
    return values[0];
  return null; // Conflicting/old-format labels need a reviewed one-time migration.
}
