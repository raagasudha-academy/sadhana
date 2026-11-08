import {afterEach,describe,expect,it} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {StudentRecord} from '../src/features/registration/registrationStudents';

afterEach(cleanup);

describe('administrator student record controls',()=>{
  it('shows the supported name update without exposing a student phone editor',()=>{
    render(<StudentRecord
      person={{id:'STUDENT-1',name:'Student Example',phone:'',familyId:'FAMILY-1'}}
      family={{id:'FAMILY-1',parentName:'Parent Example',phone:'+447700900123'}}
      enrollments={[]}
      workspace="raaga"
      classes={[]}
      onBack={()=>{}}
      onEnrol={()=>{}}
      onEditName={()=>{}}
      onConvert={()=>{}}
      onRemove={()=>{}}
      onRestore={()=>{}}
      onEditEnrol={()=>{}}
      onRemoveEnrol={()=>{}}
    />);
    expect(screen.getByRole('button',{name:'Update'})).toBeTruthy();
    expect(screen.queryByRole('button',{name:/phone|mobile|whatsapp/i})).toBeNull();
    expect(screen.queryByRole('button',{name:/save student contact/i})).toBeNull();
  });
});
