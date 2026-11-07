import type {RouteContext,JsonResponse} from './routes/http.ts';
export function finalLearningRoute(context:RouteContext,deps:{
 assertConfigured:()=>void;
 parse:(event:RouteContext['event'])=>Record<string,unknown>;
 learner:()=>ReturnType<typeof import('./m9FinalLearner.ts').m9FinalLearner>;
 learnerWrites:()=>ReturnType<typeof import('./m9LearnerWrites.ts').m9LearnerWrites>;
 homework:()=>ReturnType<typeof import('./m9Homework.ts').m9Homework>;
 teacherPractice:(context:RouteContext)=>Promise<JsonResponse|undefined>;
},env?:Record<string,string|undefined>):Promise<{status:number;body:unknown}|undefined>;
