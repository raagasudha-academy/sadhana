import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import MessagesWidget from '../../src/MessagesWidget';

afterEach(()=>cleanup());

describe('floating messages widget',()=>{
 it('minimises and restores the window without discarding its conversation view',()=>{
  const listMessageContacts=vi.fn().mockResolvedValue({records:[]});
  const listMessageThreads=vi.fn().mockResolvedValue({records:[]});
  const cloud={api:{listMessageContacts,listMessageThreads}} as any;
  render(<MessagesWidget cloud={cloud} institutions={['raaga']} defaultInstitution="raaga"/>);

  fireEvent.click(screen.getByRole('button',{name:'Open messages'}));
  expect(screen.getByRole('dialog',{name:'Messages'})).toBeTruthy();
  fireEvent.click(within(screen.getByRole('dialog',{name:'Messages'})).getByRole('button',{name:'Minimize messages'}));
  expect(screen.queryByRole('dialog',{name:'Messages'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Restore messages'}));
  expect(screen.getByRole('dialog',{name:'Messages'})).toBeTruthy();
  expect(listMessageContacts).toHaveBeenCalledTimes(1);
 });
});
