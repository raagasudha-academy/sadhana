/** M9.5 selective operational setup only. Pure, deterministic: no AWS access. */
import { createHash } from 'node:crypto';
import { planMigration } from './m9MigrationPlannerCore.mjs';
import { previewTransform } from './m9TransformCore.mjs';
import { validateM9References } from './m9ReferentialIntegrity.mjs';
import { M9_SCHEMA_BY_TABLE } from './m9Schema.mjs';

export const M95_EXPECTED = Object.freeze({
  'sadhana-dev-m9-classes':22,
  'sadhana-dev-m9-sessions':423,
  'sadhana-dev-m9-events':6,
  'sadhana-dev-m9-venues':3,
  'sadhana-dev-m9-people':7,
});
export const M95_KEYS = Object.freeze({
  'sadhana-dev-m9-classes':'classId',
  'sadhana-dev-m9-sessions':'sessionId',
  'sadhana-dev-m9-events':'eventId',
  'sadhana-dev-m9-venues':'venueId',
  'sadhana-dev-m9-people':'personId',
});
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value==='object'
  ? Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])) : value;
export const hashRecord = value => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');

/** Omit NULL GSI keys; DynamoDB requires a string when an indexed key is present. */
export function normalizeM95IndexKeys(tableName, item) {
  const schema = M9_SCHEMA_BY_TABLE.get(tableName.replace(/^sadhana-dev-m9-/, 'sadhana-dev-'));
  if (!schema) throw Error(`Missing M9 index schema: ${tableName}`);
  for (const key of new Set((schema.indexes ?? []).flatMap(index =>
    [index.partitionKey, index.sortKey].filter(Boolean)))) {
    if (item[key] === null) delete item[key];
    else if (item[key] !== undefined && (typeof item[key] !== 'string' || item[key].length === 0))
      throw Error(`Invalid GSI key ${tableName}.${key}: must be nonempty string or absent`);
  }
  return item;
}

export function prepareM95OperationalTransfer(tables){
  const plan=planMigration(tables);
  const transformed=previewTransform(tables,plan);
  const allRows=transformed.rows;
  const references=validateM9References(allRows);
  const problems=[];
  if(plan.problems.length)problems.push('SOURCE_PLAN_BLOCKERS');
  if(plan.warnings.length)problems.push('SOURCE_PLAN_WARNINGS');
  if(transformed.failures.length)problems.push('TRANSFORM_FAILURES');
  if(Object.values(transformed.deferred).some(Boolean) &&
    (transformed.deferred.localTimeConversion||transformed.deferred.missingLocalDates||transformed.deferred.ambiguous||transformed.deferred.nonexistent||transformed.deferred.invalid||transformed.deferred.missingTimes||transformed.deferred.invalidOrder)) problems.push('TIME_NOT_RESOLVED');
  if(references.blockerCount)problems.push('REFERENTIAL_BLOCKERS');
  const rows=allRows.filter(r=>r.tableName!=='sadhana-dev-audit');
  const items=[];
  const counts={};const seen=new Set();
  for(const row of rows){
    const targetTable=row.tableName.replace(/^sadhana-dev-/, 'sadhana-dev-m9-');
    const pk=M95_KEYS[targetTable];
    if(!pk){problems.push('UNEXPECTED_TARGET_TABLE');continue;}
    const id=row.item[pk];
    if(typeof id!=='string'||!id){problems.push('EMPTY_DESTINATION_KEY');continue;}
    if(seen.has(`${targetTable}\0${id}`))problems.push('DUPLICATE_DESTINATION_KEY');
    seen.add(`${targetTable}\0${id}`);
    counts[targetTable]=(counts[targetTable]??0)+1;
    // Copy records exactly as transformed; fingerprint is deterministic and permits safe retries.
    const item=normalizeM95IndexKeys(targetTable, structuredClone(row.item));
    item.m95TransferHash=hashRecord(item);
    items.push({tableName:targetTable,pk,key:id,item});
  }
  for(const [table,count] of Object.entries(M95_EXPECTED))if(counts[table]!==count)problems.push(`COUNT_MISMATCH_${table}`);
  if(items.length!==461)problems.push('TOTAL_NOT_461');
  if(plan.summary.sourceTotal!==642)problems.push('SOURCE_TOTAL_NOT_642');
  if(transformed.targetItems!==635)problems.push('PREVIEW_TOTAL_NOT_635');
  if(allRows.filter(r=>r.tableName==='sadhana-dev-audit').length!==174)problems.push('AUDIT_COUNT_NOT_174');
  // Ensure the transfer set cannot contain historic audit or any student/learning items.
  if(items.some(x=>!Object.hasOwn(M95_KEYS,x.tableName)))problems.push('DISALLOWED_TABLE');
  return {ready:problems.length===0,problems:[...new Set(problems)],counts,items,
    sourceTotal:plan.summary.sourceTotal,sourceCounts:plan.summary.sourceCounts,
    transformedTotal:transformed.targetItems,excludedAudit:174,
    teacherIdentityLinks:plan.summary.teacherIdentityLinks,
    time:transformed.deferred,referenceBlockers:references.blockerCount,
    fingerprint:hashRecord(items.map(x=>({table:x.tableName,key:x.key,hash:x.item.m95TransferHash})).sort((a,b)=>(a.table+a.key).localeCompare(b.table+b.key)))};
}
