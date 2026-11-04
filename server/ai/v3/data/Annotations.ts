import {Corpus,DecisionPacket,Split,digest,verifyCorpus,assignmentPackets} from './Corpus';
export const ANNOTATION_SCHEMA='bundrung-v3-expert-annotations/v1' as const;
export {HEAD_CLASSES} from './Labels';
export type {Head} from './Labels';
export interface BeliefLabel {probabilities:number[];confidence:number;uncertain:boolean;basis:'expert-belief'|'partner-self-report';rationale:string;}
export interface Annotation {
 packetId:string;observationHash:string;revision:number;coverage:'partial'|'complete';rankedActions:number[][];actionConfidence:number;reasoning:string;
 latent:{shortage:(BeliefLabel|null)[];returnSuit:BeliefLabel|null;leadControl:BeliefLabel|null;strategyPhase:BeliefLabel|null};
}
export interface AnnotationBatch {
 schema:typeof ANNOTATION_SCHEMA;manifestHash:string;annotatorId:string;provenance:{kind:'human-expert'|'unfilled-template';qualification:'self-declared'|'reviewed'};annotations:Annotation[];
}
export interface AcceptedRecord {annotatorId:string;qualification:'self-declared'|'reviewed';split:Split;annotation:Annotation;}
export interface AcceptedDataset {schema:typeof ANNOTATION_SCHEMA;manifestHash:string;records:AcceptedRecord[];datasetHash:string;}
const finiteProbability=(n:number)=>Number.isFinite(n)&&n>=0&&n<=1;
function text(s:unknown):boolean{return typeof s==='string'&&s.trim().length>0&&s.length<=4000;}
function label(l:BeliefLabel|null,classes:number):void {
 if(l===null)return;
 if(!l||!Array.isArray(l.probabilities)||l.probabilities.length!==classes||l.probabilities.some(p=>!finiteProbability(p))||Math.abs(l.probabilities.reduce((a,b)=>a+b,0)-1)>1e-6||!finiteProbability(l.confidence)||typeof l.uncertain!=='boolean'||!text(l.rationale)||!['expert-belief','partner-self-report'].includes(l.basis))throw new Error('V3_LATENT_LABEL_SCHEMA');
 // Generated bot trajectories cannot be relabelled as a human partner's intent.
 if(l.basis==='partner-self-report')throw new Error('V3_SELF_REPORT_REQUIRES_HUMAN_TRAJECTORY');
}
export function annotationTemplate(corpus:Corpus,annotatorId='UNASSIGNED',packetIds?:string[]):AnnotationBatch {
 verifyCorpus(corpus);const selected=packetIds?corpus.packets.filter(p=>packetIds.includes(p.id)):assignmentPackets(corpus);
 if(packetIds&&(new Set(packetIds).size!==packetIds.length||selected.length!==packetIds.length)||new Set(selected.map(p=>p.dealKey)).size!==selected.length)throw new Error('V3_ASSIGNMENT_CROSS_VIEW');
 return {schema:ANNOTATION_SCHEMA,manifestHash:corpus.manifest.manifestHash,annotatorId,provenance:{kind:'unfilled-template',qualification:'self-declared'},annotations:selected.map(p=>({packetId:p.id,observationHash:p.observationHash,revision:1,coverage:'partial',rankedActions:[],actionConfidence:0,reasoning:'',latent:{shortage:[null,null,null,null],returnSuit:null,leadControl:null,strategyPhase:null}}))};
}
export function validateAnnotation(a:Annotation,p:DecisionPacket):void {
 if(a.packetId!==p.id||a.observationHash!==p.observationHash||!Number.isSafeInteger(a.revision)||a.revision<1||!['partial','complete'].includes(a.coverage)||!Array.isArray(a.rankedActions)||a.rankedActions.some(g=>!Array.isArray(g)||!g.length)||!finiteProbability(a.actionConfidence)||!text(a.reasoning))throw new Error('V3_ANNOTATION_SCHEMA');
 const ranked=a.rankedActions.flat();if(!ranked.length&&(a.coverage!=='partial'||a.actionConfidence!==0))throw new Error('V3_EMPTY_RANKING');
 if(new Set(ranked).size!==ranked.length||ranked.some(c=>!Number.isSafeInteger(c)||c<0||c>=52||!p.mask[c])||a.coverage==='complete'&&ranked.length!==p.observation.legal.length)throw new Error('V3_ILLEGAL_OR_INCOMPLETE_RANKING');
 if(!a.latent||!Array.isArray(a.latent.shortage)||a.latent.shortage.length!==4)throw new Error('V3_LATENT_LABEL_SCHEMA');
 a.latent.shortage.forEach(l=>label(l,3));label(a.latent.returnSuit,5);label(a.latent.leadControl,3);label(a.latent.strategyPhase,6);
 // A public proof of void is a hard count fact, never a strategic guess.
 a.latent.shortage.forEach((l,s)=>{
  if(!l)return;if(p.observation.voids[p.observation.partner][s]&&l.probabilities[0]!==1)throw new Error('V3_LABEL_CONTRADICTS_PUBLIC_VOID');
  const known=p.observation.publicHands[p.observation.partner];if(known===null)return;
  const count=known.filter(c=>Math.floor(c/13)===s).length,minimum=Math.min(2,count),complete=known.length===p.observation.counts[p.observation.partner];
  if(l.probabilities.some((prob,i)=>prob>0&&(i<minimum||complete&&i!==minimum)))throw new Error('V3_LABEL_CONTRADICTS_DISCLOSURE');
 });
}
export function importAnnotations(corpus:Corpus,batches:AnnotationBatch[]):AcceptedDataset {
 verifyCorpus(corpus);const packets=new Map(corpus.packets.map(p=>[p.id,p])),sources=new Map(corpus.manifest.sources.map(s=>[s.packetId,s])),records:AcceptedRecord[]=[],revisions=new Map<string,string>(),views=new Map<string,string>();
 for(const b of batches){
  if(b.schema!==ANNOTATION_SCHEMA||b.manifestHash!==corpus.manifest.manifestHash||!/^[a-zA-Z0-9_-]{3,64}$/.test(b.annotatorId)||b.annotatorId==='UNASSIGNED'||b.provenance?.kind!=='human-expert'||!['self-declared','reviewed'].includes(b.provenance.qualification)||!Array.isArray(b.annotations))throw new Error('V3_HUMAN_ANNOTATION_PROVENANCE_REQUIRED');
  for(const a of b.annotations){const p=packets.get(a.packetId);if(!p)throw new Error('V3_UNKNOWN_PACKET');validateAnnotation(a,p);
   const viewKey=b.annotatorId+':'+p.dealKey;if(views.has(viewKey)&&views.get(viewKey)!==p.id)throw new Error('V3_ANNOTATOR_CROSS_VIEW_OR_FUTURE_LEAKAGE');views.set(viewKey,p.id);
   const key=`${a.packetId}:${b.annotatorId}:${a.revision}`,hash=digest(a);if(revisions.has(key)){if(revisions.get(key)!==hash)throw new Error('V3_CONFLICTING_REVISION');continue;}revisions.set(key,hash);
   records.push({annotatorId:b.annotatorId,qualification:b.provenance.qualification,split:sources.get(a.packetId)!.split,annotation:a});
  }
 }
 records.sort((a,b)=>a.annotation.packetId.localeCompare(b.annotation.packetId)||a.annotatorId.localeCompare(b.annotatorId)||a.annotation.revision-b.annotation.revision);
 const base={schema:ANNOTATION_SCHEMA,manifestHash:corpus.manifest.manifestHash,records};return {...base,datasetHash:digest(base)};
}
export function activeRecords(data:AcceptedDataset):AcceptedRecord[]{
 const {datasetHash,...base}=data;if(data.schema!==ANNOTATION_SCHEMA||digest(base)!==datasetHash)throw new Error('V3_ANNOTATION_DATASET_INTEGRITY');
 const latest=new Map<string,AcceptedRecord>();for(const r of data.records){const key=`${r.annotation.packetId}:${r.annotatorId}`,old=latest.get(key);if(!old||old.annotation.revision<r.annotation.revision)latest.set(key,r);}return [...latest.values()];
}
export function verifyAccepted(corpus:Corpus,data:AcceptedDataset):void {
 verifyCorpus(corpus);activeRecords(data);if(data.manifestHash!==corpus.manifest.manifestHash)throw new Error('V3_ANNOTATION_MANIFEST');
 const sources=new Map(corpus.manifest.sources.map(s=>[s.packetId,s])),packets=new Map(corpus.packets.map(p=>[p.id,p])),views=new Map<string,string>();
 for(const r of data.records){const p=packets.get(r.annotation.packetId);if(!p||r.split!==sources.get(p.id)!.split||!/^[a-zA-Z0-9_-]{3,64}$/.test(r.annotatorId)||!['self-declared','reviewed'].includes(r.qualification))throw new Error('V3_ANNOTATION_SOURCE');validateAnnotation(r.annotation,p);const key=r.annotatorId+':'+p.dealKey;if(views.has(key)&&views.get(key)!==p.id)throw new Error('V3_ANNOTATOR_CROSS_VIEW_OR_FUTURE_LEAKAGE');views.set(key,p.id);}
}
export function annotationReport(data:AcceptedDataset){
 const records=activeRecords(data),byPacket=new Map<string,AcceptedRecord[]>();for(const r of records){const xs=byPacket.get(r.annotation.packetId)??[];xs.push(r);byPacket.set(r.annotation.packetId,xs);}
 let comparisons=0,topOverlap=0,strictPairs=0,opposedPairs=0;const latentDistances:Record<string,{pairs:number;squaredDistance:number}>={};for(const xs of byPacket.values())for(let i=0;i<xs.length;i++)for(let j=i+1;j<xs.length;j++){
  const first=xs[i].annotation,second=xs[j].annotation;
  const latent=(a:Annotation)=>({returnSuit:a.latent.returnSuit,leadControl:a.latent.leadControl,strategyPhase:a.latent.strategyPhase,...Object.fromEntries(a.latent.shortage.map((l,i)=>['shortage.'+i,l]))});
  const la=latent(first),lb=latent(second);for(const key of Object.keys(la)){const a=(la as Record<string,BeliefLabel|null>)[key],b=(lb as Record<string,BeliefLabel|null>)[key];if(!a||!b)continue;const d=latentDistances[key]??{pairs:0,squaredDistance:0};d.pairs++;d.squaredDistance+=a.probabilities.reduce((n,p,k)=>n+(p-b.probabilities[k])**2,0);latentDistances[key]=d;}
  const rank=(a:Annotation)=>new Map(a.rankedActions.flatMap((g,i)=>g.map(c=>[c,i] as const))),ra=rank(first),rb=rank(second),common=[...ra.keys()].filter(c=>rb.has(c));
  for(let x=0;x<common.length;x++)for(let y=x+1;y<common.length;y++){const da=Math.sign(ra.get(common[x])!-ra.get(common[y])!),db=Math.sign(rb.get(common[x])!-rb.get(common[y])!);if(da&&db){strictPairs++;opposedPairs+=Number(da!==db);}}
  const a=xs[i].annotation.rankedActions[0],b=xs[j].annotation.rankedActions[0];if(!a||!b)continue;topOverlap+=Number(a.some(c=>b.includes(c)));comparisons++;
 }
 return {activeRecords:records.length,revisionRecords:data.records.length,annotators:new Set(records.map(r=>r.annotatorId)).size,positions:byPacket.size,
  bySplit:Object.fromEntries(['train','validation','holdout'].map(s=>[s,records.filter(r=>r.split===s).length])),
  disagreement:{pairedAnnotatorComparisons:comparisons,topTierOverlapRate:comparisons?topOverlap/comparisons:null,strictCommonPairs:strictPairs,opposedPairs,orderedCommonPairDisagreementRate:strictPairs?opposedPairs/strictPairs:null,latent:Object.fromEntries(Object.entries(latentDistances).map(([k,v])=>[k,{pairs:v.pairs,meanSquaredProbabilityDistance:v.squaredDistance/v.pairs}]))},
  warning:'Human expertise is declared/reviewed outside this tool; expert beliefs are not objective mental-state ground truth. Top-tier overlap is descriptive; partial rankings can be incomparable.'};
}
