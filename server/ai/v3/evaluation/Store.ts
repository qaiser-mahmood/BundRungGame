import {CallerCorrections,loadCallerAudit,type CorrectionBody,type CorrectionRecord} from './CallerCorrections';
import {legacyCallerCase} from './InformationBoundary';
import {pilotPackets} from './PilotSelection';
import {publicWinningPlay} from './Coverage';
import {existsSync,readFileSync,writeFileSync,renameSync,mkdirSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {assignmentPackets,digest,verifyCorpus,type DecisionPacket} from '../data/Corpus';
import {validateAnnotation,importAnnotations,ANNOTATION_SCHEMA,type Annotation,type AnnotationBatch} from '../data/Annotations';
import {firstIndependentReviews} from './IndependentReviews';
import type {EvaluationBundle} from './Prepare';
export type ReviewStatus='reviewed'|'ambiguous'|'insufficient'|'skipped';
export interface Submission {requestId:string;expectedRevision:number;status:ReviewStatus;selected:number|null;rankedAlternatives:number[][];reasoning:string;signals:string;uncertainty:string;confidence:number|null;principles:string[];actingObservationHash?:string;}
export interface ReviewRecord {schema:'bundrung-expert-review/v1';id:string;annotatorId:string;packetId:string;observationHash:string;dealKey:string;seed:number;replayReference:string;actingPlayer:'relative-seat-0';legal:number[];revision:number;timestamp:string;blindAtSubmission:boolean;submission:Submission;annotation:Annotation|null;predictions:EvaluationBundle['predictions'][string];sourceCommit:string;manifestHash:string;split:string;informationProvenance?:{kind:'first-complete-information-review';auditHash:string;actingObservationHash:string;originalObservationHash:string};}
const text=(x:unknown)=>typeof x==='string'&&x.length<=4000;
export class ReviewStore {
 readonly assigned:DecisionPacket[];readonly corrections:CallerCorrections|null;private records:ReviewRecord[]=[];private filename:string;
 constructor(readonly directory:string,readonly bundle:EvaluationBundle,readonly principleIds:string[]){
  verifyCorpus(bundle.corpus);const {hash,...base}=bundle;if(hash!==digest(base))throw new Error('EVALUATION_BUNDLE_INTEGRITY');this.assigned=bundle.pilot?pilotPackets(bundle.corpus,bundle.pilot):assignmentPackets(bundle.corpus);
  for(const p of this.assigned){if(bundle.pilot&&(!bundle.context[p.id]?.bidding||bundle.context[p.id].bidding!.seatStatuses.length!==4))throw new Error('PILOT_ESSENTIAL_CONTEXT_REQUIRED');const predictions=bundle.predictions[p.id];if(!predictions||predictions.v2.policy!=='ai-v2-ismcts'||predictions.v2.version!==bundle.corpus.manifest.config.sourceCommit||predictions.v3.policy!=='ai-v3-partnership'||predictions.v2.status!=='available'||predictions.v2.action===null||!p.mask[predictions.v2.action]||predictions.v3.status!=='not_available'||predictions.v3.action!==null)throw new Error('EVALUATION_MODEL_IDENTITY');}
  mkdirSync(directory,{recursive:true,mode:0o700});this.filename=join(directory,'reviews.json');
  if(existsSync(this.filename)){const saved=JSON.parse(readFileSync(this.filename,'utf8'));if(saved.bundleHash!==hash||digest(saved.records)!==saved.recordsHash)throw new Error('EVALUATION_STORE_INTEGRITY');this.records=saved.records;}
  const audit=loadCallerAudit(directory,bundle,this.records);this.corrections=audit?new CallerCorrections(directory,audit):null;
 }
 private flush(records:ReviewRecord[]){const temp=this.filename+'.'+randomUUID()+'.tmp';try{writeFileSync(temp,JSON.stringify({bundleHash:this.bundle.hash,recordsHash:digest(records),records},null,2)+'\n',{flag:'wx',mode:0o600});renameSync(temp,this.filename);}finally{if(existsSync(temp))unlinkSync(temp);}}
 latest(actor:string,packetId:string){return this.records.filter(r=>r.annotatorId===actor&&r.packetId===packetId).at(-1);}
 request(actor:string,packetId:string,requestId:string){this.packet(packetId);return this.records.find(r=>r.annotatorId===actor&&r.packetId===packetId&&r.submission.requestId===requestId);}
 packet(id:string){const p=this.assigned.find(p=>p.id===id);if(!p)throw new Error('EVALUATION_UNKNOWN_ASSIGNED_PACKET');return p;}
 // Explicit DTO: never serialize the private bundle, predictions, seeds or split ledger.
 needsInformationAudit(){return !this.corrections&&this.assigned.some(p=>legacyCallerCase(this.bundle,p.id));}
 affected(id:string){return legacyCallerCase(this.bundle,id);}
 correctionRequired(actor:string,id:string){const old=this.latest(actor,id);return this.affected(id)&&!!old&&old.submission.status==='reviewed'&&old.submission.selected!==null&&!old.informationProvenance&&!this.corrections?.latest(actor,id);}
 case(actor:string,id:string){const p=this.packet(id),last=this.latest(actor,id),entry=this.corrections?.entry(id),observation=entry?.correctedObservation??p.observation;
  return {id:p.id,observationHash:entry?.correctedObservationHash??p.observationHash,originalObservationHash:p.observationHash,observation,publicWinner:publicWinningPlay(observation),context:this.bundle.context[id],revision:last?.revision??0,requiresInformationMigration:this.affected(id)&&!this.corrections,correctionRequired:this.correctionRequired(actor,id),correctionManaged:this.affected(id)&&!!last&&last.submission.status==='reviewed'&&!last.informationProvenance,previous:last?{status:last.submission.status,selected:last.submission.selected,reasoning:last.submission.reasoning,signals:last.submission.signals,uncertainty:last.submission.uncertainty,confidence:last.submission.confidence,rankedAlternatives:last.submission.rankedAlternatives,principles:last.submission.principles}:null};
 }
 correctionCases(actor:string){return this.assigned.filter(p=>this.affected(p.id)&&this.latest(actor,p.id)?.submission.status==='reviewed'&&!this.latest(actor,p.id)?.informationProvenance).map(p=>({id:p.id,confirmed:!!this.corrections?.latest(actor,p.id)}));}
 correctionCase(actor:string,id:string){if(!this.corrections||!this.correctionCases(actor).some(p=>p.id===id))throw new Error('CALLER_CORRECTION_NOT_AVAILABLE');const original=this.latest(actor,id)!;return {...this.case(actor,id),originalReviewId:original.id,recordedCorrection:this.corrections.latest(actor,id)?.submission??null,correctionRevision:this.corrections.latest(actor,id)?.revision??0,originalDecision:{selected:original.submission.selected,reasoning:original.submission.reasoning,confidence:original.submission.confidence},question:'Knowing your trump suit and locked card, would you keep your original decision?'};}
 submitCorrection(actor:string,id:string,body:CorrectionBody){if(!this.correctionCases(actor).some(p=>p.id===id))throw new Error('CALLER_NO_ORIGINAL_DECISION');if(!this.corrections)throw new Error('CALLER_MIGRATION_REQUIRED');return this.corrections.submit(actor,id,body,this.latest(actor,id)!);}
 correctionComparison(actor:string,id:string,record:CorrectionRecord){if(!this.corrections||record.actor!==actor||record.packetId!==id)throw new Error('CALLER_CORRECTION_NOT_AVAILABLE');return this.corrections.comparison(record,this.latest(actor,id)!,this.bundle);}
 correctionSummary(actor?:string){const reviews=this.records.filter(r=>!actor||r.annotatorId===actor),blind=firstIndependentReviews(reviews),ledger=this.corrections?.all(actor)??[],latest=new Map<string,CorrectionRecord>();for(const r of ledger)latest.set(r.actor+':'+r.packetId,r);return {auditInstalled:!!this.corrections,originalBlindLabels:blind.filter(r=>!r.informationProvenance).length,eligibleOriginalBlindLabels:blind.filter(r=>!this.affected(r.packetId)).length,quarantinedAffectedLabels:blind.filter(r=>this.affected(r.packetId)).length,unconfirmedAffectedLabels:blind.filter(r=>this.affected(r.packetId)&&!this.corrections?.latest(r.annotatorId,r.packetId)).length,excludedCorrectionLabels:ledger.length,confirmedCorrections:[...latest.values()].filter(r=>r.submission.decision==='keep').length,changedCorrections:[...latest.values()].filter(r=>r.submission.decision==='change').length,correctionRevisionRecords:ledger.length,firstCompleteInformationReviews:reviews.filter(r=>r.informationProvenance).length,requiresConfirmation:[...new Set(actor?[actor]:reviews.map(r=>r.annotatorId))].reduce((n,a)=>n+this.correctionCases(a).filter(c=>!c.confirmed).length,0),casesReplayed:this.corrections?.audit.entries.length??0,affectedCases:this.assigned.filter(p=>this.affected(p.id)).length,automaticTrainingPolicy:'Affected legacy labels and every correction remain excluded; no exposed correction is promoted.'};}
 submit(actor:string,id:string,body:Submission):ReviewRecord {
  const p=this.packet(id);if(!/^[A-Za-z0-9_-]{3,64}$/.test(actor)||actor==='UNASSIGNED')throw new Error('EVALUATION_ACTOR');
  const fields=['requestId','expectedRevision','status','selected','rankedAlternatives','reasoning','signals','uncertainty','confidence','principles'];
  if(!body||Object.keys(body).some(k=>!fields.includes(k)&&k!=='actingObservationHash')||fields.some(k=>!(k in body))||typeof body.requestId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(body.requestId)||!Number.isSafeInteger(body.expectedRevision)||!['reviewed','ambiguous','insufficient','skipped'].includes(body.status)||!text(body.reasoning)||!text(body.signals)||!text(body.uncertainty)||body.confidence!==null&&(!Number.isFinite(body.confidence)||body.confidence<0||body.confidence>1)||!Array.isArray(body.principles)||new Set(body.principles).size!==body.principles.length||body.principles.some(p=>!this.principleIds.includes(p)))throw new Error('EVALUATION_SUBMISSION_SCHEMA');
  const prior=this.records.find(r=>r.annotatorId===actor&&r.submission.requestId===body.requestId);if(prior){if(prior.packetId!==id||digest(prior.submission)!==digest(body))throw new Error('EVALUATION_IDEMPOTENCY_CONFLICT');return prior;}
  const old=this.latest(actor,id);if(this.affected(id)&&(!this.corrections||old?.submission.status==='reviewed'&&!old.informationProvenance))throw new Error('EVALUATION_CALLER_CONFIRMATION_REQUIRED');
  const actualHash=this.corrections?.entry(id).correctedObservationHash??p.observationHash;
  if((this.affected(id)||this.bundle.corpus.manifest.config.observationVersion===2)&&body.actingObservationHash!==actualHash)throw new Error('EVALUATION_INFORMATION_BOUNDARY_CHANGED');
  const latest=this.latest(actor,id);if((latest?.revision??0)!==body.expectedRevision)throw new Error('EVALUATION_REVISION_CONFLICT');
  if(body.selected!==null&&(!Number.isSafeInteger(body.selected)||!p.mask[body.selected]))throw new Error('EVALUATION_ILLEGAL_ACTION');
  if(!Array.isArray(body.rankedAlternatives)||body.rankedAlternatives.some(g=>!Array.isArray(g)||!g.length))throw new Error('EVALUATION_RANKING');
  const ranked=body.rankedAlternatives.flat();if(new Set(ranked).size!==ranked.length||ranked.some(c=>!Number.isSafeInteger(c)||!p.mask[c]||c===body.selected)||ranked.length&&body.selected===null)throw new Error('EVALUATION_RANKING');
  if(body.status==='reviewed'&&(body.selected===null||!body.reasoning.trim()))throw new Error('EVALUATION_REASONED_ACTION_REQUIRED');
  if(['ambiguous','insufficient'].includes(body.status)&&!body.reasoning.trim()&&!body.uncertainty.trim())throw new Error('EVALUATION_EXPLAIN_ABSTENTION');
  if(body.status==='skipped'&&(body.selected!==null||ranked.length))throw new Error('EVALUATION_SKIP_ACTION');
  const revision=(latest?.revision??0)+1;
  const annotation:Annotation|null=body.status==='reviewed'&&body.confidence!==null&&!this.affected(id)?{packetId:p.id,observationHash:p.observationHash,revision,coverage:'partial',rankedActions:[[body.selected!],...body.rankedAlternatives],actionConfidence:body.confidence,reasoning:body.reasoning,latent:{shortage:[null,null,null,null],returnSuit:null,leadControl:null,strategyPhase:null}}:null;
  if(annotation)validateAnnotation(annotation,p);
  const source=this.bundle.corpus.manifest.sources.find(s=>s.packetId===id)!;
  // Any previous returned comparison compromises subsequent blind independence.
  const record:ReviewRecord={...(this.affected(id)&&this.corrections?{informationProvenance:{kind:'first-complete-information-review' as const,auditHash:this.corrections.audit.hash,actingObservationHash:actualHash,originalObservationHash:p.observationHash}}:{}),schema:'bundrung-expert-review/v1',id:randomUUID(),annotatorId:actor,packetId:id,observationHash:p.observationHash,dealKey:p.dealKey,seed:source.seed,replayReference:`${this.bundle.corpus.manifest.manifestHash}:${id}`,actingPlayer:'relative-seat-0',legal:p.observation.legal,revision,timestamp:new Date().toISOString(),blindAtSubmission:!this.records.some(r=>r.annotatorId===actor&&r.dealKey===p.dealKey&&r.submission.status!=='skipped'),submission:structuredClone(body),annotation,predictions:this.bundle.predictions[id],sourceCommit:this.bundle.corpus.manifest.config.sourceCommit,manifestHash:this.bundle.corpus.manifest.manifestHash,split:source.split};
  const next=[...this.records,record];this.flush(next);this.records=next;return record;
 }
 comparison(actor:string,id:string,revision?:number){const r=revision===undefined?this.latest(actor,id):this.records.find(r=>r.annotatorId===actor&&r.packetId===id&&r.revision===revision);if(!r||r.submission.status==='skipped')throw new Error('EVALUATION_BLIND_REVIEW_REQUIRED');
  if(this.affected(id)&&!r.informationProvenance){const correction=this.corrections?.latest(actor,id);if(correction&&revision===undefined)return this.correctionComparison(actor,id,correction);return {annotationId:r.id,revision:r.revision,expert:r.submission.selected,predictions:{},agreement:{},legal:r.legal,blindAtSubmission:r.blindAtSubmission,informationCorrectionRequired:true};}
  const fixed=r.informationProvenance&&this.corrections?this.corrections.entry(id).correctedV2:null;return {annotationId:r.id,revision:r.revision,expert:r.submission.selected,predictions:fixed?{...r.predictions,v2:fixed}:r.predictions,agreement:Object.fromEntries(Object.entries(fixed?{...r.predictions,v2:fixed}:r.predictions).map(([k,p])=>[k,p.status==='available'&&r.submission.selected!==null?p.action===r.submission.selected:null])),legal:r.legal,blindAtSubmission:r.blindAtSubmission};}
 recordsFor(actor?:string){return this.records.filter(r=>!actor||r.annotatorId===actor).map(r=>structuredClone(r));}
 exportTraining(){
  const eligible=firstIndependentReviews(this.records).filter(r=>r.annotation!==null&&!this.affected(r.packetId));
  const batches:AnnotationBatch[]=eligible.map(r=>({schema:ANNOTATION_SCHEMA,manifestHash:r.manifestHash,annotatorId:r.annotatorId,provenance:{kind:'human-expert',qualification:'self-declared'},annotations:[r.annotation!]}));
  return importAnnotations(this.bundle.corpus,batches);
 }
}
