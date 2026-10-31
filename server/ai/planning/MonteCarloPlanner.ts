import {performance} from 'node:perf_hooks';
import type {Card,PrivatePlayerState,PublicGameState,Suit} from '../../../shared/types';
import {BundRungEngine} from '../../engine/BundRungEngine';
import {SimulationWorld} from '../../engine/SimulationWorld';
import {CardTracker} from './CardTracker';
import {sampleWorld} from './WorldSampler';
export interface SearchOptions {iterations?:number;legacyIterations?:number;timeMs?:number;random?:()=>number;diagnostic?:(reason:string)=>void;}
export interface SearchStats {worlds:number;samplingFailures:number;fallbacks:number;neuralUses:number;}
export const searchStats:SearchStats={worlds:0,samplingFailures:0,fallbacks:0,neuralUses:0};
export function advanceForced(engine:BundRungEngine):boolean {
  const state=engine.getPublicState();
  if(state.isRungRevealPaused){engine.resumeAfterTrumpReveal();return true;}
  const caller=state.trumpCallerPlayerId;
  if(caller && engine.getPrivateState(caller).canShowTrump){engine.showTrumpCard(caller);return true;}
  if(state.faceDownLeadPending){
    const team=state.players.find(p=>p.id===state.faceDownLeadPlayerId)?.team;
    for(const p of state.players.filter(p=>p.team!==team))if(engine.getPublicState().faceDownLeadPending)engine.respondToFaceDownRung(p.id,true);
    return true;
  }
  if(state.currentTurnPlayerId && engine.getPrivateState(state.currentTurnPlayerId).canRequestRungReveal){engine.requestTrumpReveal(state.currentTurnPlayerId);return true;}
  return false;
}
export function terminalUtility(state:PublicGameState,actor:string):number {
  if(state.phase!=='GAME_RESOLVED' && state.phase!=='MATCH_OVER')throw new Error('ROLLOUT_INCOMPLETE');
  const team=state.players.find(p=>p.id===actor)?.team;
  const entry=state.scorecard.history.at(-1);
  if(!entry || !team)throw new Error('ROLLOUT_NO_SCORE');
  // Engine scoring, including modifiers, transfer and match outcome. KHOTI is
  // lexicographically preferred over any single-hand adjustment (max 208).
  return entry.scoreAdjustment*(entry.dealerTeam===team?-1:1)+
    (state.isMatchOver?(state.matchWinnerTeam===team?1000:-1000):0);
}
export class MonteCarloPlanner {
  public static generateConsistentWorld(state:PublicGameState,actor:string,hand:Card[],voids:Map<string,Set<Suit>>,
    _secret?:Suit|null,privateState?:PrivatePlayerState,random:()=>number=Math.random):SimulationWorld {
    return sampleWorld(state,actor,hand,voids,privateState,random);
  }
  public static rollout(state:PublicGameState,actor:string,first:Card,world:SimulationWorld):PublicGameState {
    const engine=BundRungEngine.fromObservation(state,world);
    engine.playCard(actor,first.id);
    for(let step=0;step<160;step++){
      const s=engine.getPublicState();
      if(s.phase==='GAME_RESOLVED'||s.phase==='MATCH_OVER')return s;
      if(advanceForced(engine))continue;
      if(!s.currentTurnPlayerId)throw new Error('ROLLOUT_NO_TURN');
      const legal=engine.getLegalCardsForPlayer(s.currentTurnPlayerId);
      if(!legal.length)throw new Error('ROLLOUT_NO_LEGAL_ACTION');
      const chosen=[...legal].sort((a,b)=>a.playValue-b.playValue||a.id.localeCompare(b.id))[0];
      engine.playCard(s.currentTurnPlayerId,chosen.id);
    }
    throw new Error('ROLLOUT_STEP_BUDGET');
  }
  public static simulateRollout(state:PublicGameState,actor:string,hand:Card[],first:Card,
    hands:Map<string,Card[]>,trump:Suit|null):number {
    const world=new SimulationWorld(hands);
    if(hands instanceof SimulationWorld){world.concealed=new Map(hands.concealed);world.lockedTrump=hands.lockedTrump;world.trumpSuit=hands.trumpSuit;}
    if(!world.has(actor))world.set(actor,hand);
    if(!world.trumpSuit)world.trumpSuit=trump;
    return terminalUtility(this.rollout(state,actor,first,world),actor);
  }
  public static evaluateCandidates(candidates:Card[],actor:string,hand:Card[],state:PublicGameState,
    _secret?:Suit|null,iterations=16,privateState?:PrivatePlayerState,options:SearchOptions={}):Card {
    if(!candidates.length)throw new Error('NO_CANDIDATES');
    if(candidates.length===1)return candidates[0];
    const limit=options.iterations??iterations,timeMs=options.timeMs??25;
    if(!Number.isSafeInteger(limit)||limit<1||limit>1000 || timeMs<=0)throw new Error('INVALID_SEARCH_BUDGET');
    const started=performance.now(),scores=candidates.map(()=>0);let complete=0;
    try{
      for(let i=0;i<limit;i++){
        if(i>0&&performance.now()-started>=timeMs)break;
        const world=this.generateConsistentWorld(state,actor,hand,CardTracker.getVoidMatrix(state),_secret,privateState,options.random);
        // Finish a complete common-world comparison before checking the budget.
        const values=candidates.map(c=>this.simulateRollout(state,actor,hand,c,world,world.trumpSuit));
        values.forEach((v,j)=>scores[j]+=v);complete++;searchStats.worlds++;
      }
      if(!complete)throw new Error('NO_COMPLETE_WORLDS');
      return candidates[scores.reduce((best,score,i)=>score>scores[best]?i:best,0)];
    }catch(error){
      const reason=error instanceof Error?error.message:'SEARCH_FAILURE';
      searchStats.samplingFailures++;searchStats.fallbacks++;
      (options.diagnostic??(reason=>console.error(JSON.stringify({component:'search',reason}))))(reason);
      return candidates[0];
    }
  }
}
