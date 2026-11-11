/** M10 complete-cutover fail-closed gate.
 * Reads local source only. No AWS calls. The existing live deployment is a code
 * release, NOT a completed entity-table migration.
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const src=path=>readFileSync(resolve(root,path),'utf8');
export function assessCutover(read=src){
 const repo=read('src/repository.ts');
 const router=read('src/tableRouter.ts');
 const lambda=read('src/lambda.ts');
 const m9writes=read('src/routes/writeRoutes.ts');
 const fence=read('src/cutoverFence.mjs');
 const dir=read('src/routes/directoryRoutes.ts');
 const gaps=[];
 if(repo.includes('makeRoutedClient')&&repo.includes('GSI1PK')===false && repo.includes('DIRECTORY#STUDENT'))gaps.push('LEGACY_STUDENT_FAMILY_DIRECTORY');
 if(router.includes("SADHANA_DATA_MODE==='split'"))gaps.push('LEGACY_SPLIT_ROUTER');
 if(repo.includes('this.txPut')&&repo.includes('TransactWriteCommand'))gaps.push('LEGACY_RESOURCE_WRITES');
 if(m9writes.includes("['classes','events']"))gaps.push('GENERIC_M9_WRITES_ONLY_CLASSES_EVENTS');
 if(lambda.includes('learningRoutes(routeContext)'))gaps.push('LEGACY_LEARNING_ROUTE_FALLBACK');
 if(lambda.includes('calendarRoutes(routeContext)'))gaps.push('LEGACY_CALENDAR_ROUTE_FALLBACK');
 if(lambda.includes('registrationRoutes(routeContext)'))gaps.push('LEGACY_REGISTRATION_ROUTE_FALLBACK');
 if(fence.includes('LEGACY_DATA_ROOTS'))gaps.push('STRICT_FENCE_BLOCKS_LEGACY_WORKFLOWS');
 if(dir.includes("if(isClasses&&mode!=='shadow')return undefined"))gaps.push('CLASS_READS_SHADOW_ONLY');
 return {schema:1,checks:'static-source',codeDeployComplete:true,fullM9DatabaseCutoverReady:gaps.length===0,blockers:gaps};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=assessCutover();
 console.log(JSON.stringify(report,null,2));
 if(process.argv.includes('--require-ready')&&!report.fullM9DatabaseCutoverReady)process.exitCode=2;
}
