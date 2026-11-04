import {existsSync,readFileSync,writeFileSync,renameSync,unlinkSync,mkdirSync,readdirSync,lstatSync,copyFileSync,constants,openSync,closeSync} from 'node:fs';
import {join,relative,dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {digest} from '../data/Integrity';
import {observePlayerDecision,vectorize,type DecisionObservation} from '../data/Observation';
import {validateAnnotation} from '../data/Annotations';
import {verifyCorpus,generateCorpus} from '../data/Corpus';
import {replayDecision} from './Replay';
import {evaluatePlayerV2,type EvaluationBundle,type Prediction} from './Prepare';
import type {ReviewRecord} from './Store';
import {legacyCallerCase} from './InformationBoundary';
export const AUDIT_FILE='caller-private-audit.json',CORRECTIONS_FILE='caller-private-corrections.json';
export interface AuditEntry {packetId:string;originalObservationHash:string;classification:'unaffected'|'requires_confirmation'|'unresolved';actorWasCaller:boolean;trumpWasHidden:boolean;correctedObservation:DecisionObservation;correctedObservationHash:string;originalV2:Prediction;correctedV2:Prediction;replayEvidence:{sourceSeed:number;sourceSplit:string;privateEvidenceHash:string;legalUnchanged:true};}
export interface CallerAudit {schema:'caller-private-audit/v1';bundleHash:string;originalBundleFileHash:string;originalReviewsFileHash:string|null;baselineRecords:{id:string;hash:string}[];backupDirectory:string;backupInventory:Record<string,string>;sourceCommit:string;createdAt:string;entries:AuditEntry[];hash:string;}
export interface CorrectionBody {requestId:string;expectedRevision:number;originalReviewId:string;decision:'keep'|'change';selected:number;reasoning:string;confidence:number|null;status:'reviewed';}
export interface CorrectionRecord {id:string;actor:string;packetId:string;revision:number;timestamp:string;auditHash:string;originalReviewId:string;originalObservationHash:string;correctedObservationHash:string;previousAIExposure:boolean;independent:false;provenance:'confirmed-original-after-information-restoration'|'changed-after-information-restoration';submission:CorrectionBody;}
const bytes=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
function noLinks(path:string){let current=path;for(;;){if(existsSync(current)&&lstatSync(current).isSymbolicLink())throw new Error('CALLER_MIGRATION_SYMLINK_REFUSED');const parent=dirname(current);if(parent===current)break;current=parent;}}
function atomic(file:string,value:unknown){const temp=file+'.'+randomUUID()+'.tmp';try{writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});renameSync(temp,file);}finally{if(existsSync(temp))unlinkSync(temp);}}
function inventory(directory:string){const files:Record<string,string>={};function walk(path:string){for(const entry of readdirSync(path,{withFileTypes:true})){const file=join(path,entry.name),name=relative(directory,file);if(path===directory&&['writer.lock','.caller-knowledge-backup',AUDIT_FILE,CORRECTIONS_FILE].includes(entry.name))continue;if(lstatSync(file).isSymbolicLink())throw new Error('CALLER_MIGRATION_SYMLINK_REFUSED');if(entry.isDirectory())walk(file);else if(entry.isFile())files[name]=bytes(file);else throw new Error('CALLER_MIGRATION_UNSUPPORTED_FILE');}}walk(directory);return files;}
function validateOriginalReviews(bundle:EvaluationBundle,records:ReviewRecord[]){
 const seen=new Set<string>(),revisions=new Map<string,number>();
 for(const r of records){const p=bundle.corpus.packets.find(p=>p.id===r.packetId),source=bundle.corpus.manifest.sources.find(s=>s.packetId===r.packetId),key=r.annotatorId+':'+r.packetId;
  if(!p||!source||!bundle.predictions[p.id]||seen.has(r.id)||r.schema!=='bundrung-expert-review/v1'||r.observationHash!==p.observationHash||r.manifestHash!==bundle.corpus.manifest.manifestHash||r.dealKey!==p.dealKey||r.seed!==source.seed||r.split!==source.split||digest(r.legal)!==digest(p.observation.legal)||digest(r.predictions)!==digest(bundle.predictions[p.id])||r.revision!==(revisions.get(key)??0)+1||r.submission.expectedRevision!==r.revision-1||!['reviewed','skipped','ambiguous','insufficient'].includes(r.submission.status)||r.submission.selected!==null&&!p.mask[r.submission.selected]||r.submission.status==='reviewed'&&r.submission.selected===null||r.submission.status==='skipped'&&r.submission.selected!==null)throw new Error('CALLER_ORIGINAL_REVIEW_INVALID');
  if(r.annotation){validateAnnotation(r.annotation,p);if(r.annotation.revision!==r.revision||r.annotation.reasoning!==r.submission.reasoning||r.annotation.actionConfidence!==r.submission.confidence||r.annotation.rankedActions[0]?.[0]!==r.submission.selected)throw new Error('CALLER_ORIGINAL_ANNOTATION_INVALID');}
  seen.add(r.id);revisions.set(key,r.revision);
 }
}
export function loadCallerAudit(directory:string,bundle:EvaluationBundle,records:ReviewRecord[]):CallerAudit|null {
 const path=join(directory,AUDIT_FILE);noLinks(path);if(!existsSync(path))return null;const audit=JSON.parse(readFileSync(path,'utf8')) as CallerAudit,{hash,...base}=audit;
 if(audit.schema!=='caller-private-audit/v1'||digest(base)!==hash||audit.bundleHash!==bundle.hash||bytes(join(directory,'bundle.json'))!==audit.originalBundleFileHash||audit.entries.length!==Object.keys(bundle.predictions).length)throw new Error('CALLER_AUDIT_INTEGRITY');
 for(const original of audit.baselineRecords)if(!records.some(r=>r.id===original.id&&digest(r)===original.hash))throw new Error('CALLER_ORIGINAL_REVIEW_CHANGED');
 for(const [file,sha] of Object.entries(audit.backupInventory)){const target=join(directory,audit.backupDirectory,file);noLinks(target);if(!existsSync(target)||bytes(target)!==sha)throw new Error('CALLER_VERIFIED_BACKUP_MISSING');}
 const ids=new Set<string>();for(const e of audit.entries){const p=bundle.corpus.packets.find(p=>p.id===e.packetId);vectorize(e.correctedObservation);if(ids.has(e.packetId)||!p||p.observationHash!==e.originalObservationHash||p.observation.caller!==e.correctedObservation.caller||p.observation.trumpRevealed!==e.correctedObservation.trumpRevealed||digest(e.correctedObservation)!==e.correctedObservationHash||digest(e.correctedObservation.legal)!==digest(p.observation.legal)||e.classification==='unresolved')throw new Error('CALLER_AUDIT_ENTRY_INVALID');ids.add(e.packetId);}
 return audit;
}
/** Local-only migration: original files are never written. Entire private directory backed up first. */
export function migrateCallerKnowledge(directory:string,bundle:EvaluationBundle,records:ReviewRecord[],sourceCommit:string){
 const lock=join(directory,'writer.lock'),fd=openSync(lock,'wx',0o600);writeFileSync(fd,String(process.pid));
 try{
  const existing=loadCallerAudit(directory,bundle,records);if(existing)return {idempotent:true,audit:existing};
  if(existsSync(join(directory,CORRECTIONS_FILE)))throw new Error('CALLER_CORRECTION_LEDGER_WITHOUT_AUDIT');
  if(!/^[a-f0-9]{40}$/.test(sourceCommit))throw new Error('CALLER_MIGRATION_SOURCE_COMMIT_REQUIRED');
  verifyCorpus(bundle.corpus);validateOriginalReviews(bundle,records);const {hash,...base}=bundle;if(digest(base)!==hash)throw new Error('EVALUATION_BUNDLE_INTEGRITY');
  const source=inventory(directory),backupDirectory=join('.caller-knowledge-backup',digest(source)),backup=join(directory,backupDirectory);noLinks(backup);mkdirSync(backup,{recursive:true,mode:0o700});
  for(const [file,sha] of Object.entries(source)){const target=join(backup,file);noLinks(target);mkdirSync(dirname(target),{recursive:true,mode:0o700});if(!existsSync(target))copyFileSync(join(directory,file),target,constants.COPYFILE_EXCL);if(bytes(target)!==sha)throw new Error('CALLER_BACKUP_VERIFICATION_FAILED');}
  atomic(join(backup,'verified-backup.json'),{schema:'caller-private-backup/v1',files:source,inventoryHash:digest(source)});
  if(digest(inventory(directory))!==digest(source))throw new Error('CALLER_SOURCE_CHANGED_DURING_BACKUP');
  if(generateCorpus(bundle.corpus.manifest.config).manifest.manifestHash!==bundle.corpus.manifest.manifestHash){atomic(join(backup,'unresolved-audit-'+randomUUID()+'.json'),{schema:'caller-private-unresolved/v1',unresolved:Object.keys(bundle.predictions).map(id=>({packetId:id,originalObservationHash:bundle.corpus.packets.find(p=>p.id===id)!.observationHash,classification:'unresolved',reason:'CORPUS_REPLAY_MISMATCH'}))});throw new Error('CALLER_REPLAY_UNRESOLVED: original corpus configuration cannot be replayed');}
  const entries:AuditEntry[]=[],unresolved:{packetId:string;originalObservationHash:string;classification:'unresolved';reason:string}[]=[];
  for(const id of Object.keys(bundle.predictions)){
   const p=bundle.corpus.packets.find(p=>p.id===id)!;
   try{const {state,priv,legal}=replayDecision(bundle.corpus,p),actorWasCaller=state.trumpCallerPlayerId===priv.myPlayerId,trumpWasHidden=!state.isTrumpRevealed;
    if(actorWasCaller!==(p.observation.caller===0))throw new Error('CALLER_RELATIVE_MAPPING_MISMATCH');
    const correctedObservation=observePlayerDecision(state,priv);vectorize(correctedObservation);if(digest(correctedObservation.legal)!==digest(p.observation.legal))throw new Error('CALLER_LEGAL_SET_CHANGED');
    const affected=legacyCallerCase(bundle,id),sourceRecord=bundle.corpus.manifest.sources.find(s=>s.packetId===id)!;
    entries.push({packetId:id,originalObservationHash:p.observationHash,classification:affected?'requires_confirmation':'unaffected',actorWasCaller,trumpWasHidden,correctedObservation,correctedObservationHash:digest(correctedObservation),originalV2:bundle.predictions[id].v2,correctedV2:affected?evaluatePlayerV2(state,priv,legal,id,sourceCommit):bundle.predictions[id].v2,replayEvidence:{sourceSeed:sourceRecord.seed,sourceSplit:sourceRecord.split,privateEvidenceHash:digest({callerPrivate:correctedObservation.callerPrivate,ownConcealedCards:correctedObservation.ownConcealedCards,legal:correctedObservation.legal}),legalUnchanged:true}});
   }catch(error){unresolved.push({packetId:id,originalObservationHash:p.observationHash,classification:'unresolved',reason:error instanceof Error?error.message:'REPLAY_FAILURE'});}
  }
  if(unresolved.length){atomic(join(backup,'unresolved-audit-'+randomUUID()+'.json'),{schema:'caller-private-unresolved/v1',bundleHash:bundle.hash,unresolved,validated:entries.map(e=>({packetId:e.packetId,classification:e.classification}))});throw new Error('CALLER_REPLAY_UNRESOLVED: no audit activated; see verified backup/unresolved-audit-*.json');}
  if(digest(inventory(directory))!==digest(source))throw new Error('CALLER_SOURCE_CHANGED_DURING_AUDIT');
  const auditBase={schema:'caller-private-audit/v1' as const,bundleHash:bundle.hash,originalBundleFileHash:source['bundle.json'],originalReviewsFileHash:source['reviews.json']??null,baselineRecords:records.map(r=>({id:r.id,hash:digest(r)})),backupDirectory,backupInventory:source,sourceCommit,createdAt:new Date().toISOString(),entries};const audit={...auditBase,hash:digest(auditBase)};atomic(join(directory,AUDIT_FILE),audit);
  if(digest(inventory(directory))!==digest(source))throw new Error('CALLER_ORIGINAL_FILES_CHANGED');return {idempotent:false,audit};
 }finally{closeSync(fd);unlinkSync(lock);}
}
export class CallerCorrections {
 private records:CorrectionRecord[]=[];
 constructor(readonly directory:string,readonly audit:CallerAudit){const file=join(directory,CORRECTIONS_FILE);noLinks(file);if(existsSync(file)){const data=JSON.parse(readFileSync(file,'utf8'));if(data.auditHash!==audit.hash||digest(data.records)!==data.recordsHash)throw new Error('CALLER_CORRECTIONS_INTEGRITY');this.records=data.records;}}
 entry(id:string){const entry=this.audit.entries.find(e=>e.packetId===id);if(!entry)throw new Error('CALLER_AUDIT_CASE_MISSING');return entry;}
 latest(actor:string,id:string){return this.records.filter(r=>r.actor===actor&&r.packetId===id).at(-1);}
 request(actor:string,id:string,requestId:string){return this.records.find(r=>r.actor===actor&&r.packetId===id&&r.submission.requestId===requestId);}
 submit(actor:string,id:string,body:CorrectionBody,original:ReviewRecord){
  const e=this.entry(id);if(e.classification!=='requires_confirmation'||original.annotatorId!==actor||original.packetId!==id||original.submission.status!=='reviewed'||original.submission.selected===null)throw new Error('CALLER_NO_ORIGINAL_DECISION');
  const fields=['requestId','expectedRevision','originalReviewId','decision','selected','reasoning','confidence','status'];
  if(!body||Object.keys(body).some(k=>!fields.includes(k))||fields.some(k=>!(k in body))||typeof body.requestId!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(body.requestId)||body.originalReviewId!==original.id||!Number.isSafeInteger(body.expectedRevision)||!['keep','change'].includes(body.decision)||body.status!=='reviewed'||!Number.isSafeInteger(body.selected)||!e.correctedObservation.legal.includes(body.selected)||typeof body.reasoning!=='string'||!body.reasoning.trim()||body.reasoning.length>4000||body.confidence!==null&&(!Number.isFinite(body.confidence)||body.confidence<0||body.confidence>1)||body.decision==='keep'&&(body.selected!==original.submission.selected||body.reasoning!==original.submission.reasoning||body.confidence!==original.submission.confidence)||body.decision==='change'&&body.selected===original.submission.selected)throw new Error('CALLER_CORRECTION_INVALID');
  const prior=this.request(actor,id,body.requestId);if(prior){if(digest(prior.submission)!==digest(body))throw new Error('EVALUATION_IDEMPOTENCY_CONFLICT');return prior;}
  const latest=this.latest(actor,id);if((latest?.revision??0)!==body.expectedRevision)throw new Error('EVALUATION_REVISION_CONFLICT');
  const record:CorrectionRecord={id:randomUUID(),actor,packetId:id,revision:(latest?.revision??0)+1,timestamp:new Date().toISOString(),auditHash:this.audit.hash,originalReviewId:original.id,originalObservationHash:e.originalObservationHash,correctedObservationHash:e.correctedObservationHash,previousAIExposure:true,independent:false,provenance:body.decision==='keep'?'confirmed-original-after-information-restoration':'changed-after-information-restoration',submission:structuredClone(body)};
  const next=[...this.records,record];atomic(join(this.directory,CORRECTIONS_FILE),{schema:'caller-private-corrections/v1',auditHash:this.audit.hash,records:next,recordsHash:digest(next)});this.records=next;return record;
 }
 comparison(record:CorrectionRecord,original:ReviewRecord,bundle:EvaluationBundle){const e=this.entry(record.packetId),old=e.originalV2.action,now=e.correctedV2.action,choice=record.submission.selected;return {revision:record.revision,expert:choice,predictions:{v2:e.correctedV2,v3:bundle.predictions[record.packetId].v3},agreement:{v2:now===choice,v3:null},legal:e.correctedObservation.legal,blindAtSubmission:false,provenance:record.provenance,historical:{originalV2:old,correctedV2:now,originalExpert:original.submission.selected,confirmedOrCorrectedExpert:choice,originalAgreement:old===original.submission.selected,correctedAgreement:now===choice,agreementChanged:(old===original.submission.selected)!==(now===choice)}};}
 all(actor?:string){return this.records.filter(r=>!actor||r.actor===actor).map(r=>structuredClone(r));}
}
