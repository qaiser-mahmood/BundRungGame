import {ActorObservation} from '../simulation/observation';
import {suit,value} from '../simulation/CompactState';
import {winningPlay} from '../simulation/FastSimulator';
/** Affordable observation-only counterpart of Phase 2 partnership preferences.
 * Only closed tricks can be certified safe; earlier seats retain uncertainty. */
export function rolloutAction(o:ActorObservation,legal:number[],partnership=true):number {
 const sorted=legal.slice().sort((a,b)=>value(a)-value(b)||a-b);if(!partnership||!o.plays.length)return sorted[0];
 const visible=o.plays.filter(p=>p.card>=0),before=visible.length?winningPlay(visible,o.lead,o.trump):null;
 const partnerSafe=o.plays.length===3&&before&&before.seat!==o.actor&&o.teams[before.seat]===o.team;
 const streak=o.revealed&&o.trick>1&&o.callerTeam!==o.team&&o.streakSeat===o.actor&&o.streak>=1;
 if(partnerSafe&&!streak)return sorted[0];
 const wins=sorted.filter(c=>winningPlay([...visible,{seat:o.actor,card:c,hidden:false,aceDown:false,revealed:o.revealed,trick:o.trick}],o.lead,o.trump).seat===o.actor);
 if(wins.length)return wins.sort((a,b)=>Number(suit(a)===o.trump)-Number(suit(b)===o.trump)||value(a)-value(b)||a-b)[0];
 return sorted[0];
}
