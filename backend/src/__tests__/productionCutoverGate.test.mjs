import test from 'node:test';
import assert from 'node:assert/strict';
import {assessCutover} from '../../scripts/productionCutoverGate.mjs';
test('full M9 cutover fails closed while legacy resource routes remain',()=>{
 const r=assessCutover();
 assert.equal(r.fullM9DatabaseCutoverReady,false);
 for(const key of ['LEGACY_SPLIT_ROUTER','LEGACY_RESOURCE_WRITES','LEGACY_CALENDAR_ROUTE_FALLBACK','CLASS_READS_SHADOW_ONLY'])assert.ok(r.blockers.includes(key),key);
});
