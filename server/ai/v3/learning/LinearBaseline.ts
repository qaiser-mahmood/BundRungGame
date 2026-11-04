import {FEATURE_COUNT} from '../data/Observation';
import {HEAD_CLASSES,Head} from '../data/Labels';
import type {TrainingRow} from './Rows';
export class LinearHead {
 readonly weights:number[];readonly bias:number[];temperature=1;trainingRows=0;
 constructor(readonly classes:number,weights?:number[],bias?:number[]){this.weights=weights?.slice()??new Array(classes*FEATURE_COUNT).fill(0);this.bias=bias?.slice()??new Array(classes).fill(0);this.validate();}
 validate():void {if(!Number.isSafeInteger(this.classes)||this.classes<2||this.classes>52||this.weights.length!==this.classes*FEATURE_COUNT||this.weights.some(x=>!Number.isFinite(x)||Math.abs(x)>1e6)||this.bias.length!==this.classes||this.bias.some(x=>!Number.isFinite(x)||Math.abs(x)>1e6)||!Number.isFinite(this.temperature)||this.temperature<.1||this.temperature>10||!Number.isSafeInteger(this.trainingRows)||this.trainingRows<0)throw new Error('V3_BASELINE_SCHEMA');}
 probabilities(x:number[],mask=new Array(this.classes).fill(1),temperature=this.temperature):number[]{
  if(x.length!==FEATURE_COUNT||x.some(n=>!Number.isFinite(n)||Math.abs(n)>2)||mask.length!==this.classes||mask.some(n=>n!==0&&n!==1)||!mask.some(Boolean)||!Number.isFinite(temperature)||temperature<.1||temperature>10)throw new Error('V3_INFERENCE_SCHEMA');
  const logits=mask.map((m,c)=>m?(this.bias[c]+x.reduce((n,v,i)=>n+v*this.weights[c*FEATURE_COUNT+i],0))/temperature:-Infinity),max=Math.max(...logits),p=logits.map(v=>Math.exp(v-max)),sum=p.reduce((a,b)=>a+b,0);return p.map(v=>v/sum);
 }
 fit(rows:TrainingRow[],epochs=20,rate=.03,l2=.001):void {
  if(!rows.length||!Number.isSafeInteger(epochs)||epochs<1||epochs>1000||!Number.isFinite(rate)||rate<=0||rate>1||!Number.isFinite(l2)||l2<0||l2>1)throw new Error('V3_TRAIN_CONFIG');
  const counts=new Array(this.classes).fill(0);
  for(const r of rows){if(r.target.length!==this.classes||r.target.some((p,i)=>!Number.isFinite(p)||p<0||p>1||(!r.mask[i]&&p!==0))||Math.abs(r.target.reduce((a,b)=>a+b,0)-1)>1e-6||!Number.isFinite(r.weight)||r.weight<=0)throw new Error('V3_TARGET_SCHEMA');this.probabilities(r.features,r.mask);r.target.forEach((p,i)=>counts[i]+=p*r.weight);}
  const total=counts.reduce((a,b)=>a+b,0),supported=Math.max(1,counts.filter(n=>n>0).length),classWeights=counts.map(n=>n?Math.min(5,total/(supported*n)):0);
  for(let epoch=0;epoch<epochs;epoch++)for(const r of rows){
   const p=this.probabilities(r.features,r.mask,1),target=r.target.map((v,i)=>v*classWeights[i]),norm=target.reduce((a,b)=>a+b,0);if(!norm)continue;
   for(let c=0;c<this.classes;c++)if(r.mask[c]){
    const gradient=r.weight*(p[c]*norm-target[c]);this.bias[c]-=rate*(gradient+l2*this.bias[c]);
    for(let i=0;i<FEATURE_COUNT;i++){const k=c*FEATURE_COUNT+i;this.weights[k]-=rate*(gradient*r.features[i]+l2*this.weights[k]);}
   }

  }
  this.trainingRows+=rows.length;this.validate();
 }
 predict(x:number[],mask?:number[],threshold=.6){
  if(!Number.isFinite(threshold)||threshold<0||threshold>1)throw new Error('V3_ABSTENTION_CONFIG');const probabilities=this.probabilities(x,mask);
  return {probabilities,abstain:this.trainingRows===0||Math.max(...probabilities)<threshold};
 }
}
export function evaluate(head:LinearHead,rows:TrainingRow[]){
 if(!rows.length)return null;
 let brier=0,logLoss=0,total=0,abstain=0;const bins=Array.from({length:10},()=>({weight:0,confidence:0,correct:0}));
 for(const r of rows){const p=head.probabilities(r.features,r.mask),best=p.reduce((a,v,i)=>v>p[a]?i:a,0),confidence=p[best],b=Math.min(9,Math.floor(confidence*10));
  brier+=r.weight*p.reduce((n,v,i)=>n+(v-r.target[i])**2,0);logLoss-=r.weight*r.target.reduce((n,v,i)=>n+v*Math.log(Math.max(1e-12,p[i])),0);total+=r.weight;
  bins[b].weight+=r.weight;bins[b].confidence+=r.weight*confidence;bins[b].correct+=r.weight*r.target[best];abstain+=r.weight*Number(head.predict(r.features,r.mask).abstain);
 }
 return {rows:rows.length,deals:new Set(rows.map(r=>r.dealKey)).size,brier:brier/total,logLoss:logLoss/total,ece:bins.reduce((n,b)=>n+Math.abs(b.confidence-b.correct),0)/total,abstentionRate:abstain/total,
  note:'Soft expert-belief scoring; partial card rankings evaluated conditionally on annotated alternatives.'};
}
export function calibrate(head:LinearHead,validation:TrainingRow[]):void {
 if(!validation.length)throw new Error('V3_VALIDATION_LABELS_REQUIRED');
 let best=1,loss=Infinity;
 for(const temperature of [.5,1,2,4]){head.temperature=temperature;const score=evaluate(head,validation)!.logLoss;if(score<loss){loss=score;best=temperature;}}
 head.temperature=best;
}
export type BaselineHeads=Record<Head,LinearHead>;
export const emptyBaseline=():BaselineHeads=>Object.fromEntries(Object.entries(HEAD_CLASSES).map(([head,classes])=>[head,new LinearHead(classes)])) as BaselineHeads;

export function frequencyBaseline(classes:number,train:TrainingRow[]):LinearHead {
 const counts=new Array(classes).fill(0);for(const r of train)r.target.forEach((p,i)=>counts[i]+=r.weight*p);
 const sum=counts.reduce((a,b)=>a+b,0);if(!sum)throw new Error('V3_TRAINING_PRIOR_REQUIRED');
 const head=new LinearHead(classes,undefined,counts.map(n=>Math.log(Math.max(1e-8,n/sum))));head.trainingRows=train.length;return head;
}
