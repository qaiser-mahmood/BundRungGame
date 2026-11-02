import {readFileSync} from 'node:fs';
import {PLAYER_FEATURE_COUNT,PLAYER_FEATURE_SCHEMA} from '../data/Observation';

export interface PolicyInference {probabilities(x:number[],mask:number[]):number[];action(x:number[],mask:number[]):number;}
export interface DenseLayer {inputs:number;outputs:number;weights:number[];bias:number[];}
/** CPU inference only. NumPy training exports row-major [output,input] weights. */
export class MLPPolicy implements PolicyInference {
 readonly layers:DenseLayer[];
 constructor(layers:DenseLayer[]){
  const sizes=[629,256,128,52];
  if(PLAYER_FEATURE_COUNT!==629||layers.length!==3||layers.some((l,i)=>l.inputs!==sizes[i]||l.outputs!==sizes[i+1]||!Array.isArray(l.weights)||!Array.isArray(l.bias)||l.weights.length!==l.inputs*l.outputs||l.bias.length!==l.outputs||[...l.weights,...l.bias].some(v=>!Number.isFinite(v)||Math.abs(v)>1e4)))throw Error('V3_MLP_WEIGHTS');
  this.layers=layers.map(l=>({...l,weights:l.weights.slice(),bias:l.bias.slice()}));
 }
 probabilities(x:number[],mask:number[]):number[]{
  if(x.length!==629||x.some(v=>!Number.isFinite(v)||Math.abs(v)>2)||mask.length!==52||mask.some(v=>v!==0&&v!==1)||!mask.some(Boolean))throw Error('V3_MLP_INPUT');
  let values=x;
  for(let n=0;n<3;n++){
   const l=this.layers[n],out=new Array(l.outputs);
   for(let j=0;j<l.outputs;j++){let v=l.bias[j];for(let i=0;i<l.inputs;i++)v+=values[i]*l.weights[j*l.inputs+i];out[j]=n<2?Math.max(0,v):v;}
   values=out;
  }
  const logits=values.map((v,i)=>mask[i]?v:-Infinity),max=Math.max(...logits),p=logits.map(v=>Math.exp(v-max)),sum=p.reduce((a,b)=>a+b,0);
  if(!Number.isFinite(sum)||sum<=0)throw Error('V3_MLP_NUMERIC');return p.map(v=>v/sum);
 }
 action(x:number[],mask:number[]){const p=this.probabilities(x,mask);return mask.reduce((best,m,i)=>m&&(best<0||p[i]>p[best])?i:best,-1);}
 static load(path:string){const d=JSON.parse(readFileSync(path,'utf8'));if(d.schema!=='bundrung-v3-mlp/v1'||d.featureSchema!==PLAYER_FEATURE_SCHEMA||d.inputs!==629||d.outputs!==52||d.activation!=='relu'||!Number.isSafeInteger(d.bestEpoch)||d.bestEpoch<1||!Array.isArray(d.layers))throw Error('V3_MLP_CHECKPOINT');return new MLPPolicy(d.layers);}
}
