import {selectPilot,pilotPackets,type PilotPlan} from './PilotSelection';
import {performance} from 'node:perf_hooks';
import {setImmediate} from 'node:timers/promises';
import {generateCorpus,assignmentPackets,setupCorpusGame,digest,type Corpus,type GeneratorConfig} from '../data/Corpus';
import {observeDecision} from '../data/Observation';
import {advanceForced} from '../../planning/MonteCarloPlanner';
import {decideV2,v2Stats} from '../../v2/strategy/DecisionController';
import {indexOf} from '../../v2/simulation/CompactState';
import {seededRandom} from '../../../../scripts/ai-benchmark';
import type {PrivatePlayerState} from '../../../../shared/types';
export interface Prediction {status:'available'|'not_available';policy:string;version:string;action:number|null;milliseconds:number|null;diagnostics:Record<string,number|boolean|string>|null;}
export interface EvaluationBundle {schema:'bundrung-expert-evaluation/v1';corpus:Corpus;predictions:Record<string,{v2:Prediction;v3:Prediction}>;context:Record<string,{callType:'forced'|'voluntary';revealOpportunitiesBeforeDecision:number;bidding?:{passesBeforeCall:number;seatStatuses:string[];completeHistory:false}}>;pilot?:PilotPlan;hash:string;}
export function restrictedPrivate(p:PrivatePlayerState,revealed:boolean):PrivatePlayerState {
 return {...p,myTrumpCard:revealed?p.myTrumpCard:null,secretTrumpSuit:revealed?p.secretTrumpSuit:null,knownConcealedCards:{},teammateFaceDownCard:null,partnerHand:null,isInspectingPartnerCards:false};
}
export async function prepareEvaluation(config:GeneratorConfig):Promise<EvaluationBundle>{
 const corpus=generateCorpus(config),pilot=config.targeted?selectPilot(corpus):undefined,selected=pilot?pilotPackets(corpus,pilot):assignmentPackets(corpus),predictions:EvaluationBundle['predictions']={},context:EvaluationBundle['context']={};
 for(const packet of selected){
  const source=corpus.manifest.sources.find(s=>s.packetId===packet.id)!,engine=setupCorpusGame(config,source.seed),random=seededRandom(source.seed^0x7633);let found=false,reveals=0;
  for(let step=0;step<180&&engine.getPhase()==='TRICK_PLAYING';step++){
   const pre=engine.getPublicState();if(pre.currentTurnPlayerId&&engine.getRevealPermissions(pre.currentTurnPlayerId).canRequestRungReveal)reveals++;
   if(advanceForced(engine))continue;
   const state=engine.getPublicState(),id=state.currentTurnPlayerId!,priv=engine.getPrivateState(id),legal=engine.getLegalCardsForPlayer(id);
   if(legal.length>=2&&digest(observeDecision(state,priv))===packet.observationHash){
    const start=performance.now(),before={...v2Stats},rng=seededRandom(parseInt(packet.id.slice(0,8),16));
    const card=decideV2(state,restrictedPrivate(priv,state.isTrumpRevealed),legal,{iterations:8,timeMs:Infinity,random:rng},{iterations:8,particles:4,nodeLimit:128,timeMs:Infinity,random:rng,rollout:'control',adaptive:false,exact:false});
    const action=indexOf(card.id);if(!packet.mask[action])throw new Error('EVALUATION_ILLEGAL_PREDICTION');
    predictions[packet.id]={v2:{status:'available',policy:'ai-v2-ismcts',version:config.sourceCommit,action,milliseconds:performance.now()-start,diagnostics:{completed:v2Stats.iterations-before.iterations,nodes:v2Stats.nodes-before.nodes,invalidWorlds:v2Stats.invalidWorlds-before.invalidWorlds,fallback:v2Stats.fallbacks>before.fallbacks,exact:false,adaptive:false,inputBoundary:'V3 strict observer; no undisclosed trump/inspection memories',iterations:8,particles:4}},v3:{status:'not_available',policy:'ai-v3-partnership',version:'no-validated-trained-policy',action:null,milliseconds:null,diagnostics:null}};
    // Calling provenance is actual bidding metadata, not a strength/intention label.
    context[packet.id]={callType:state.biddingPassCount===3?'forced':'voluntary',revealOpportunitiesBeforeDecision:reveals,bidding:{passesBeforeCall:state.biddingPassCount,seatStatuses:Array.from({length:4},(_,i)=>state.biddingStatus?.[state.players[(state.players.findIndex(p=>p.id===id)+i)%4].id]??'UNKNOWN'),completeHistory:false}};found=true;break;
   }
   const ordered=legal.slice().sort((a,b)=>a.playValue-b.playValue||a.id.localeCompare(b.id));const c=source.opponentStyle==='lowest-legal'?ordered[0]:source.opponentStyle==='highest-legal'?ordered.at(-1)!:ordered[Math.floor(random()*ordered.length)];engine.playCard(id,c.id);
  }
  if(!found)throw new Error('EVALUATION_REPLAY_MISMATCH');await setImmediate();
 }
 const base={schema:'bundrung-expert-evaluation/v1' as const,corpus,predictions,context,...(pilot?{pilot}:{})};return {...base,hash:digest(base)};
}
