#!/usr/bin/env node
/** Offline validation of the M9 private transformation output. Never contacts AWS. */
import {readFileSync,writeFileSync,chmodSync} from 'node:fs';
import {resolve} from 'node:path';
import {validateM9References} from './m9ReferentialIntegrity.mjs';
function main(){
 const args=process.argv.slice(2);
 if(args.length!==4||args[0]!=='--private-records'||args[2]!=='--summary')throw Error('Usage: node scripts/m9ReferentialPreview.mjs --private-records ./m9-target-private-dst.json --summary ./m9-references-summary.json');
 const source=resolve(args[1]),dest=resolve(args[3]);if(source===dest)throw Error('Source and summary paths must differ');
 const input=JSON.parse(readFileSync(source,'utf8'));
 if(input.readOnly!==true||input.canExecute!==false||!Array.isArray(input.records))throw Error('Requires a valid private M9 read-only transformation preview');
 const result=validateM9References(input.records);
 const {blockers,warnings,...publicResult}=result;
 // Detailed issues can include IDs. Only publish aggregate codes in the shareable summary.
 writeFileSync(dest,JSON.stringify({...publicResult,readyForWrites:false,notice:'Local referential validation only; schema definitions, backend integration and cutover remain pending.'},null,2)+'\n',{flag:'wx',mode:0o600});chmodSync(dest,0o600);
 console.log(JSON.stringify({summary:dest,...publicResult,readyForWrites:false},null,2));
 if(result.blockerCount)process.exitCode=2;
}
try{main();}catch(error){console.error('M9.3 REFERENCE REVIEW STOP:',error.message);process.exitCode=1;}
