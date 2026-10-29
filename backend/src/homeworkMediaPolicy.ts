/** Homework media policy. Validated both before signing uploads and when saving selections. */
export const homeworkMediaRules = {
 'image/jpeg': {kind:'image',ext:'jpg',max:5_000_000},
 'image/png': {kind:'image',ext:'png',max:5_000_000},
 'image/webp': {kind:'image',ext:'webp',max:5_000_000},
} as const;
export type HomeworkMediaKind='image';
export function validateHomeworkMediaCounts(mimes:string[]):boolean {
 return mimes.length<=3 && mimes.every(m=>Object.prototype.hasOwnProperty.call(homeworkMediaRules,m));
}
export function homeworkMediaAllowed(mime:string,size:number):boolean {
 const r=homeworkMediaRules[mime as keyof typeof homeworkMediaRules];
 return !!r&&Number.isInteger(size)&&size>0&&size<=r.max;
}
