export type CascadeActorRequest = {actor:string;institution:'raaga'|'sruti';type:'student'|'family';id:string;expectedVersion:number;signature?:string;confirm?:'DELETE'};
export type CascadeService = {
 preview(args:CascadeActorRequest):Promise<{targetType:string;targetId:string;expectedVersion:number;signature:string;counts:Array<{label:string;count:number}>;total:number}>;
 execute(args:CascadeActorRequest):Promise<{deleted:boolean}>;
};
export function makeFinalCascadeDeletionService(options?:{db?:any;now?:()=>number;allowExecute?:boolean}):CascadeService;
