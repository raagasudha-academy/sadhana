import {afterEach,describe,expect,it,vi} from 'vitest';
import {createSadhanaApi} from '../../src/api/sadhanaClient';

afterEach(()=>vi.unstubAllGlobals());

describe('message API client',()=>{
 it('sends replies to the thread route without leaking the routing id into the payload',async()=>{
  const fetch=vi.fn().mockResolvedValue({ok:true,status:201,json:async()=>({record:{id:'MESSAGE-1'}})});
  vi.stubGlobal('fetch',fetch);
  const api=createSadhanaApi({baseUrl:'https://api.example.test',getAccessToken:()=> 'test-token'});
  await api.sendMessage('sruti',{peerId:'PERSON-STUDENT',classId:'CLASS-SRUTI',text:'Hello',threadId:'a'.repeat(64)});
  expect(fetch).toHaveBeenCalledWith('https://api.example.test/messages/threads/'+'a'.repeat(64)+'?institution=sruti',expect.objectContaining({method:'POST',body:JSON.stringify({peerId:'PERSON-STUDENT',classId:'CLASS-SRUTI',text:'Hello'})}));
 });
});
