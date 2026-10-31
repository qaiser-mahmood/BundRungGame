import {performance} from 'node:perf_hooks';
import type {Card,PrivatePlayerState,PublicGameState,Suit} from '../../../shared/types';
import {BundRungEngine} from '../../engine/BundRungEngine';
import {SimulationWorld} from '../../engine/SimulationWorld';
import {CardTracker} from './CardTracker';
import {sampleWorld,SamplingError} from './WorldSampler';
export interface SearchDiagnostic {
  component:'search';category:'sampling'|'world-validation'|'transition'|'internal'|'budget';reason:string;
  count:number;attempts:number;completedComparisons:number;scoresUsed:boolean;
}
export interface SearchOptions {iterations?:number;legacyIterations?:number;timeMs?:number;random?:()=>number;
  diagnostic?:(reason:string)=>void;onDiagnostic?:(event:SearchDiagnostic)=>void;}
export interface SearchStats {
  worlds:number;attempts:number;samplingFailures:number;invalidWorlds:number;transitionFailures:number;internalFailures:number;
  deadlineStops:number;partialComparisonsDiscarded:number;recoveredDecisions:number;fallbacks:number;neuralUses:number;
}
export const searchStats:SearchStats={worlds:0,attempts:0,samplingFailures:0,invalidWorlds:0,transitionFailures:0,internalFailures:0,
  deadlineStops:0,partialComparisonsDiscarded:0,recoveredDecisions:0,fallbacks:0,neuralUses:0};
export class SearchBudgetExceeded extends Error {constructor(){super('SEARCH_DEADLINE');}}
function checkDeadline(deadline:number):void {
  if(deadline!==Infinity&&performance.now()>=deadline)throw new SearchBudgetExceeded();
}
export function advanceForced(engine:BundRungEngine):boolean {
  const state=engine.getTurnStatus();
  if(state.isRungRevealPaused){engine.resumeAfterTrumpReveal();return true;}
  if(state.trumpCallerPlayerId&&state.canShowTrump){engine.showTrumpCard(state.trumpCallerPlayerId);return true;}
  if(state.faceDownLeadPending){
    for(const id of state.defendingPlayerIds)if(engine.getTurnStatus().faceDownLeadPending)engine.respondToFaceDownRung(id,true);
    return true;
  }
  if(state.currentTurnPlayerId&&state.canRequestRungReveal){engine.requestTrumpReveal(state.currentTurnPlayerId);return true;}
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
  public static rollout(state:PublicGameState,actor:string,first:Card,world:SimulationWorld,deadline=Infinity):PublicGameState {
    checkDeadline(deadline);
    const engine=BundRungEngine.fromObservation(state,world);
    checkDeadline(deadline);
    engine.playCard(actor,first.id);
    for(let step=0;step<160;step++){
      checkDeadline(deadline);
      const s=engine.getTurnStatus();
      if(s.phase==='GAME_RESOLVED'||s.phase==='MATCH_OVER')return engine.getPublicState();
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
    hands:Map<string,Card[]>,trump:Suit|null,deadline=Infinity):number {
    const world=new SimulationWorld(hands);
    if(hands instanceof SimulationWorld){world.concealed=new Map(hands.concealed);world.lockedTrump=hands.lockedTrump;world.trumpSuit=hands.trumpSuit;}
    if(!world.has(actor))world.set(actor,hand);
    if(!world.trumpSuit)world.trumpSuit=trump;
    return terminalUtility(this.rollout(state,actor,first,world,deadline),actor);
  }
  public static evaluateCandidates(candidates:Card[],actor:string,hand:Card[],state:PublicGameState,
    _secret?:Suit|null,iterations=16,privateState?:PrivatePlayerState,options:SearchOptions={}):Card {
    if(!candidates.length)throw new Error('NO_CANDIDATES');
    if(candidates.length===1)return candidates[0];
    const limit=options.iterations??iterations,timeMs=options.timeMs??25;
    if(!Number.isSafeInteger(limit)||limit<1||limit>1000 || Number.isNaN(timeMs) || timeMs<=0)throw new Error('INVALID_SEARCH_BUDGET');
    const deadline=timeMs===Infinity?Infinity:performance.now()+timeMs;
    const scores=candidates.map(()=>0),voids=CardTracker.getVoidMatrix(state);
    let complete=0,attempts=0,fatal=false,rejected=false;
    const events=new Map<string,{category:SearchDiagnostic['category'];reason:string;count:number}>();
    const note=(category:SearchDiagnostic['category'],reason:string)=>{
      const key=`${category}:${reason}`,previous=events.get(key);
      if(previous)previous.count++;else events.set(key,{category,reason,count:1});
    };
    const reason=(error:unknown,fallback:string)=>error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:fallback;
    for(let i=0;i<limit;i++){
      let world:SimulationWorld;
      const values:number[]=[];
      let stage:'sampling'|'world-validation'|'transition'='sampling';
      try {
        checkDeadline(deadline);attempts++;searchStats.attempts++;
        try {
          world=this.generateConsistentWorld(state,actor,hand,voids,_secret,privateState,options.random);
        } catch(error) {
          if(!(error instanceof SamplingError))throw error;
          // Rejection is independent of candidate utilities. Keep previous full
          // comparisons and spend at most the remaining attempt budget.
          searchStats.samplingFailures++;rejected=true;note('sampling',error.reason);continue;
        }
        checkDeadline(deadline);
        stage='world-validation';
        try {BundRungEngine.validateSimulationWorld(state,world);} catch(error) {
          if(!(error instanceof Error)||!error.message.startsWith('SIM_'))throw error;
          searchStats.invalidWorlds++;rejected=true;note('world-validation',error.message);continue;
        }
        stage='transition';
        for(const card of candidates){
          checkDeadline(deadline);
          const value=this.simulateRollout(state,actor,hand,card,world,world.trumpSuit,deadline);
          if(!Number.isFinite(value))throw new Error('NONFINITE_UTILITY');
          values.push(value);
        }
        // Atomic common-world commit: never add a partial candidate vector.
        values.forEach((value,j)=>scores[j]+=value);complete++;searchStats.worlds++;
      } catch(error) {
        if(values.length)searchStats.partialComparisonsDiscarded++;
        if(error instanceof SearchBudgetExceeded){searchStats.deadlineStops++;note('budget','SEARCH_DEADLINE');}
        else {
          // A transition failure may depend on the chosen card. Resampling it
          // away would censor hard worlds and bias comparisons; fail safely.
          fatal=true;
          if(stage==='transition'){searchStats.transitionFailures++;note('transition',reason(error,'ROLLOUT_TRANSITION_REJECTED'));}
          else {searchStats.internalFailures++;note('internal',stage==='sampling'?'SAMPLER_INTERNAL_FAILURE':'VALIDATOR_INTERNAL_FAILURE');}
        }
        break;
      }
    }
    const useScores=complete>0&&!fatal;
    for(const event of events.values()){
      const diagnostic:SearchDiagnostic={component:'search',...event,attempts,completedComparisons:complete,scoresUsed:useScores};
      if(options.onDiagnostic)options.onDiagnostic(diagnostic);
      else if(options.diagnostic)options.diagnostic(event.reason);
      else console.error(JSON.stringify(diagnostic));
    }
    if(!useScores){searchStats.fallbacks++;return candidates[0];}
    if(rejected)searchStats.recoveredDecisions++;
    return candidates[scores.reduce((best,score,i)=>score>scores[best]?i:best,0)];
  }
}
