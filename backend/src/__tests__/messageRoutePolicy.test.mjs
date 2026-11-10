import test from 'node:test';
import assert from 'node:assert/strict';
import {isMessageRoute} from '../messageRoutePolicy.mjs';

const threadId='a'.repeat(64);
test('allows only the learner messaging operations through the staff gate',()=>{
 for(const [method,parts] of [
  ['GET',['messages','contacts']],['GET',['messages','threads']],['POST',['messages']],
  ['GET',['messages','threads',threadId]],['POST',['messages','threads',threadId]],
  ['POST',['messages','threads',threadId,'read']],
 ])assert.equal(isMessageRoute(method,parts),true,`${method} /${parts.join('/')}`);
});

test('does not widen staff-gate exceptions to unrelated or malformed routes',()=>{
 for(const [method,parts] of [
  ['GET',['messages','threads','short']],['DELETE',['messages','threads']],
  ['GET',['messages','threads',threadId,'read']],['POST',['messages','threads',threadId,'anything']],
  ['GET',['venues','threads',threadId]],['POST',['messages','threads',threadId,'read','extra']],
 ])assert.equal(isMessageRoute(method,parts),false,`${method} /${parts.join('/')}`);
});
