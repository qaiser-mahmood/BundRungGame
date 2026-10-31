import {indexOf} from '../simulation/CompactState';
import {BotPlayer} from '../../BotPlayer';
import {performance} from 'node:perf_hooks';
import type {Card,PrivatePlayerState,PublicGameState} from '../../../../shared/types';
import {SearchOptions} from '../../planning/MonteCarloPlanner';
import {rankPartnershipActions} from '../../planning/PartnershipStrategy';
import {solvePublicEndgame} from '../../planning/ExactEndgame';
import {ismcts,V2Options} from '../search/ISMCTS';
export const v2Stats={decisions:0,forced:0,obvious:0,searches:0,exact:0,iterations:0,nodes:0,invalidWorlds:0,fallbacks:0,deadlineStops:0,particles:0,ess:0,searchMs:0,templateBuilds:0,fullObservations:0,lightObservations:0};
export function decideV2(state:PublicGameState,priv:PrivatePlayerState,legal:Card[],search:SearchOptions={},options:V2Options={}):Card {
 const start=performance.now(),budget=options.timeMs??search.timeMs??25,base=options.iterations??64;
 if(!(budget>0)||!Number.isSafeInteger(base)||base<1||base>10000)throw new Error('V2_INVALID_BUDGET');
 if(!legal.length)throw new Error('V2_NO_LEGAL_CARD');v2Stats.decisions++;
 if(legal.length===1){v2Stats.forced++;return legal[0];}
 const deadline=start+budget;
 const fallback=()=>{v2Stats.fallbacks++;const remaining=deadline-performance.now();
  // Use corrected authoritative simulation when time remains; otherwise its
  // legal candidate-order fallback. Never restart another full 25 ms budget.
  const hand=priv.myTrumpCard&&priv.isMyTrumpCardPlayable?[...priv.myHand,priv.myTrumpCard]:priv.myHand;
  return BotPlayer.chooseMasterCard({getPlayers:()=>state.players},priv.myPlayerId,legal,hand,state,priv,{name:'corrected-search',search:{...search,timeMs:Math.max(.001,remaining)}});};
 try{
  const ranked=rankPartnershipActions(state,priv,legal);
  const rootPrior=options.prior?.(state,priv,legal)??options.rootPrior;
  if(rootPrior&&(rootPrior.length!==52||rootPrior.some(x=>!Number.isFinite(x)||x<0)))throw new Error('V2_PRIOR_SCHEMA');
  if(options.policyOnly){if(!rootPrior)throw new Error('V2_NO_EXPERIMENTAL_MODEL');return legal.reduce((best,c)=>rootPrior[indexOf(c.id)]>rootPrior[indexOf(best.id)]?c:best,legal[0]);}
  if(options.exact!==false){const exact=solvePublicEndgame(state,priv,legal,Number.isFinite(budget)?Math.min(deadline,start+Math.min(5,budget/4)):Infinity);if(exact){v2Stats.exact++;return exact;}}
  const currentPartnerSafe=ranked[0].reason==='protect-partner'&&ranked.every(r=>r.holdProbability===1)&&state.currentTrick.cards.length===3;
  if(options.adaptive!==false&&currentPartnerSafe){v2Stats.obvious++;return ranked[0].card;}
  const uncertainty=ranked.length>1?1-Math.min(1,Math.abs(ranked[0].holdProbability-ranked[1].holdProbability)):0;
  const branching=Math.min(1,Math.log2(legal.length+1)/3);
  const iterations=options.adaptive===false?base:Math.max(1,Math.ceil(base*Math.max(.25,uncertainty)*branching));
  const remaining=deadline-performance.now();if(remaining<=0){v2Stats.deadlineStops++;return fallback();}
  const result=ismcts(state,priv,legal,{...options,rootPrior,iterations,timeMs:remaining,random:options.random??search.random});
  v2Stats.templateBuilds+=result.efficiency.templateBuilds;v2Stats.fullObservations+=result.efficiency.fullObservations;v2Stats.lightObservations+=result.efficiency.lightObservations;
  v2Stats.searches++;v2Stats.iterations+=result.completed;v2Stats.nodes+=result.nodes;v2Stats.invalidWorlds+=result.invalidWorlds;
  v2Stats.deadlineStops+=result.deadlineStops;v2Stats.particles+=result.belief?.proposals??0;v2Stats.ess+=result.belief?.ess??0;v2Stats.searchMs+=result.milliseconds;
  options.onResult?.(result,state,priv);return result.fallback?fallback():result.card;
 }catch(error){v2Stats.invalidWorlds++;console.error(JSON.stringify({component:'ai-v2',reason:error instanceof Error&&/^V2_[A-Z_]+$/.test(error.message)?error.message:'V2_INTERNAL_FAILURE'}));return fallback();}
}
