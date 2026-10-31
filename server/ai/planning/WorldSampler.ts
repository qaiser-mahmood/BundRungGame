import type {Card,PrivatePlayerState,PublicGameState,Suit} from '../../../shared/types';
import {ALL_52_CARDS} from './CardTracker';
import {SimulationWorld} from '../../engine/SimulationWorld';
export class SamplingError extends Error {
  constructor(public readonly reason:string){super(reason);}
}
export function sampleWorld(state:PublicGameState,actor:string,hand:Card[],voids:Map<string,Set<Suit>>,
  privateState?:PrivatePlayerState,random:()=>number=Math.random):SimulationWorld {
  if(state.players.length!==4||new Set(state.players.map(p=>p.id)).size!==4)throw new SamplingError('INVALID_PLAYERS');
  const world=new SimulationWorld();
  const known=new Map<string,string>();
  const canonical=new Map(ALL_52_CARDS.map(c=>[c.id,c]));
  const reserve=(card:Card,owner:string)=>{
    const expected=canonical.get(card.id);
    if(!expected || expected.suit!==card.suit || expected.rank!==card.rank || expected.playValue!==card.playValue || expected.tossValue!==card.tossValue)throw new SamplingError('UNKNOWN_CARD');
    const previous=known.get(card.id);
    if(previous && previous!==owner)throw new SamplingError('CONFLICTING_OWNERSHIP');
    known.set(card.id,owner);
  };
  const needs=new Map<string,number>();
  const forbidden=new Map<string,Set<Suit>>();
  if(new Set(hand.map(c=>c.id)).size!==hand.length)throw new SamplingError('DUPLICATE_ACTOR_CARD');
  for(const p of state.players){
    if(!Number.isSafeInteger(p.cardsInHandCount)||p.cardsInHandCount<0||p.cardsInHandCount>13)throw new SamplingError('INVALID_HAND_COUNT');
    world.set(p.id,[]);needs.set(p.id,p.cardsInHandCount);forbidden.set(p.id,voids.get(p.id)??new Set());
  }
  if(!needs.has(actor))throw new SamplingError('UNKNOWN_ACTOR');
  const addKnown=(pid:string,c:Card)=>{
    reserve(c,pid);const cards=world.get(pid);
    if(!cards)throw new SamplingError('UNKNOWN_OWNER');
    if(!cards.some(x=>x.id===c.id))cards.push(c);
  };
  hand.forEach(c=>addKnown(actor,c));
  if(privateState?.myTrumpCard)addKnown(actor,privateState.myTrumpCard);
  for(const [pid,cards] of Object.entries(state.revealedHands))cards.forEach(c=>addKnown(pid,c));
  if(state.revealedTrumpCard && state.trumpCallerPlayerId)addKnown(state.trumpCallerPlayerId,state.revealedTrumpCard);
  if(privateState?.partnerHand){const team=state.players.find(p=>p.id===actor)?.team;const partner=state.players.find(p=>p.team===team&&p.id!==actor);if(partner)privateState.partnerHand.forEach(c=>addKnown(partner.id,c));}
  const slots: {key:string;forbidden:Set<Suit>}[]=[];
  for(const trick of [...state.completedTricks,state.currentTrick])for(const pc of trick.cards){
    const key=`${trick.trickNumber}:${pc.playerId}`;
    const remembered=privateState?.knownConcealedCards?.[key] ?? (state.faceDownLeadPending && pc.playerId===state.faceDownLeadPlayerId ? privateState?.teammateFaceDownCard : null);
    if(pc.card||remembered){const c=pc.card??remembered!;reserve(c,`played:${key}`);world.concealed.set(key,c);}
    else {
      const blocked = new Set<Suit>(trick.leadSuit ? pc.playerId===trick.leadPlayerId
        ? (['HEARTS','DIAMONDS','CLUBS','SPADES'] as Suit[]).filter(s=>s!==trick.leadSuit) : [trick.leadSuit] : []);
      slots.push({key,forbidden:blocked});needs.set(`played:${key}`,1);forbidden.set(`played:${key}`,blocked);world.set(`played:${key}`,[]);
    }
  }
  for(const p of state.players){
    const cards=world.get(p.id)!;
    if(cards.some(c=>forbidden.get(p.id)!.has(c.suit)))throw new SamplingError('KNOWN_CARD_VIOLATES_VOID');
    const remaining=p.cardsInHandCount-cards.length;
    if(remaining<0 || !Number.isSafeInteger(remaining))throw new SamplingError('HAND_COUNT_MISMATCH');
    needs.set(p.id,remaining);
  }
  if(needs.get(actor)!==0)throw new SamplingError('ACTOR_HAND_INCOMPLETE');
  const unseen=ALL_52_CARDS.filter(c=>!known.has(c.id));
  if([...needs.values()].reduce((a,b)=>a+b,0)!==unseen.length)throw new SamplingError('DECK_COUNT_MISMATCH');
  // Randomized augmenting-path bipartite matching: cards -> capacity slots.
  // This always finds a feasible matching or explicitly rejects it; no void relaxation.
  const owners=[...needs].flatMap(([pid,n])=>Array.from({length:n},()=>pid));
  for(let i=unseen.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[unseen[i],unseen[j]]=[unseen[j],unseen[i]];}
  const assigned:(Card|undefined)[]=new Array(owners.length);
  const match=(c:Card,seen:Set<number>):boolean=>{
    const start=Math.floor(random()*Math.max(1,owners.length));
    for(let offset=0;offset<owners.length;offset++){
      const i=(offset+start)%owners.length;
      if(seen.has(i)||forbidden.get(owners[i])!.has(c.suit))continue;
      seen.add(i);
      if(!assigned[i]||match(assigned[i]!,seen)){assigned[i]=c;return true;}
    }
    return false;
  };
  for(const c of unseen)if(!match(c,new Set()))throw new SamplingError('INFEASIBLE_VOIDS');
  assigned.forEach((c,i)=>world.get(owners[i])!.push(c!));
  for(const slot of slots){world.concealed.set(slot.key,world.get(`played:${slot.key}`)![0]);world.delete(`played:${slot.key}`);}
  const caller=state.trumpCallerPlayerId;
  if(state.trumpCardPlaced && caller){
    const knownTrump=privateState?.myTrumpCard??state.revealedTrumpCard;
    const ordinaryKnown=new Set((state.revealedHands[caller]??[]).map(c=>c.id));
    const candidates=world.get(caller)!.filter(c=>!ordinaryKnown.has(c.id)&&(!privateState?.secretTrumpSuit||c.suit===privateState.secretTrumpSuit));
    const selected=knownTrump??candidates[Math.floor(random()*candidates.length)];
    if(!selected)throw new SamplingError('NO_PLAUSIBLE_LOCKED_TRUMP');
    world.lockedTrump=selected;world.trumpSuit=selected.suit;
  }else world.trumpSuit=state.trumpSuit??privateState?.secretTrumpSuit??null;
  return world;
}
