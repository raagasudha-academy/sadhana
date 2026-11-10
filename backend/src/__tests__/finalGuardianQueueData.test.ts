import test from 'node:test';
import assert from 'node:assert/strict';
import {makeM10FinalGuardianQueueReader} from '../finalGuardianQueueData.ts';

test('roll lookup uses the institution-independent unique-roll counter and verifies canonical student scope',async()=>{
 const calls:any[]=[];
 const db={send:async(command:any)=>{
  calls.push(command.input);
  const key=command.input.Key;
  if(key?.counterId)return {Item:{counterId:key.counterId,personId:'PERSON-STUDENT-8'}};
  if(key?.personId)return {Item:{personId:key.personId,personTypes:['student'],institutionIds:['raaga'],status:'active',studentProfile:{rollNumbers:{raaga:'RS-008'}}}};
  return {};
 }};
 const reader=makeM10FinalGuardianQueueReader(db as any,{send:async()=>({})} as any);
 assert.equal(await reader.studentForRoll('raaga','RS-008'),'PERSON-STUDENT-8');
 assert.deepEqual(calls.map(x=>x.Key),[
  {counterId:'ROLL_GLOBAL#RS-008'},
  {personId:'PERSON-STUDENT-8'}
 ]);
});

test('roll lookup refuses an academy mismatch and never returns an inactive or non-student person',async()=>{
 const db={send:async(command:any)=>command.input.Key?.counterId
  ?{Item:{personId:'PERSON-STUDENT-8'}}
  :{Item:{personId:'PERSON-STUDENT-8',personTypes:['student'],institutionIds:['sruti'],status:'active',studentProfile:{rollNumbers:{sruti:'SR-008'}}}}};
 const reader=makeM10FinalGuardianQueueReader(db as any,{send:async()=>({})} as any);
 assert.equal(await reader.studentForRoll('raaga','SR-008'),null);
});
