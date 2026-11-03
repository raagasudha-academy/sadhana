/** M9.4: new-data bootstrap plan only. No DynamoDB client, imports or writes. */
import { M9_SCHEMA, validateSchema } from './m9Schema.mjs';

export const FRESH_INSTITUTIONS = Object.freeze([
  Object.freeze({institutionId:'raaga', name:'Raagasudha', shortName:'Raagasudha', status:'active', settings:{timezone:'Europe/London'}}),
  Object.freeze({institutionId:'sruti', name:'Sruti', shortName:'Sruti', status:'active', settings:{timezone:'Europe/London'}})
]);

export function makeFreshStartPlan({ environment = 'dev' } = {}) {
  if (!/^[a-z][a-z0-9-]*$/.test(environment)) throw new Error('Invalid environment');
  const errors = validateSchema();
  if (errors.length) throw new Error(`Invalid M9 schema: ${errors.join('; ')}`);
  const tableNames = M9_SCHEMA.map(t => t.tableName.replace(/^sadhana-dev-/, `sadhana-${environment}-`));
  if (new Set(tableNames).size !== 18) throw new Error('Duplicate target table names');
  const institutionTable = `sadhana-${environment}-institutions`;
  const seeds = FRESH_INSTITUTIONS.map(item => ({tableName: institutionTable, item:structuredClone(item)}));
  return {
    planType:'M9_FRESH_START', schema:1, environment,
    dryRun:true, readOnly:true, canExecute:false, writesPerformed:0,
    existingDataDisposition:'LEAVE_UNTOUCHED',
    legacySourceRecordsToCopy:0,
    physicalTables:tableNames,
    initialSeeds:seeds,
    initialSeedCount:seeds.length,
    remainingTablesEmptyAtBootstrap:17,
    guards:{
      noSourceTableScan:true, noSourceRecordsImported:true,
      requireNewTableProvisioningApproval:true,
      requireIdentityAndScheduleRecreationBeforeCutover:true,
      requireExplicitApprovalBeforeProductionWrites:true
    },
    operationalReadiness:'NOT_READY_FOR_CUTOVER'
  };
}
