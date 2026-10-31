import {performance} from 'node:perf_hooks';
import type {Card,PrivatePlayerState,PublicGameState} from '../../../shared/types';
import {BundRungEngine} from '../../engine/BundRungEngine';
import {SimulationWorld} from '../../engine/SimulationWorld';
import {advanceForced,terminalUtility} from './MonteCarloPlanner';
export const endgameStats={attempts:0,solved:0,nodes:0,budgetStops:0};
/** Exact team minimax only when ALL remaining ownership is public knowledge.
 * Private inspection or a determinization is not sufficient for eligibility. */
export function solvePublicEndgame(state:PublicGameState,priv:PrivatePlayerState,legal:Card[],deadline:number,maxNodes=1000):Card|null {
  if(state.players.reduce((n,p)=>n+p.cardsInHandCount,0)>8)return null;
  if([...state.completedTricks,state.currentTrick].some(t=>t.cards.some(p=>!p.card)))return null;
  const world=new SimulationWorld();
  for(const player of state.players){
    const cards=[...(state.revealedHands[player.id]??[])];
    if(player.id===state.trumpCallerPlayerId&&state.revealedTrumpCard&&!cards.some(c=>c.id===state.revealedTrumpCard!.id))cards.push(state.revealedTrumpCard);
    if(cards.length!==player.cardsInHandCount)return null;
    world.set(player.id,cards);
  }
  if(state.trumpCardPlaced&&!state.isTrumpRevealed)return null;
  world.lockedTrump=state.trumpCardPlaced?state.revealedTrumpCard:null;world.trumpSuit=state.trumpSuit;
  endgameStats.attempts++;
  const actor=priv.myPlayerId,team=state.players.find(p=>p.id===actor)!.team;
  let nodes=0;const cache=new Map<string,number>();
  const visit=(observation:PublicGameState,w:SimulationWorld):number=>{
    if(++nodes>maxNodes||performance.now()>=deadline)throw new Error('ENDGAME_BUDGET');
    if(observation.phase==='GAME_RESOLVED'||observation.phase==='MATCH_OVER')return terminalUtility(observation,actor);
    const engine=BundRungEngine.fromObservation(observation,w);
    for(let step=0;step<12&&advanceForced(engine);step++){
      if(performance.now()>=deadline)throw new Error('ENDGAME_BUDGET');
    }
    const s=engine.getPublicState();
    if(s.phase==='GAME_RESOLVED'||s.phase==='MATCH_OVER')return terminalUtility(s,actor);
    const id=s.currentTurnPlayerId;if(!id)throw new Error('ENDGAME_NO_TURN');
    const current=new SimulationWorld();
    for(const p of s.players){const ps=engine.getPrivateState(p.id);current.set(p.id,[...ps.myHand,...(ps.myTrumpCard?[ps.myTrumpCard]:[])]);}
    current.lockedTrump=s.trumpCardPlaced?s.revealedTrumpCard:null;current.trumpSuit=s.trumpSuit;
    // Complete engine observation (including streak, reveal, scoring) plus all
    // publicly known hands. Cache is local to this decision, never cross-room.
    const key=JSON.stringify([s,[...current]]);const hit=cache.get(key);if(hit!==undefined)return hit;
    const maximize=s.players.find(p=>p.id===id)!.team===team;
    let best=maximize?-Infinity:Infinity;
    for(const card of engine.getLegalCardsForPlayer(id)){
      const child=BundRungEngine.fromObservation(s,current);child.playCard(id,card.id);
      const next=child.getPublicState(),nw=new SimulationWorld();
      for(const p of next.players){const ps=child.getPrivateState(p.id);nw.set(p.id,[...ps.myHand,...(ps.myTrumpCard?[ps.myTrumpCard]:[])]);}
      nw.lockedTrump=next.trumpCardPlaced?next.revealedTrumpCard:null;nw.trumpSuit=next.trumpSuit;
      const value=visit(next,nw);best=maximize?Math.max(best,value):Math.min(best,value);
    }
    cache.set(key,best);return best;
  };
  try {
    let best=legal[0],value=-Infinity;
    for(const card of legal){
      const engine=BundRungEngine.fromObservation(state,world);engine.playCard(actor,card.id);
      const next=engine.getPublicState(),nw=new SimulationWorld();
      for(const p of next.players){const ps=engine.getPrivateState(p.id);nw.set(p.id,[...ps.myHand,...(ps.myTrumpCard?[ps.myTrumpCard]:[])]);}
      nw.lockedTrump=next.trumpCardPlaced?next.revealedTrumpCard:null;nw.trumpSuit=next.trumpSuit;
      const v=visit(next,nw);if(v>value){value=v;best=card;}
    }
    endgameStats.solved++;return best;
  }catch(error){if(error instanceof Error&&error.message==='ENDGAME_BUDGET'){endgameStats.budgetStops++;return null;}throw error;}
  finally{endgameStats.nodes+=nodes;}
}
