import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const auditPath=path.join(repoRoot,'backend/docs/api-coverage-audit.csv');

function parseCsv(source){
  const records=[];let row=[],field='',quoted=false;
  for(let i=0;i<source.length;i++){
    const char=source[i];
    if(quoted){
      if(char==='"'&&source[i+1]==='"'){field+='"';i++;}
      else if(char==='"')quoted=false;
      else field+=char;
    }else if(char==='"')quoted=true;
    else if(char===','){row.push(field);field='';}
    else if(char==='\n'){
      row.push(field);field='';
      if(row.some(value=>value!==''))records.push(row);
      row=[];
    }else if(char!=='\r')field+=char;
  }
  if(field||row.length){row.push(field);records.push(row);}
  const [header,...data]=records;
  return data.map(values=>Object.fromEntries(header.map((key,index)=>[key,values[index]??''])));
}

function walk(directory){
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const full=path.join(directory,entry.name);
    return entry.isDirectory()?walk(full):[full];
  });
}

const routes=parseCsv(readFileSync(auditPath,'utf8'));
const behavioralTests=[
  ...walk(path.join(repoRoot,'backend/test')),
  ...walk(path.join(repoRoot,'backend/tests')),
  ...walk(path.join(repoRoot,'test/e2e-tests/backend')),
].filter(file=>/\.(?:test\.(?:ts|mjs))$/.test(file));
const relativeTests=behavioralTests.map(file=>path.relative(repoRoot,file).split(path.sep).join('/'));
const matches=(pattern,value)=>new RegExp(`^${pattern.split('*').map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')}$`).test(value);
function testReferences(row){
  const references=row.existing_test_candidates.match(/[A-Za-z0-9_./*-]+\.test\.(?:ts|mjs)/g)??[];
  return references.filter(reference=>relativeTests.some(file=>
    reference.includes('/')?matches(reference,file):matches(reference,path.basename(file))
  ));
}

test('API audit contains one row per unique route and HTTP method',()=>{
  assert.equal(routes.length,158,'refresh this expected count when API routes change');
  const keys=routes.map(row=>`${row.method} ${row.route_pattern}`);
  assert.equal(new Set(keys).size,keys.length,'route/method rows must be unique');
});

test('every audited route/method links to at least one existing executable test file',()=>{
  const missing=routes.filter(row=>testReferences(row).length===0)
    .map(row=>`${row.method} ${row.route_pattern}: ${row.existing_test_candidates}`);
  assert.deepEqual(missing,[],'add a real test reference or mark and justify a newly reviewed gap');
});

test('every test-file reference in the API audit resolves to a real test file',()=>{
  const broken=[];
  for(const row of routes){
    const references=row.existing_test_candidates.match(/[A-Za-z0-9_./*-]+\.test\.(?:ts|mjs)/g)??[];
    for(const reference of references){
      const found=relativeTests.some(file=>reference.includes('/')
        ?matches(reference,file)
        :matches(reference,path.basename(file)));
      if(!found)broken.push(`${row.method} ${row.route_pattern}: ${reference}`);
    }
  }
  assert.deepEqual(broken,[],'fix stale or misspelled test references');
});

test('no endpoint remains marked as missing route execution evidence',()=>{
  const unresolved=routes.filter(row=>/test missing|route test absent|handler test missing/i.test(row.route_execution))
    .map(row=>`${row.method} ${row.route_pattern}: ${row.route_execution}`);
  assert.deepEqual(unresolved,[]);
});

test('every audit row states execution evidence and a next action for remaining gaps',()=>{
  const incomplete=routes.filter(row=>!row.route_execution.trim()||!row.coverage_gaps_next_action.trim())
    .map(row=>`${row.method} ${row.route_pattern}`);
  assert.deepEqual(incomplete,[]);
});
