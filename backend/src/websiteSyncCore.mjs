/** Pure, fail-closed website mapping verification for M9. No network or AWS. */
const fail = (message) => { throw Object.assign(new Error(message), { status: 409 }); };
const plain = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export function expectedWebsiteMapping(local, website, institution, externalId) {
  if (institution !== 'raaga') fail('Website status sync supports only verified Raagasudha intake.');
  if (!plain(local) || local.institutionId !== institution || local.externalRegistrationId !== externalId ||
      local.importStatus !== 'imported' || local.reviewStatus !== 'approved' ||
      !/^fam_[a-f0-9]{64}$/.test(String(local.familyId ?? ''))) fail('M9 import record is not verified.');
  if (!plain(website) || website.registrationId !== externalId || website.reviewStatus !== 'approved')
    fail('Website registration changed since approval.');
  const mapping = local.sourceStudentIds;
  if (!plain(mapping) || Object.keys(mapping).length === 0 ||
      Object.keys(mapping).some(k => !/^[A-Za-z0-9_-]{1,120}$/.test(k)) ||
      Object.values(mapping).some(v => typeof v !== 'string' || !/^per_[a-f0-9]{64}$/.test(v)))
    fail('M9 source-person mapping is missing; manual review required.');
  const ids = Array.isArray(local.studentIds) ? local.studentIds : [];
  if (ids.length !== Object.keys(mapping).length ||
      new Set(Object.values(mapping)).size !== ids.length ||
      ids.some(id => !Object.values(mapping).includes(id))) fail('M9 student mapping is inconsistent.');
  const desired = {status:'imported', familyId:local.familyId, studentIds:mapping};
  const upstream = website.sadhanaImport;
  if (upstream !== undefined && upstream !== null) {
    if (upstream.status !== 'imported' || upstream.familyId !== desired.familyId ||
        !plain(upstream.studentIds) ||
        JSON.stringify(Object.entries(upstream.studentIds).sort()) !== JSON.stringify(Object.entries(mapping).sort()))
      fail('Website has a different import; do not overwrite it.');
    return {alreadySynced:true, mapping:desired};
  }
  return {alreadySynced:false,mapping:desired};
}
