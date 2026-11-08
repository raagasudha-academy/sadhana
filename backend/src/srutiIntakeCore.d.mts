export declare function validateSrutiSubmission(value:unknown): {
 institution:'sruti'; registrationType:'self'|'child'|'both'; guardian:Record<string,string>;
 students:Array<Record<string,string>>; consents:{registration:true;photography:boolean};
};
export declare function newSrutiIntakeRecord(payload:ReturnType<typeof validateSrutiSubmission>,now?:string,registrationId?:string):Record<string,any>;
export declare function toApprovedM9Registration(record:any):Record<string,any>;
