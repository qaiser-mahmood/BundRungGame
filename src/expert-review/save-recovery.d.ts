export interface PendingSave {schema:string;caseId:string;kind?:'review'|'correction';payload:string;}
export interface RecoveryOutcome {kind:'saved'|'rejected'|'uncertain'|'retryable';result?:any;error?:string;draft?:string;}
export class SaveRecovery {
 constructor(storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>,key:string,request:(path:string,payload?:string)=>Promise<any>);
 pending:PendingSave|null;state:string;active:boolean;
 begin(caseId:string,submission:unknown,kind?:'review'|'correction'):void;
 send():Promise<RecoveryOutcome>;
 reconcile():Promise<RecoveryOutcome>;
}
