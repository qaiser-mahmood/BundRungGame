import {FEATURE_COUNT,FEATURE_SCHEMA} from './Features';
export interface Example {schema:typeof FEATURE_SCHEMA;features:number[];mask:number[];visits:number[];reward:number;seed:number;}
export interface Weights {schema:'v2-linear-policy-value/1';featureSchema:typeof FEATURE_SCHEMA;seed:number;steps:number;policy:number[];value:number[];}
export function validateExample(e:Example):void {
 if(e.schema!==FEATURE_SCHEMA||e.features.length!==FEATURE_COUNT||e.features.some(x=>!Number.isFinite(x)||Math.abs(x)>16)||e.mask.length!==52||e.mask.some(x=>x!==0&&x!==1)||!e.mask.some(Boolean)||
 e.visits.length!==52||e.visits.some((x,i)=>!Number.isFinite(x)||x<0||(!e.mask[i]&&x!==0))||Math.abs(e.visits.reduce((a,b)=>a+b,0)-1)>1e-6||!Number.isFinite(e.reward)||Math.abs(e.reward)>1||!Number.isSafeInteger(e.seed))throw new Error('V2_EXAMPLE_SCHEMA');
}
export function validateWeights(w:Weights):void {
 if(w.schema!=='v2-linear-policy-value/1'||w.featureSchema!==FEATURE_SCHEMA||!Number.isSafeInteger(w.seed)||!Number.isSafeInteger(w.steps)||w.steps<0||
 !Array.isArray(w.policy)||w.policy.length!==52*FEATURE_COUNT||w.policy.some(v=>!Number.isFinite(v)||Math.abs(v)>1e6)||!Array.isArray(w.value)||w.value.length!==FEATURE_COUNT||w.value.some(v=>!Number.isFinite(v)||Math.abs(v)>1e6))throw new Error('V2_CHECKPOINT_SCHEMA');
}
export class ExperimentalModel {
 constructor(readonly weights:Weights){validateWeights(weights);}
 static create(seed:number,random:()=>number):ExperimentalModel{return new ExperimentalModel({schema:'v2-linear-policy-value/1',featureSchema:FEATURE_SCHEMA,seed,steps:0,policy:Array.from({length:52*FEATURE_COUNT},()=>.001*(random()-.5)),value:Array.from({length:FEATURE_COUNT},()=>.001*(random()-.5))});}
 predict(x:number[],mask:number[]):{policy:number[];value:number}{
  if(x.length!==FEATURE_COUNT||x.some(v=>!Number.isFinite(v)||Math.abs(v)>16)||mask.length!==52||mask.some(v=>v!==0&&v!==1)||!mask.some(Boolean))throw new Error('V2_INFERENCE_SCHEMA');
  const logits=mask.map((m,a)=>m?x.reduce((s,v,i)=>s+v*this.weights.policy[a*FEATURE_COUNT+i],0):-Infinity),max=Math.max(...logits);
  const p=logits.map(v=>Math.exp(v-max)),sum=p.reduce((a,b)=>a+b,0);return {policy:p.map(v=>v/sum),value:Math.tanh(x.reduce((s,v,i)=>s+v*this.weights.value[i],0))};
 }
 train(examples:Example[],epochs=1,rate=.01):{policyLoss:number;valueLoss:number}{
  if(!examples.length||!Number.isSafeInteger(epochs)||epochs<1||epochs>100||!Number.isFinite(rate)||rate<=0||rate>1)throw new Error('V2_TRAIN_CONFIG');examples.forEach(validateExample);
  let policyLoss=0,valueLoss=0;
  for(let epoch=0;epoch<epochs;epoch++)for(const e of examples){const pred=this.predict(e.features,e.mask);
   policyLoss-=e.visits.reduce((s,v,a)=>s+v*Math.log(Math.max(1e-12,pred.policy[a])),0);valueLoss+=(pred.value-e.reward)**2;
   for(let a=0;a<52;a++)if(e.mask[a])for(let i=0;i<FEATURE_COUNT;i++)this.weights.policy[a*FEATURE_COUNT+i]-=rate*(pred.policy[a]-e.visits[a])*e.features[i];
   const grad=2*(pred.value-e.reward)*(1-pred.value**2);for(let i=0;i<FEATURE_COUNT;i++)this.weights.value[i]-=rate*grad*e.features[i];this.weights.steps++;
  }
  validateWeights(this.weights);return {policyLoss:policyLoss/(epochs*examples.length),valueLoss:valueLoss/(epochs*examples.length)};
 }
}
