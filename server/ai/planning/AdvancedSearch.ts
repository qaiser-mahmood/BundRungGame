import {performance} from 'node:perf_hooks';
import type {Card,PrivatePlayerState,PublicGameState} from '../../../shared/types';
import {MonteCarloPlanner,SearchOptions} from './MonteCarloPlanner';
import {OpponentBeliefs} from './OpponentBeliefs';
import {rankPartnershipActions,StrategyOptions} from './PartnershipStrategy';
import {solvePublicEndgame} from './ExactEndgame';
export const advancedStats={decisions:0,particles:0,continuations:0,protectPartner:0,contest:0,streak:0};
export function advancedSearch(state:PublicGameState,priv:PrivatePlayerState,legal:Card[],search:SearchOptions={},strategy:StrategyOptions={}):Card {
  const start=performance.now(),budget=search.timeMs??25;
  const worlds=strategy.worlds??4,cap=strategy.candidateLimit??4,safe=strategy.safePartnerProbability??0.75;
  if(!(budget>0)||!Number.isSafeInteger(worlds)||worlds<1||worlds>1000||!Number.isSafeInteger(cap)||cap<1||cap>13||!(safe>=0&&safe<=1))throw new Error('INVALID_ADVANCED_CONFIG');
  advancedStats.decisions++;
  const ranked=rankPartnershipActions(state,priv,legal,strategy),fallback=ranked[0].card;
  if(legal.length===1)return fallback;
  const deadline=start+budget;
  const exact=solvePublicEndgame(state,priv,legal,Math.min(deadline,start+Math.min(budget/4,5)));
  if(exact)return exact;
  const remaining=deadline-performance.now();if(remaining<=0)return fallback;
  const beliefs=new OpponentBeliefs(state,priv);
  const critical=state.currentTrick.trickNumber>=11||(state.streakCount??0)>0;
  // Adaptive bounded shortlist. A truncation is explicitly approximate; root
  // candidates still share every completed sampled-world comparison.
  const candidates=ranked.slice(0,cap).map(r=>r.card);
  try{return MonteCarloPlanner.evaluateCandidates(candidates,priv.myPlayerId,priv.myHand,state,priv.secretTrumpSuit,worlds,priv,{
    ...search,iterations:critical?worlds:Math.min(worlds,2),timeMs:remaining,
    worldFactory:()=>beliefs.sample(search.random),
    rolloutPolicy:(s,p,cards)=>{
      const choice=rankPartnershipActions(s,p,cards,strategy)[0];advancedStats.continuations++;
      if(choice.reason==='protect-partner')advancedStats.protectPartner++;
      else if(choice.reason==='streak')advancedStats.streak++;else advancedStats.contest++;
      return choice.card;
    },
  });}finally{advancedStats.particles+=beliefs.sampleCount;}
}
