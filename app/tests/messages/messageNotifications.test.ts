import {describe,expect,it} from 'vitest';
import {messageThreadNotifications} from '../../src/messageNotifications';

describe('message notifications',()=>{
 it('shows unread messages as new-message notifications and preserves View As context',()=>{
  const [item]=messageThreadNotifications('sruti',[{threadId:'thread-1',peerId:'teacher-1',peerName:'Tara Teacher',classId:'class-1',className:'Vedic Chanting',lastMessage:'Practice tomorrow',lastAt:'2026-11-09T12:00:00Z',unreadCount:2}],'student-1');
  expect(item.title).toBe('New message from Tara Teacher');
  expect(item.read).toBe(false);
  expect(item.unreadCount).toBe(2);
  expect(item.messageThread).toEqual({threadId:'thread-1',peerId:'teacher-1',classId:'class-1',studentId:'student-1'});
 });

 it('marks an already-read conversation as read activity',()=>{
  const [item]=messageThreadNotifications('raaga',[{threadId:'thread-2',peerId:'student-1',peerName:'Sam Student',classId:'class-2',className:'Music',lastMessage:'Thanks',lastAt:'2026-11-09T12:00:00Z',unreadCount:0}]);
  expect(item.title).toBe('Message with Sam Student');
  expect(item.read).toBe(true);
  expect(item.messageThread).not.toHaveProperty('studentId');
 });
});
