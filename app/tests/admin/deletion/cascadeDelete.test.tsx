import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import CascadeDeleteControl from '../../../src/CascadeDeleteControl';
afterEach(cleanup);
const target={type:'students',id:'student-1',name:'Student One',version:2};
const preview={targetType:'students',targetId:'student-1',expectedVersion:2,signature:'signed-preview',counts:[{label:'Student',count:1},{label:'Attendance',count:3}],total:4};
function setup(allowed=true,result=preview){
 const api={previewCascadeDelete:vi.fn().mockResolvedValue(result),executeCascadeDelete:vi.fn().mockResolvedValue({deleted:true})},onDeleted=vi.fn();
 render(<CascadeDeleteControl allowed={allowed} api={api} institution="sruti" target={target} onDeleted={onDeleted}/>);
 return {api,onDeleted};
}
it('ordinary admins have no permanent deletion control',()=>{setup(false);expect(screen.queryByRole('button')).toBeNull();});
it('requires a matching preview and explicit confirmation before executing',async()=>{
 const {api,onDeleted}=setup();fireEvent.click(screen.getByRole('button',{name:'Delete permanently'}));
 const dialog=await screen.findByRole('alertdialog');await within(dialog).findByText('Attendance: 3');
 const remove=within(dialog).getByRole('button',{name:'Delete permanently'}) as HTMLButtonElement;
 expect(remove.disabled).toBe(true);expect(api.executeCascadeDelete).not.toHaveBeenCalled();
 fireEvent.change(within(dialog).getByLabelText('Type DELETE to confirm'),{target:{value:'DELETE'}});
 fireEvent.click(remove);
 await vi.waitFor(()=>expect(onDeleted).toHaveBeenCalledTimes(1));
 expect(api.executeCascadeDelete).toHaveBeenCalledWith('sruti',target,'signed-preview');
});
it('an unavailable or mismatched preview cannot enable deletion',async()=>{
 const {api}=setup(true,{...preview,targetId:'another-student'});
 fireEvent.click(screen.getByRole('button',{name:'Delete permanently'}));await screen.findByRole('alert');
 const dialog=screen.getByRole('alertdialog');
 expect((within(dialog).getByRole('button',{name:'Delete permanently'}) as HTMLButtonElement).disabled).toBe(true);
 expect(api.executeCascadeDelete).not.toHaveBeenCalled();
});
it('student removal can show a deletion preview inline alongside archive',async()=>{
 const api={previewCascadeDelete:vi.fn().mockResolvedValue(preview),executeCascadeDelete:vi.fn()};
 render(<section role="dialog" aria-label="Remove student"><button>Archive</button><CascadeDeleteControl inline allowed api={api} institution="sruti" target={target} onDeleted={()=>{}}/></section>);
 fireEvent.click(screen.getByRole('button',{name:'Delete permanently'}));
 await screen.findByText('Attendance: 3');
 expect(screen.getAllByRole('dialog')).toHaveLength(1);
 expect(screen.queryByRole('alertdialog')).toBeNull();
 expect(screen.getByRole('button',{name:'Archive'})).toBeTruthy();
 expect(api.previewCascadeDelete).toHaveBeenCalledWith('sruti',target);
});
