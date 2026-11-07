import test from 'node:test';
import assert from 'node:assert/strict';
import {srutiWriterTables} from '../src/m91SrutiMirrorPolicy.mjs';
const legacy='sadhana-dev-m9-registrations', final='sadhana-dev-registrations';
test('default preserves current live M9 destination',()=>assert.deepEqual(srutiWriterTables({}),{primary:legacy,mirror:undefined}));
test('explicit M9 destination remains unchanged',()=>assert.deepEqual(srutiWriterTables({M91_SRUTI_REGISTRATIONS_TABLE:legacy}),{primary:legacy,mirror:undefined}));
test('atomic mirror only allows exact final destination with M9 primary',()=>assert.deepEqual(srutiWriterTables({M91_SRUTI_REGISTRATIONS_MIRROR_TABLE:final}),{primary:legacy,mirror:final}));
test('rejects unknown or user-defined destination',()=>assert.throws(()=>srutiWriterTables({M91_SRUTI_REGISTRATIONS_TABLE:'some-other-table'}),/Unapproved/));
test('rejects reverse mirror, identical mirror and unknown mirror',()=>{
 for(const env of [{M91_SRUTI_REGISTRATIONS_TABLE:final,M91_SRUTI_REGISTRATIONS_MIRROR_TABLE:legacy},{M91_SRUTI_REGISTRATIONS_TABLE:legacy,M91_SRUTI_REGISTRATIONS_MIRROR_TABLE:legacy},{M91_SRUTI_REGISTRATIONS_MIRROR_TABLE:'unknown'}]) assert.throws(()=>srutiWriterTables(env),/mirror requires/);
});
test('final-only writer refuses missing cutover acknowledgement',()=>assert.throws(()=>srutiWriterTables({M91_SRUTI_REGISTRATIONS_TABLE:final}),/acknowledgement/));
test('single-destination final writer is allowed only after coordinated flip',()=>assert.deepEqual(srutiWriterTables({M91_SRUTI_REGISTRATIONS_TABLE:final,M91_SRUTI_FINAL_WRITER_ACK:'enabled'}),{primary:final,mirror:undefined}));
