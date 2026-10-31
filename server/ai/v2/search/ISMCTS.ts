import {controlRollout} from '../strategy/controlRollout';
import {performance} from 'node:perf_hooks';
import type {Card,PrivatePlayerState,PublicGameState} from '../../../../shared/types';
import {BeliefState} from '../beliefs/BeliefState';
import {ParticleSampler,ParticleDiagnostics} from '../beliefs/ParticleSampler';
import {fromObservation} from '../simulation/adapters';
import {SimulationWorld} from '../../../engine/SimulationWorld';
import {CARDS,CompactState,cloneState} from '../simulation/CompactState';
import {apply,forcedAction,legalCards,utility} from '../simulation/FastSimulator';
import {informationKey,stateInformationKey,observe} from '../simulation/observation';
import {rolloutAction} from '../strategy/rollout';
export interface Edge {visits:number;available:number;sum:number;}
export interface Node {visits:number;edges:Map<number,Edge>;}
export interface SearchResult {card:Card;completed:number;nodes:number;deadlineStops:number;invalidWorlds:number;fallback:boolean;
 efficiency:{templateBuilds:number;fullObservations:number;lightObservations:number};
 root:{cardId:string;visits:number;available:number;value:number}[];belief:ParticleDiagnostics|null;milliseconds:number;}
export interface V2Options {iterations?:number;particles?:number;nodeLimit?:number;timeMs?:number;random?:()=>number;weighted?:boolean;likelihoodStrength?:number;
 rollout?:'legacy'|'control';safeProbability?:number;reuseTemplates?:boolean;lightRollouts?:boolean;partnership?:boolean;adaptive?:boolean;exact?:boolean;exploration?:number;rootPrior?:number[];prior?:(state:PublicGameState,priv:PrivatePlayerState,cards:Card[])=>number[];policyOnly?:boolean;onResult?:(result:SearchResult,state:PublicGameState,priv:PrivatePlayerState)=>void;}
