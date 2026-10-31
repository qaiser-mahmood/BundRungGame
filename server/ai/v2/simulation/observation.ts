import {CompactState,Play,team} from './CompactState';
export interface ActorObservation {
 actor:number;team:number;teams:number[];hand:number[];locked:number;secretTrump:number;trump:number;revealed:boolean;
 lead:number;trick:number;plays:Play[];history:Play[];streakSeat:number;streak:number;callerTeam:number;lastWinner:number;lastCard:number;
}
/** Only the acting player's own hand and legitimate public/remembered cards.
 * Concealed opponent identities are -1, never zero-valued fabricated cards. */
export function observe(s:CompactState,actor=s.actor):ActorObservation {
 const visible=(p:Play):Play=>({...p,card:p.hidden&&!s.revealed&&p.seat!==actor?-1:p.card});
 return {actor,team:team(s,actor),teams:s.source.players.map((_,i)=>team(s,i)),hand:Array.from(s.hands[actor]),locked:s.caller===actor||s.revealed?s.locked:-1,
  secretTrump:s.caller===actor?s.trump:-1,trump:s.revealed?s.trump:-1,revealed:s.revealed,lead:s.lead,trick:s.trick,
  plays:s.plays.map(visible),history:s.history.map(visible),streakSeat:s.streakSeat,streak:s.streak,callerTeam:team(s,s.caller),
  lastWinner:s.lastWinner,lastCard:s.history.some(p=>p.card===s.lastCard&&p.hidden)&&!s.revealed&&s.lastWinner!==actor?-1:s.lastCard};
}
export function informationKey(o:ActorObservation):string {
 // No sampled opponent holdings, locked identity or secret suit enters this key.
 return `${o.actor}/${o.hand.slice().sort((a,b)=>a-b)}/${o.locked}/${o.secretTrump}/${o.trump}/${o.revealed}/${o.trick}/${o.lead}/${o.streakSeat}/${o.streak}/${o.lastWinner}/${o.lastCard}/`+
  [...o.history,...o.plays].map(p=>`${p.trick}:${p.seat}:${p.card}:${+p.aceDown}:${+p.hidden}:${+p.revealed}`).join(';');
}
