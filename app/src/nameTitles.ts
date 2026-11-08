/** Title selection is presentation metadata, not an access-control role. */
export const NAME_TITLES = ['','Mr','Mrs','Ms','Miss','Dr','Prof'] as const;
export type NameTitle = typeof NAME_TITLES[number];
export function splitTitledName(value:string):{title:NameTitle;name:string}{
  const text=value.trim().replace(/\s+/g,' ');
  const match=/^(Mr|Mrs|Ms|Miss|Dr|Prof)\.?\s+(.+)$/i.exec(text);
  if(!match)return {title:'',name:text};
  const title=NAME_TITLES.find(x=>x.toLowerCase()===match[1].toLowerCase())||'';
  return {title,name:match[2]};
}
export function titledName(title:NameTitle,name:string):string{
  const clean=name.trim().replace(/\s+/g,' ');
  return title?`${title} ${clean}`:clean;
}
