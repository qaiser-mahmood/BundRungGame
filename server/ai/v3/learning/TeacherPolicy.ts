import {readFileSync} from 'node:fs';
import {PLAYER_FEATURE_COUNT,PLAYER_FEATURE_SCHEMA} from '../data/Observation';

/** A single trainable affine layer followed by masked softmax. No legacy schema coercion. */
export class TeacherPolicy {
 weights:number[];bias:number[];
 constructor(weights=new Array(629*52).fill(0),bias=new Array(52).fill(0)){
  if(PLAYER_FEATURE_COUNT!==629||weights.length!==629*52||bias.length!==52||[...weights,...bias].some(v=>!Number.isFinite(v)))throw Error('V3_WEIGHTS');
  this.weights=weights.slice();this.bias=bias.slice();
 }
 probabilities(x:number[],mask:number[]){
  if(x.length!==629||x.some(v=>!Number.isFinite(v)||Math.abs(v)>2)||mask.length!==52||mask.some(v=>v!==0&&v!==1)||!mask.some(Boolean))throw Error('V3_INPUT');
  const z=mask.map((m,c)=>{if(!m)return -Infinity;let v=this.bias[c];for(let i=0;i<629;i++)v+=x[i]*this.weights[c*629+i];return v;});
  const max=Math.max(...z),p=z.map(v=>Math.exp(v-max)),sum=p.reduce((a,b)=>a+b,0);return p.map(v=>v/sum);
 }
 action(x:number[],mask:number[]){const p=this.probabilities(x,mask);return mask.reduce((a,m,i)=>m&&(a<0||p[i]>p[a])?i:a,-1);}
 step(x:number[],mask:number[],label:number,rate:number){
  if(!Number.isInteger(label)||mask[label]!==1||!Number.isFinite(rate)||rate<=0)throw Error('V3_LABEL');
  const p=this.probabilities(x,mask);
  for(let c=0;c<52;c++)if(mask[c]){const g=p[c]-Number(c===label);this.bias[c]-=rate*g;for(let i=0;i<629;i++)if(x[i])this.weights[c*629+i]-=rate*g*x[i];}
 }
 static load(path:string){const d=JSON.parse(readFileSync(path,'utf8'));if(d.schema!=='bundrung-v3-teacher-policy/v1'||d.featureSchema!==PLAYER_FEATURE_SCHEMA||d.inputs!==629||d.outputs!==52||!Number.isSafeInteger(d.epochs)||d.epochs<1||!Array.isArray(d.weights)||!Array.isArray(d.bias))throw Error('V3_CHECKPOINT');return new TeacherPolicy(d.weights,d.bias);}
}