export function selectAction(node:Node,legal:number[],random:()=>number,exploration:number,prior?:number[]):number {
 const unvisited=legal.filter(c=>!node.edges.get(c)?.visits);if(unvisited.length)return unvisited[Math.floor(random()*unvisited.length)];
 return legal.reduce((best,c)=>{
  const score=(a:number)=>{const e=node.edges.get(a)!;return e.sum/e.visits+exploration*Math.sqrt(Math.log(e.available+1)/e.visits)+(prior?.[a]??0)*Math.sqrt(node.visits+1)/(1+e.visits);};
  return score(c)>score(best)?c:best;
 });
}
export function ismcts(state:PublicGameState,priv:PrivatePlayerState,cards:Card[],options:V2Options={}):SearchResult {
 const start=performance.now(),time=options.timeMs??25,iterations=options.iterations??64,nodeLimit=options.nodeLimit??512,random=options.random??Math.random,exploration=options.exploration??Math.SQRT2;
 if(!(time>0)||!Number.isSafeInteger(iterations)||iterations<1||iterations>10000||!Number.isSafeInteger(nodeLimit)||nodeLimit<1||nodeLimit>100000||!Number.isFinite(exploration)||exploration<0||exploration>10)throw new Error('V2_INVALID_BUDGET');
 if(!['legacy','control'].includes(options.rollout??'legacy')||!Number.isFinite(options.safeProbability??.75)||(options.safeProbability??.75)<0||(options.safeProbability??.75)>1)throw new Error('V2_ROLLOUT_CONFIG');
 if(!cards.length)throw new Error('V2_NO_LEGAL_CARD');
 const deadline=start+time,rootActor=state.players.findIndex(p=>p.id===priv.myPlayerId),tree=new Map<string,Node>();
 let completed=0,deadlineStops=0,invalidWorlds=0,rootKey='',belief:ParticleDiagnostics|null=null;
 const templates=new Map<SimulationWorld,CompactState>(),efficiency={templateBuilds:0,fullObservations:0,lightObservations:0};
 const check=()=>{if(performance.now()>=deadline)throw new Error('V2_DEADLINE');};
 const finish=():SearchResult=>{
  const root=tree.get(rootKey),stats=cards.map(c=>{const edge=root?.edges.get(CARDS.findIndex(x=>x.id===c.id));return {cardId:c.id,visits:edge?.visits??0,available:edge?.available??0,value:edge?.visits?edge.sum/edge.visits:0};});
  const best=stats.reduce((a,b)=>b.visits>a.visits||b.visits===a.visits&&b.value>a.value?b:a,stats[0]);
  return {card:cards.find(c=>c.id===best.cardId)!,completed,nodes:tree.size,deadlineStops,invalidWorlds,fallback:!completed,efficiency,root:stats,belief,milliseconds:performance.now()-start};
 };
 let pool:ParticleSampler;
 try{pool=new ParticleSampler(new BeliefState(state,priv),random,options.weighted??false,options.particles??16,deadline,options.likelihoodStrength??1);belief=pool.diagnostics;}
 catch(error){if(error instanceof Error&&error.message==='V2_PARTICLE_DEADLINE'){deadlineStops++;return finish();}throw error;}
 for(let i=0;i<iterations;i++){
  const path:{node:Node;action:number;legal:number[]}[]=[];
  try{
   check();const world=pool.sample();let s:CompactState;
   if(options.reuseTemplates===false){s=fromObservation(state,world);efficiency.templateBuilds++;}
   else {let template=templates.get(world);if(!template){template=fromObservation(state,world);templates.set(world,template);efficiency.templateBuilds++;}s=cloneState(template);}
   let expanded=false;
   for(let ply=0;ply<180;ply++){
    check();if(s.phase!=='TRICK_PLAYING'){
     const reward=utility(s,rootActor)/1208; // Known max 208 hand + 1000 match; no trick shaping.
     for(const {node,action,legal} of path){node.visits++;for(const c of legal){const e=node.edges.get(c)??{visits:0,available:0,sum:0};e.available++;node.edges.set(c,e);}const e=node.edges.get(action)!;e.visits++;e.sum+=reward;}
     completed++;break;
    }
    const forced=forcedAction(s);if(forced){apply(s,forced);continue;}
    const legal=legalCards(s);if(!legal.length)throw new Error('V2_SIMULATION_NO_ACTION');
    const treeTurn=s.actor===rootActor&&!expanded,full=options.lightRollouts===false;
    const observation=observe(s,s.actor,full,!full&&options.rollout==='control');if(full)efficiency.fullObservations++;else efficiency.lightObservations++;let chosen:number;
    const rollout=()=>options.rollout==='control'?controlRollout(observation,legal,options.safeProbability??.75):rolloutAction(observation,legal,options.partnership??true);
    if(treeTurn){
     const key=full?informationKey(observation):stateInformationKey(s,observation);if(!rootKey){rootKey=key;if(legal.length!==cards.length||legal.some(c=>!cards.some(x=>x.id===CARDS[c].id)))throw new Error('V2_ROOT_LEGAL_MISMATCH');}
     let node=tree.get(key);if(!node&&tree.size<nodeLimit){node={visits:0,edges:new Map()};tree.set(key,node);expanded=true;}
     if(node){chosen=selectAction(node,legal,random,exploration,key===rootKey?options.rootPrior:undefined);path.push({node,action:chosen,legal});}
     else chosen=rollout();
    }else chosen=rollout();
    apply(s,{type:'play',card:chosen});
    if(ply===179)throw new Error('V2_PLY_LIMIT');
   }
  }catch(error){
   if(error instanceof Error&&error.message==='V2_DEADLINE'){deadlineStops++;break;}
   // Do not censor candidate-dependent transition failures. Discard the entire
   // decision and let the authoritative fallback handle it.
   invalidWorlds++;throw error;
  }
 }
 return finish();
}
