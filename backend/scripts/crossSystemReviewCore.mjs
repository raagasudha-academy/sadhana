/** Pure, read-only evidence classification helpers. */
export function typeOf(row) {
  if (row.kind === 'COUNTER') return 'counter';
  if (row.table === 'admin' && row.PK.startsWith('ACCESS#')) return 'guardian-access';
  if (row.table === 'students' && row.PK === 'OPS#GLOBAL#WEB_IMPORT')
    return row.SK.startsWith('IDENTITY#') ? 'website-identity-mapping' : 'website-import';
  if (row.table === 'students' && row.PK === 'OPS#GLOBAL#STUDENT' && row.SK.startsWith('MEDIA#'))
    return 'student-media-metadata';
  if (row.table === 'learning' && row.PK.includes('HOMEWORK_MATERIAL')) return 'homework-material';
  if (row.table === 'learning' && row.PK.endsWith('#HOMEWORK')) return 'homework-assignment';
  return 'unknown';
}
export function safeRelation(item, ids, familyId) {
  if (item.studentId !== undefined) return ids.has(item.studentId);
  if (item.familyId !== undefined) return item.familyId === familyId;
  return null;
}
export function storageReferences(item, suppliedBucket) {
  const candidates = [];
  for (const keyName of ['s3Key', 'objectKey', 'storageKey', 'mediaKey', 'fileKey']) {
    const key = item[keyName];
    if (typeof key === 'string' && key.length > 0 && key.length <= 1024 && !key.includes('..')) {
      const bucket = item.s3Bucket || item.bucket || suppliedBucket;
      if (typeof bucket === 'string' && /^[a-z0-9.-]{3,63}$/.test(bucket))
        candidates.push({ bucket, key });
    }
  }
  return candidates;
}
export function isApprovalReady(rows) {
  return rows.every((row) => row.decision === 'VERIFIED_TEST_ONLY');
}
