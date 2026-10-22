import {describe,expect,it} from 'vitest';
import {selectNearbySessions} from '../src/teacherSessionWindow';
const sessions=[{id:'d',date:'2026-11-06'},{id:'a',date:'2026-10-16'},{id:'c',date:'2026-10-30'},{id:'b',date:'2026-10-23'}];
describe('teacher session dropdown window',()=>{
 it('shows previous, nearest upcoming and following only',()=>{
  expect(selectNearbySessions(sessions,'2026-10-22').map(s=>[s.id,s.windowPosition])).toEqual([['a','previous'],['b','current'],['c','following']]);
 });
 it('treats today as current when scheduled',()=>{
  expect(selectNearbySessions(sessions,'2026-10-23').map(s=>s.id)).toEqual(['a','b','c']);
 });
 it('handles earliest session without inventing a previous one',()=>{
  expect(selectNearbySessions(sessions,'2026-10-01').map(s=>s.id)).toEqual(['a','b']);
 });
 it('handles all historical sessions',()=>{
  expect(selectNearbySessions(sessions,'2026-12-01').map(s=>s.id)).toEqual(['c','d']);
 });
 it('handles empty and single-session schedules',()=>{
  expect(selectNearbySessions([],'2026-10-22')).toEqual([]);
  expect(selectNearbySessions([{id:'one',date:'2026-10-24'}],'2026-10-22')).toHaveLength(1);
 });
});
