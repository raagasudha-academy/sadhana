import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import SadhanaMyProfile from '../../src/SadhanaMyProfile';

afterEach(()=>cleanup());

describe('family child profiles',()=>{
 it('lets an approved family account update a child portal name through the scoped learner API',async()=>{
  const learner={student:{id:'STUDENT-1',name:'Tanisha Kanakam',rollNumber:'RS-001'},profile:{preferredName:'',phone:'',about:'',version:2},teachers:[],venues:[],classes:[]};
  const cloud={staff:{subject:'guardian-sub',displayName:'Mohana Kamanuru'},api:{
   getMyProfile:vi.fn().mockResolvedValue({name:'Mohana Kamanuru',givenName:'Mohana',familyName:'Kamanuru',email:'parent@example.test',emailVerified:true,phone:'',phoneVerified:false}),
   updateMyProfile:vi.fn(),uploadMyPhoto:vi.fn(),learnerExtras:vi.fn().mockResolvedValue(learner),
   listLearnerMedia:vi.fn().mockResolvedValue({records:[]}),saveLearnerProfile:vi.fn().mockResolvedValue({updated:true,version:3}),
   beginLearnerMedia:vi.fn(),finishLearnerMedia:vi.fn(),
  },beginPhoneChange:vi.fn(),verifyPhoneChange:vi.fn()} as any;
  render(<SadhanaMyProfile cloud={cloud} familyStudents={[{id:'STUDENT-1',name:'Tanisha Kanakam',rollNumber:'RS-001',institution:'raaga',kind:'guardian'}]}/>);
  const name=await screen.findByRole('textbox',{name:/Name shown in the portal/});
  expect((name as HTMLInputElement).value).toBe('Tanisha Kanakam');
  fireEvent.change(name,{target:{value:'Tani'} });
  fireEvent.click(screen.getByRole('button',{name:'Save name'}));
  await waitFor(()=>expect(cloud.api.saveLearnerProfile).toHaveBeenCalledWith('raaga','STUDENT-1',{preferredName:'Tani',phone:'',about:'',expectedVersion:2}));
  expect(await screen.findByText('Display name updated.')).toBeTruthy();
 });
});
