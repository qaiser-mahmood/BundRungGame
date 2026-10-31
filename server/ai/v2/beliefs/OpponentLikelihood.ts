import type {PublicGameState} from '../../../../shared/types';
import type {SimulationWorld} from '../../../engine/SimulationWorld';
/** Deliberately weak behavior prior, mixed with uniform play. Never a hard fact.
 * Reverse reconstruction uses only a proposed world and observed history. */
export function opponentLogLikelihood(state:PublicGameState,world:SimulationWorld,observer:string,strength=1):number {
 let log=0;
 const plays=[...state.completedTricks,state.currentTrick].flatMap(t=>t.cards.map(p=>({p,lead:t.leadSuit,trick:t.trickNumber})));
 for(let i=0;i<plays.length;i++){
  const {p,lead,trick}=plays[i];if(p.playerId===observer||!p.card)continue;
  const later=plays.slice(i+1).filter(x=>x.p.playerId===p.playerId).map(x=>x.p.card??world.concealed.get(`${x.trick}:${x.p.playerId}`)).filter(c=>!!c);
  const held=[...(world.get(p.playerId)??[]),...later,p.card];
  const candidates=lead&&held.some(c=>c.suit===lead)?held.filter(c=>c.suit===lead):held;
  const better=candidates.filter(c=>c.playValue<p.card!.playValue).length;
  // Relative likelihood to uniform: lower legal ranks somewhat more likely.
  // A losing/overtaking choice retains positive probability in every world.
  log+=Math.log(0.5+0.5*Math.exp(-better/Math.max(1,candidates.length-1)));
 }
 return Math.max(-50,log*strength);
}
export function normalizedWeights(logs:number[]):number[]{
 if(!logs.length||logs.some(x=>!Number.isFinite(x)))throw new Error('V2_INVALID_WEIGHTS');
 const max=Math.max(...logs),w=logs.map(x=>Math.exp(x-max)),sum=w.reduce((a,b)=>a+b,0);return w.map(x=>x/sum);
}
export const effectiveSampleSize=(weights:number[]):number=>1/weights.reduce((n,w)=>n+w*w,0);
