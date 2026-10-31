import {performance} from 'node:perf_hooks';
import {setupGame} from './ai-benchmark';
import {oracleWorld} from './v2-parity';
import {fromObservation} from '../server/ai/v2/simulation/adapters';
import {cloneState,CARDS,indexOf} from '../server/ai/v2/simulation/CompactState';
import {apply,forcedAction,legalCards,utility} from '../server/ai/v2/simulation/FastSimulator';
import {MonteCarloPlanner,terminalUtility} from '../server/ai/planning/MonteCarloPlanner';
const e=setupGame(2),state=e.getPublicState(),world=oracleWorld(e),root=fromObservation(state,world),actor=state.currentTurnPlayerId!,first=e.getLegalCardsForPlayer(actor)[0];
const slow=()=>terminalUtility(MonteCarloPlanner.rollout(state,actor,first,world),actor);
const fast=()=>{const s=cloneState(root);apply(s,{type:'play',card:indexOf(first.id)});
 for(let n=0;n<180&&s.phase==='TRICK_PLAYING';n++){const forced=forcedAction(s);if(forced)apply(s,forced);else {const c=legalCards(s).sort((a,b)=>CARDS[a].playValue-CARDS[b].playValue||CARDS[a].id.localeCompare(CARDS[b].id))[0];apply(s,{type:'play',card:c});}}
 return utility(s,root.actor);};
for(let i=0;i<20;i++)if(slow()!==fast())throw new Error('V2_THROUGHPUT_PARITY');
const repetitions=500,startSlow=performance.now();let a=0,b=0;for(let i=0;i<repetitions;i++)a+=slow();const authoritativeMs=performance.now()-startSlow;
const startFast=performance.now();for(let i=0;i<repetitions;i++)b+=fast();const compactMs=performance.now()-startFast;if(a!==b)throw new Error('V2_THROUGHPUT_PARITY');
console.log(JSON.stringify({repetitions,node:process.version,authoritativeMs,compactMs,speedRatio:authoritativeMs/compactMs,method:'Identical full low-card rollouts, warmed; compact explicit clone versus existing authoritative reconstruction; referee world only; not search strength'},null,2));
