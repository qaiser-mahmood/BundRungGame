import {performance} from 'node:perf_hooks';
import {setupGame,seededRandom} from './ai-benchmark';
import {advanceForced} from '../server/ai/planning/MonteCarloPlanner';
import {CardTracker,ALL_52_CARDS} from '../server/ai/planning/CardTracker';
import {BeliefState} from '../server/ai/v2/beliefs/BeliefState';
import {ParticleSampler} from '../server/ai/v2/beliefs/ParticleSampler';
import {BundRungEngine} from '../server/engine/BundRungEngine';
const rows=[];let violations=0;
for(let seed=5000;seed<5040;seed++){
 const engine=setupGame(seed),rng=seededRandom(seed);
 for(let step=0;step<24&&engine.getPhase()==='TRICK_PLAYING';step++){
  if(advanceForced(engine))continue;
  if(step===8||step===16){
   const state=engine.getPublicState(),priv=engine.getPrivateState(state.currentTurnPlayerId!),b=new BeliefState(state,priv),scores=[];
   for(const weighted of [false,true]){
    const start=performance.now(),pool=new ParticleSampler(b,seededRandom(seed+step),weighted,32);let brier=0,logLoss=0,n=0;
    for(let i=0;i<32;i++)try{BundRungEngine.validateSimulationWorld(state,pool.sample());}catch{violations++;}
    const unknown=CardTracker.getUnseenCards(state,[...priv.myHand,...(priv.myTrumpCard?[priv.myTrumpCard]:[])]);
    for(const p of state.players.filter(p=>p.id!==priv.myPlayerId)){
     const actual=engine.getPrivateState(p.id),truth=new Set([...actual.myHand,...(actual.myTrumpCard?[actual.myTrumpCard]:[])].map(c=>c.id));
     for(const card of unknown){const q=pool.probability(p.id,card.id),y=Number(truth.has(card.id));brier+=(q-y)**2;const clipped=Math.max(1e-6,Math.min(1-1e-6,q));logLoss-=y*Math.log(clipped)+(1-y)*Math.log(1-clipped);n++;}
    }
    scores.push({weighted,brier:brier/n,logLoss:logLoss/n,diagnostics:pool.diagnostics,totalMs:performance.now()-start});
   }rows.push({seed,step,behavior:seed%2?'random':'lowest',scores});
  }
  const id=engine.getPublicState().currentTurnPlayerId!,legal=engine.getLegalCardsForPlayer(id).sort((a,b)=>a.playValue-b.playValue);
  engine.playCard(id,legal[seed%2?Math.floor(rng()*legal.length):0].id);
 }
}
console.log(JSON.stringify({schemaVersion:1,seedRange:[5000,5039],cards:ALL_52_CARDS.length,method:'Remaining-card binary ownership, three other seats; clipped log loss; paired proposals; generating-policy mismatch split; descriptive only',constraintViolations:violations,rows},null,2));
if(violations)process.exitCode=1;
