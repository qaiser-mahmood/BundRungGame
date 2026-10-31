import {CompactState,Play,team,indexOf} from './CompactState';
export interface ActorObservation {
 knownHands?:(number[]|null)[];knowledge?:{seen:Uint8Array;voids:number[]};actor:number;team:number;teams:number[];hand:number[];locked:number;secretTrump:number;trump:number;revealed:boolean;
 caller:number;counts:number[];lockedPlaced:boolean;requester:number;revealer:number;lead:number;trick:number;plays:Play[];history:Play[];streakSeat:number;streak:number;callerTeam:number;lastWinner:number;lastCard:number;
}
/** Only the acting player's own hand and legitimate public/remembered cards.
 * Concealed opponent identities are -1, never zero-valued fabricated cards. */
export function observe(s:CompactState,actor=s.actor,includeHistory=true,includeKnowledge=false):ActorObservation {
 const visible=(p:Play):Play=>{
  const concealed=p.hidden&&!s.revealed&&p.seat!==actor;
  return {seat:p.seat,card:concealed?-1:p.card,hidden:p.hidden,aceDown:concealed?false:p.aceDown,revealed:p.revealed,trick:p.trick};
 };
 let knowledge:ActorObservation['knowledge'];
 if(includeKnowledge){
  const seen=new Uint8Array(52),voids=[0,0,0,0];let trick=-1,lead=-1;
  for(const p of [...s.history,...s.plays]){
   const c=p.hidden&&!s.revealed&&p.seat!==actor?-1:p.card;
   if(p.trick!==trick){trick=p.trick;lead=c>=0?Math.floor(c/13):-1;}
   if(c<0)continue;seen[c]=1;
   if(lead>=0&&Math.floor(c/13)!==lead&&!(p.seat===s.caller&&s.locked>=0&&(!p.revealed||s.revealed&&s.trump===lead)))voids[p.seat]|=1<<lead;
  }
  knowledge={seen,voids};
 }
 const knownHands:(number[]|null)[]=new Array(4).fill(null);
 for(let i=0;i<4;i++){
  const shown=s.source.revealedHands[s.source.players[i].id];
  if(shown===undefined&&!(i===s.caller&&s.revealed&&s.locked>=0))continue;
  const known:number[]=[];
  for(const c of shown??[]){const index=indexOf(c.id);if(s.hands[i].includes(index))known.push(index);}
  if(i===s.caller&&s.revealed&&s.locked>=0&&!known.includes(s.locked))known.push(s.locked);
  knownHands[i]=known;
 }
 return {knownHands,knowledge,actor,team:team(s,actor),teams:s.source.players.map((_,i)=>team(s,i)),hand:Array.from(s.hands[actor]),locked:s.caller===actor||s.revealed?s.locked:-1,
  secretTrump:s.caller===actor?s.trump:-1,trump:s.revealed?s.trump:-1,revealed:s.revealed,caller:s.caller,counts:s.hands.map((h,i)=>h.length+Number(i===s.caller&&s.locked>=0)),lockedPlaced:s.locked>=0,requester:s.requester,revealer:s.revealer,lead:s.lead,trick:s.trick,
  plays:s.plays.map(visible),history:includeHistory?s.history.map(visible):[],streakSeat:s.streakSeat,streak:s.streak,callerTeam:team(s,s.caller),
  lastWinner:s.lastWinner,lastCard:[s.history,s.plays,s.accumulated].some(list=>list.some(p=>p.card===s.lastCard&&p.hidden&&!s.revealed&&p.seat!==actor))?-1:s.lastCard};
}
function keyHeader(o:ActorObservation):string {
 return `${o.actor}/${o.knownHands?.map(h=>h===null?'?':h.join(',')).join(';')??''}/${o.caller}/${o.counts}/${o.lockedPlaced}/${o.requester}/${o.revealer}/${o.hand.slice().sort((a,b)=>a-b)}/${o.locked}/${o.secretTrump}/${o.trump}/${o.revealed}/${o.trick}/${o.lead}/${o.streakSeat}/${o.streak}/${o.lastWinner}/${o.lastCard}/`;
}
function playFragment(p:Play,concealed=false):string {
 // Fixed-width bounded fields prevent delimiter/concatenation collisions.
 return String.fromCharCode(33+p.trick,33+p.seat,34+(concealed?-1:p.card),33+(Number(!concealed&&p.aceDown)|Number(p.hidden)<<1|Number(p.revealed)<<2));
}
export function informationKey(o:ActorObservation):string {
 let key=keyHeader(o);for(const p of o.history)key+=playFragment(p);for(const p of o.plays)key+=playFragment(p);return key;
}
/** Exactly the same observable key, without allocating historical Play DTOs. */
export function stateInformationKey(s:CompactState,o=observe(s,s.actor,false)):string {
 let key=keyHeader(o);
 for(const list of [s.history,s.plays])for(const p of list)key+=playFragment(p,p.hidden&&!s.revealed&&p.seat!==o.actor);
 return key;
}
