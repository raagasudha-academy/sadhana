/** Matching is for identity backfills, never a permission decision. */
export interface NamedTeacher {displayName:string;aliases?:string[];active?:boolean;id?:string}
export function normalizedTeacherName(value:string):string {
 return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/^(?:dr|mr|mrs|ms|miss|prof|professor)\.?\s+/,'').replace(/[^a-z0-9]/g,'');
}
export function matchesTeacherName(name:string,teacher:NamedTeacher):boolean{
 const target=normalizedTeacherName(name);
 return !!target&&[teacher.displayName,...(teacher.aliases||[])].some(x=>normalizedTeacherName(x)===target);
}
export function suggestedTeacherIds<T extends NamedTeacher & {id:string;active:boolean}>(name:string,teachers:readonly T[]):string[]{
 return teachers.filter(t=>t.active&&matchesTeacherName(name,t)).map(t=>t.id);
}
