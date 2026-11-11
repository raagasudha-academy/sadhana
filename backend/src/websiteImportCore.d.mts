export declare function markerId(institution:string,registrationId:string):string;
export declare function guardianLinkId(institution:string,guardianId:string,studentId:string):string;
export declare function websiteContactGuardLookupIds(institution:'raaga'|'sruti',plannedGuardId:string,email:string):string[];
export declare function contactGuardOwnerInstitution(counter:Record<string,any>|undefined,family?:Record<string,any>):string|undefined;
export declare function isOrphanedWebsiteContactGuard(counter:Record<string,any>|undefined,family?:Record<string,any>):boolean;
export declare function assertWebsiteContactGuardAvailable(institution:'raaga'|'sruti',plannedGuardId:string,contacts:Array<{counterId:string;item?:Record<string,any>;ownerInstitution?:string;orphanedFamily?:boolean}>):void;
export declare function prepareWebsiteImport(registration:any,institution:'raaga'|'sruti',actorSub:string,counters:{family:number;student:number},now?:string):{
 institution:string;contactGuardId:string;registrationId:string;externalRegistrationId:string;familyId:string;familyNumber:string;
 studentMappings:Array<{sourcePersonId:string;studentId:string;rollNumber:string}>;
 items:Array<{table:'families'|'people'|'family-links'|'counters'|'registrations'|'audit';item:Record<string,any>}>;
 counters:{family:{current:number;next:number};student:{current:number;next:number}};
 verifiedGuardianLinks:number;externalSyncPending:boolean;
};
