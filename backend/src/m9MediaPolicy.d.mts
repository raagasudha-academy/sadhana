export type M9MediaType={kind:'image'|'audio'|'video';ext:string;max:number};
export const M9_MEDIA_TYPES:Readonly<Record<string,M9MediaType>>;
export function validateM9MediaType(mime:string,size:unknown):M9MediaType|null;
export function m9MediaId(id:unknown):boolean;
export function validateM9MediaSelection(mimes:string[]):boolean;
