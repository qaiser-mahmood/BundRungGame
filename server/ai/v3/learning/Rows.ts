import {Corpus,Split} from '../data/Corpus';
import {AcceptedDataset,Head,activeRecords,verifyAccepted} from '../data/Annotations';
export interface TrainingRow {head:Head;features:number[];mask:number[];target:number[];weight:number;dealKey:string;packetId:string;coverage:'complete'|'partial';}
export function trainingRows(corpus:Corpus,data:AcceptedDataset,split:Split):TrainingRow[]{
 verifyAccepted(corpus,data);if(split==='holdout')throw new Error('V3_FROZEN_HOLDOUT_NOT_TRAINING_DATA');
 const packets=new Map(corpus.packets.map(p=>[p.id,p])),rows:TrainingRow[]=[];
 for(const r of activeRecords(data).filter(r=>r.split===split)){
  const a=r.annotation,p=packets.get(a.packetId)!;
  const add=(head:Head,target:number[],confidence:number,mask=new Array(target.length).fill(1),coverage:'complete'|'partial'='complete')=>{if(confidence>0)rows.push({head,features:p.features.slice(),target:target.slice(),mask,weight:confidence,dealKey:p.dealKey,packetId:p.id,coverage});};
  const ranked=a.rankedActions.flat();
  if(ranked.length>=2){const target=new Array(52).fill(0);for(const c of a.rankedActions[0])target[c]=1/a.rankedActions[0].length;
   // Unmentioned actions in partial rankings are not invented negatives.
   const mask=a.coverage==='complete'?p.mask.slice():Array.from({length:52},(_,i)=>Number(ranked.includes(i)));add('card',target,a.actionConfidence,mask,a.coverage);
  }
  const shortageHeads=['shortageHearts','shortageDiamonds','shortageClubs','shortageSpades'] as const;
  a.latent.shortage.forEach((l,i)=>{if(l)add(shortageHeads[i],l.probabilities,l.confidence);});
  for(const head of ['returnSuit','leadControl','strategyPhase'] as const){const l=a.latent[head];if(l)add(head,l.probabilities,l.confidence);}
 }
 // Repeated experts enrich distributions without multiplying a position's
 // influence merely because it received more annotations.
 const counts=new Map<string,number>();for(const r of rows){const key=r.packetId+':'+r.head;counts.set(key,(counts.get(key)??0)+1);}
 for(const r of rows)r.weight/=counts.get(r.packetId+':'+r.head)!;return rows;
}
export function supervisionStatus(corpus:Corpus,data?:AcceptedDataset){
 if(data)verifyAccepted(corpus,data);const records=data?activeRecords(data):[];
 const counts=Object.fromEntries(['train','validation','holdout'].map(s=>[s,records.filter(r=>r.split===s).length]));
 const blockers:string[]=[];
 if(!records.length)blockers.push('Human expert annotations are missing; generated positions and bot actions are not expert labels.');
 if(!counts.train)blockers.push('No human training annotations.');if(!counts.validation)blockers.push('No independent human validation annotations.');
 const train=data?trainingRows(corpus,data,'train'):[],validation=data?trainingRows(corpus,data,'validation'):[];
 const usableHeads=[...new Set(train.map(r=>r.head))].filter(h=>validation.some(r=>r.head===h));
 if(!usableHeads.length)blockers.push('No head has both training and validation targets.');
 return {stage:'A plus offline training scaffolding',annotations:counts,usableHeads,blockers,readyForBaselineTraining:!blockers.length,
  readyForSearchIntegration:false,readyForSelfPlay:false,readyForSequenceModel:false};
}
