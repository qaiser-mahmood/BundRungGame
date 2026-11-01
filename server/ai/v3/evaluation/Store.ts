import {existsSync,readFileSync,writeFileSync,renameSync,mkdirSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {assignmentPackets,digest,verifyCorpus,type DecisionPacket} from '../data/Corpus';
import {validateAnnotation,importAnnotations,ANNOTATION_SCHEMA,type Annotation,type AnnotationBatch} from '../data/Annotations';
import type {EvaluationBundle} from './Prepare';
export type ReviewStatus='reviewed'|'ambiguous'|'insufficient'|'skipped';
export interface Submission {requestId:string;expectedRevision:number;status:ReviewStatus;selected:number|null;rankedAlternatives:number[][];reasoning:string;signals:string;uncertainty:string;confidence:number|null;principles:string[];}
export interface ReviewRecord {schema:'bundrung-expert-review/v1';id:string;annotatorId:string;packetId:string;observationHash:string;dealKey:string;seed:number;replayReference:string;actingPlayer:'relative-seat-0';legal:number[];revision:number;timestamp:string;blindAtSubmission:boolean;submission:Submission;annotation:Annotation|null;predictions:EvaluationBundle['predictions'][string];sourceCommit:string;manifestHash:string;split:string;}
const text=(x:unknown)=>typeof x==='string'&&x.length<=4000;
export class ReviewStore {
 readonly assigned:DecisionPacket[];private records:ReviewRecord[]=[];private filename:string;
 constructor(readonly directory:string,readonly bundle:EvaluationBundle,readonly principleIds:string[]){
  verifyCorpus(bundle.corpus);const {hash,...base}=bundle;if(hash!==digest(base))throw new Error('EVALUATION_BUNDLE_INTEGRITY');this.assigned=assignmentPackets(bundle.corpus);
  for(const p of this.assigned){const predictions=bundle.predictions[p.id];if(!predictions||predictions.v2.policy!=='ai-v2-ismcts'||predictions.v2.version!==bundle.corpus.manifest.config.sourceCommit||predictions.v3.policy!=='ai-v3-partnership'||predictions.v2.status!=='available'||predictions.v2.action===null||!p.mask[predictions.v2.action]||predictions.v3.status!=='not_available'||predictions.v3.action!==null)throw new Error('EVALUATION_MODEL_IDENTITY');}
  mkdirSync(directory,{recursive:true,mode:0o700});this.filename=join(directory,'reviews.json');
  if(existsSync(this.filename)){const saved=JSON.parse(readFileSync(this.filename,'utf8'));if(saved.bundleHash!==hash||digest(saved.records)!==saved.recordsHash)throw new Error('EVALUATION_STORE_INTEGRITY');this.records=saved.records;}
 }
 private flush(records:ReviewRecord[]){const temp=this.filename+'.'+randomUUID()+'.tmp';try{writeFileSync(temp,JSON.stringify({bundleHash:this.bundle.hash,recordsHash:digest(records),records},null,2)+'\n',{flag:'wx',mode:0o600});renameSync(temp,this.filename);}finally{if(existsSync(temp))unlinkSync(temp);}}
 latest(actor:string,packetId:string){return this.records.filter(r=>r.annotatorId===actor&&r.packetId===packetId).at(-1);}
 packet(id:string){const p=this.assigned.find(p=>p.id===id);if(!p)throw new Error('EVALUATION_UNKNOWN_ASSIGNED_PACKET');return p;}
 // Explicit DTO: never serialize the private bundle, predictions, seeds or split ledger.
 case(actor:string,id:string){const p=this.packet(id),last=this.latest(actor,id);return {id:p.id,observationHash:p.observationHash,observation:p.observation,context:this.bundle.context[id],revision:last?.revision??0,previous:last?{status:last.submission.status,selected:last.submission.selected,reasoning:last.submission.reasoning,signals:last.submission.signals,uncertainty:last.submission.uncertainty,confidence:last.submission.confidence,rankedAlternatives:last.submission.rankedAlternatives,principles:last.submission.principles}:null};}
 submit(actor:string,id:string,body:Submission):ReviewRecord {
  const p=this.packet(id);if(!/^[A-Za-z0-9_-]{3,64}$/.test(actor)||actor==='UNASSIGNED')throw new Error('EVALUATION_ACTOR');
  const fields=['requestId','expectedRevision','status','selected','rankedAlternatives','reasoning','signals','uncertainty','confidence','principles'];
  if(!body||Object.keys(body).some(k=>!fields.includes(k))||fields.some(k=>!(k in body))||typeof body.requestId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(body.requestId)||!Number.isSafeInteger(body.expectedRevision)||!['reviewed','ambiguous','insufficient','skipped'].includes(body.status)||!text(body.reasoning)||!text(body.signals)||!text(body.uncertainty)||body.confidence!==null&&(!Number.isFinite(body.confidence)||body.confidence<0||body.confidence>1)||!Array.isArray(body.principles)||new Set(body.principles).size!==body.principles.length||body.principles.some(p=>!this.principleIds.includes(p)))throw new Error('EVALUATION_SUBMISSION_SCHEMA');
  const prior=this.records.find(r=>r.annotatorId===actor&&r.submission.requestId===body.requestId);if(prior){if(prior.packetId!==id||digest(prior.submission)!==digest(body))throw new Error('EVALUATION_IDEMPOTENCY_CONFLICT');return prior;}
  const latest=this.latest(actor,id);if((latest?.revision??0)!==body.expectedRevision)throw new Error('EVALUATION_REVISION_CONFLICT');
  if(body.selected!==null&&(!Number.isSafeInteger(body.selected)||!p.mask[body.selected]))throw new Error('EVALUATION_ILLEGAL_ACTION');
  if(!Array.isArray(body.rankedAlternatives)||body.rankedAlternatives.some(g=>!Array.isArray(g)||!g.length))throw new Error('EVALUATION_RANKING');
  const ranked=body.rankedAlternatives.flat();if(new Set(ranked).size!==ranked.length||ranked.some(c=>!Number.isSafeInteger(c)||!p.mask[c]||c===body.selected)||ranked.length&&body.selected===null)throw new Error('EVALUATION_RANKING');
  if(body.status==='reviewed'&&(body.selected===null||!body.reasoning.trim()))throw new Error('EVALUATION_REASONED_ACTION_REQUIRED');
  if(body.status==='skipped'&&(body.selected!==null||ranked.length))throw new Error('EVALUATION_SKIP_ACTION');
  const revision=(latest?.revision??0)+1;
  const annotation:Annotation|null=body.status==='reviewed'&&body.confidence!==null?{packetId:p.id,observationHash:p.observationHash,revision,coverage:'partial',rankedActions:[[body.selected!],...body.rankedAlternatives],actionConfidence:body.confidence,reasoning:body.reasoning,latent:{shortage:[null,null,null,null],returnSuit:null,leadControl:null,strategyPhase:null}}:null;
  if(annotation)validateAnnotation(annotation,p);
  const source=this.bundle.corpus.manifest.sources.find(s=>s.packetId===id)!;
  // Any previous returned comparison compromises subsequent blind independence.
  const record:ReviewRecord={schema:'bundrung-expert-review/v1',id:randomUUID(),annotatorId:actor,packetId:id,observationHash:p.observationHash,dealKey:p.dealKey,seed:source.seed,replayReference:`${this.bundle.corpus.manifest.manifestHash}:${id}`,actingPlayer:'relative-seat-0',legal:p.observation.legal,revision,timestamp:new Date().toISOString(),blindAtSubmission:!this.records.some(r=>r.annotatorId===actor&&r.dealKey===p.dealKey&&r.submission.status!=='skipped'),submission:structuredClone(body),annotation,predictions:this.bundle.predictions[id],sourceCommit:this.bundle.corpus.manifest.config.sourceCommit,manifestHash:this.bundle.corpus.manifest.manifestHash,split:source.split};
  const next=[...this.records,record];this.flush(next);this.records=next;return record;
 }
 comparison(actor:string,id:string){const r=this.latest(actor,id);if(!r||r.submission.status==='skipped')throw new Error('EVALUATION_BLIND_REVIEW_REQUIRED');return {annotationId:r.id,revision:r.revision,expert:r.submission.selected,predictions:r.predictions,agreement:Object.fromEntries(Object.entries(r.predictions).map(([k,p])=>[k,p.status==='available'&&r.submission.selected!==null?p.action===r.submission.selected:null])),legal:r.legal,blindAtSubmission:r.blindAtSubmission};}
 recordsFor(actor?:string){return this.records.filter(r=>!actor||r.annotatorId===actor).map(r=>structuredClone(r));}
 exportTraining(){
  const eligible=this.records.filter(r=>r.blindAtSubmission&&r.annotation&&r.submission.status==='reviewed');
  const batches:AnnotationBatch[]=eligible.map(r=>({schema:ANNOTATION_SCHEMA,manifestHash:r.manifestHash,annotatorId:r.annotatorId,provenance:{kind:'human-expert',qualification:'self-declared'},annotations:[r.annotation!]}));
  return importAnnotations(this.bundle.corpus,batches);
 }
}
