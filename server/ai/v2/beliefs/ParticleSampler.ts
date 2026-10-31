import {performance} from 'node:perf_hooks';
import {sampleWorld} from '../../planning/WorldSampler';
import type {SimulationWorld} from '../../../engine/SimulationWorld';
import {BeliefState} from './BeliefState';
import {effectiveSampleSize,normalizedWeights,opponentLogLikelihood} from './OpponentLikelihood';
export interface ParticleDiagnostics {proposals:number;unique:number;ess:number;resampled:boolean;impoverished:boolean;milliseconds:number;}
export class ParticleSampler {
 private worlds:SimulationWorld[]=[];private weights:number[]=[];
 readonly diagnostics:ParticleDiagnostics={proposals:0,unique:0,ess:0,resampled:false,impoverished:false,milliseconds:0};
 constructor(readonly belief:BeliefState,readonly random:()=>number,weighted=false,count=16,deadline=Infinity,strength=1){
  if(!Number.isSafeInteger(count)||count<1||count>128||!Number.isFinite(strength)||strength<0||strength>5)throw new Error('V2_PARTICLE_CONFIG');
  const start=performance.now();
  for(let i=0;i<count&&performance.now()<deadline;i++)this.worlds.push(sampleWorld(belief.publicState,belief.privateState.myPlayerId,belief.privateState.myHand,belief.hardVoids,belief.privateState,random));
  if(!this.worlds.length)throw new Error('V2_PARTICLE_DEADLINE');
  this.diagnostics.proposals=this.worlds.length;
  this.weights=normalizedWeights(this.worlds.map(w=>weighted?opponentLogLikelihood(belief.publicState,w,belief.privateState.myPlayerId,strength):0));
  this.diagnostics.ess=effectiveSampleSize(this.weights);
  this.diagnostics.unique=new Set(this.worlds.map(w=>[...w].map(([id,h])=>`${id}:${h.map(c=>c.id).sort().join(',')}`).join('|')+w.lockedTrump?.id)).size;
  this.diagnostics.impoverished=this.diagnostics.unique<Math.max(2,this.worlds.length/4)||this.diagnostics.ess<2;
  // Systematic resampling retains the weighted empirical posterior. No invented
  // private facts or unweighted "rejuvenation" that would change its target.
  if(weighted&&this.diagnostics.ess<this.worlds.length/2){
   const n=this.worlds.length,selected:SimulationWorld[]=[];let index=0,cumulative=this.weights[0],offset=random()/n;
   for(let i=0;i<n;i++){const u=offset+i/n;while(index<n-1&&u>cumulative)cumulative+=this.weights[++index];selected.push(this.worlds[index]);}
   this.worlds=selected;this.weights=selected.map(()=>1/n);this.diagnostics.resampled=true;
  }
  this.diagnostics.milliseconds=performance.now()-start;
 }
 sample():SimulationWorld {let u=this.random();for(let i=0;i<this.weights.length;i++){u-=this.weights[i];if(u<=0)return this.worlds[i];}return this.worlds.at(-1)!;}
 probability(owner:string,cardId:string):number{return this.worlds.reduce((n,w,i)=>n+this.weights[i]*Number(w.get(owner)?.some(c=>c.id===cardId)),0);}
}
