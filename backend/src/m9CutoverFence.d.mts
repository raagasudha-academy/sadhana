export interface M9CutoverFenceOptions {strict?: boolean; learnerReads?:boolean; learnerWrites?:boolean; homeworkWrites?:boolean; onboarding?:boolean; m9Routes?:boolean}
export function m9CutoverFence(parts: string[],method:string|undefined,options?:M9CutoverFenceOptions):{status:number;error:string}|null;
export const M9_LEGACY_DATA_ROOTS:readonly string[];
