import type {Card,PrivatePlayerState,PublicGameState} from '../../../../shared/types';
import {CARDS,indexOf,SUITS} from '../../v2/simulation/CompactState';
import {CardTracker} from '../../planning/CardTracker';
export const OBSERVATION_SCHEMA='bundrung-v3-observable-memory/v1' as const;
export interface PublicPlay {
 trick:number;seat:number;card:number|null;lead:number|null;aceDown:boolean|null;trumpRevealedAtPlay:boolean|null;
}
export interface DecisionObservation {
 schema:typeof OBSERVATION_SCHEMA;teams:number[];partner:number;caller:number|null;dealer:number;counts:number[];
 ownCards:number[];legal:number[];history:PublicPlay[];completedWinners:(number|null)[];
 currentTrick:number;currentLead:number|null;currentLength:number;publicTrump:number|null;trumpRevealed:boolean;lockedSlot:boolean;
 mode:'CLOSE_TRUMP'|'OPEN_TRUMP'|'BWINJI';modifier:string;score:number;streakSeat:number|null;streakCount:number;
 publicHands:(number[]|null)[];voids:number[][];canRequestReveal:boolean;canShowTrump:boolean;
}
function canonical(c:Card):number {
 const i=indexOf(c.id),expected=CARDS[i];
 if(!expected||c.suit!==expected.suit||c.rank!==expected.rank||c.playValue!==expected.playValue||c.tossValue!==expected.tossValue)throw new Error('V3_NONCANONICAL_CARD');
 return i;
}
/** Reconstruct episodic memory from the complete authoritative observation.
 * No cross-room cache, inferred intentions or private opponent/referee data. */
export function observeDecision(state:PublicGameState,priv:PrivatePlayerState):DecisionObservation {
 const ids=state.players.map(p=>p.id),actor=ids.indexOf(priv.myPlayerId);
 if(state.phase!=='TRICK_PLAYING'||actor<0||ids.length!==4||new Set(ids).size!==4||state.currentTurnPlayerId!==priv.myPlayerId||state.isRungRevealPaused||state.isTrumpRevealPending||state.faceDownLeadPending)throw new Error('V3_NOT_CARD_DECISION');
 const relative=(id:string|null|undefined):number|null=>{const i=ids.indexOf(id??'');return i<0?null:(i-actor+4)%4;};
 const players=Array.from({length:4},(_,i)=>state.players[(actor+i)%4]),ourTeam=players[0].team;
 const partner=players.findIndex((p,i)=>i>0&&p.team===ourTeam);if(partner<0)throw new Error('V3_PARTNER_MISSING');
 const ownCards=priv.myHand.map(canonical);
 if(state.isTrumpRevealed&&state.trumpCallerPlayerId===priv.myPlayerId&&state.revealedTrumpCard&&!ownCards.includes(canonical(state.revealedTrumpCard)))ownCards.push(canonical(state.revealedTrumpCard));
 const legal=priv.legalPlayableCardIds.map(id=>{const c=indexOf(id);if(c<0)throw new Error('V3_NONCANONICAL_CARD');return c;});
 // Never encode the caller's still-concealed last locked card through a mask.
 // Its forced authoritative play requires no learned choice.
 if(legal.some(c=>!ownCards.includes(c)))throw new Error('V3_ACTION_REQUIRES_PUBLIC_IDENTITY');
 if(!legal.length||new Set(legal).size!==legal.length||new Set(ownCards).size!==ownCards.length)throw new Error('V3_LEGAL_MASK');
 const history:PublicPlay[]=[];
 for(const trick of [...state.completedTricks,state.currentTrick]){
  for(const p of trick.cards){
   const seat=relative(p.playerId);if(seat===null)throw new Error('V3_UNKNOWN_SEAT');
   // Known concealed memories, side-panel IDs, debug properties and redundant
   // winning/previous-card aliases are intentionally not used.
   const visible=p.card!==null&&(!p.isFaceDown||state.isTrumpRevealed);
   history.push({trick:trick.trickNumber,seat,card:visible?canonical(p.card!):null,lead:trick.leadSuit?SUITS.indexOf(trick.leadSuit):null,
    aceDown:visible?!!p.isAceDowngraded:null,trumpRevealedAtPlay:typeof p.trumpWasRevealed==='boolean'?p.trumpWasRevealed:null});
  }
 }
 const voidMap=CardTracker.getVoidMatrix(state);
 const publicHands=players.map(p=>{
  const shown=Object.prototype.hasOwnProperty.call(state.revealedHands,p.id)?state.revealedHands[p.id].map(canonical):null;
  if(state.isTrumpRevealed&&p.id===state.trumpCallerPlayerId&&state.revealedTrumpCard){const cards=shown??[];const c=canonical(state.revealedTrumpCard);return cards.includes(c)?cards:[...cards,c];}
  return shown;
 });
 const modifier=state.openTrumpModifier??state.bwinjiModifier??'STANDARD';
 return {schema:OBSERVATION_SCHEMA,teams:players.map(p=>Number(p.team!==ourTeam)),partner,caller:relative(state.trumpCallerPlayerId),dealer:relative(ids[state.dealerPlayerIndex])!,counts:players.map(p=>p.cardsInHandCount),
  ownCards:ownCards.sort((a,b)=>a-b),legal:legal.sort((a,b)=>a-b),history,completedWinners:state.completedTricks.map(t=>relative(t.winnerPlayerId)),
  currentTrick:state.currentTrick.trickNumber,currentLead:state.currentTrick.leadSuit?SUITS.indexOf(state.currentTrick.leadSuit):null,currentLength:state.currentTrick.cards.length,
  publicTrump:state.isTrumpRevealed&&state.trumpSuit?SUITS.indexOf(state.trumpSuit):null,trumpRevealed:state.isTrumpRevealed,lockedSlot:state.trumpCardPlaced,mode:state.trumpMode??'CLOSE_TRUMP',modifier,score:state.scorecard.dealerScore,
  streakSeat:relative(state.streakWinnerPlayerId),streakCount:state.streakCount??0,publicHands,
  voids:players.map(p=>SUITS.map(s=>Number(voidMap.get(p.id)?.has(s)))),canRequestReveal:priv.canRequestRungReveal,canShowTrump:priv.canShowTrump};
}
export interface StrategicFacts {
 played:number[];playedBySeat:number[][];partnerLead:{suit:number|null;strength:number|null;afterWin:boolean;repeated:boolean}|null;
 partnerPreviousWin:{suit:number|null;strength:number|null}|null;partnerLeadCounts:number[];ownSuitCounts:number[];unknownSuitCounts:number[];ownHigh:number[];higherUnknown:number[];knownHigher:number[];
}
export function strategicFacts(o:DecisionObservation):StrategicFacts {
 const played=new Array(52).fill(0),playedBySeat=Array.from({length:4},()=>[0,0,0,0]),partnerLeadCounts=[0,0,0,0],leads:PublicPlay[]=[];
 let lastTrick=-1;
 for(const p of o.history){
  if(p.card!==null){played[p.card]=1;playedBySeat[p.seat][Math.floor(p.card/13)]++;}
  if(p.trick!==lastTrick){lastTrick=p.trick;if(p.seat===o.partner){leads.push(p);if(p.lead!==null)partnerLeadCounts[p.lead]++;}}
 }
 const latest=leads.at(-1),previous=leads.at(-2);
 const winTrick=latest?latest.trick-1:-1,winner=winTrick>=1?o.completedWinners[winTrick-1]:null;
 const winningPlay=winner===o.partner?o.history.find(p=>p.trick===winTrick&&p.seat===o.partner):null;
 const partnerLead=latest?{suit:latest.lead,strength:latest.card===null?null:(latest.aceDown?2:CARDS[latest.card].playValue)/14,afterWin:winner===o.partner,repeated:!!previous&&latest.lead!==null&&previous.lead===latest.lead}:null;
 const ownSuitCounts=[0,0,0,0],unknownSuitCounts=[0,0,0,0],ownHigh=[0,0,0,0],higherUnknown=[0,0,0,0],knownHigher=[0,0,0,0],owned=new Set(o.ownCards),known=new Set(o.publicHands.flatMap(h=>h??[]));
 for(const c of o.ownCards){const s=Math.floor(c/13);ownSuitCounts[s]++;ownHigh[s]=Math.max(ownHigh[s],CARDS[c].playValue);}
 for(let c=0;c<52;c++)if(!played[c]&&!owned.has(c)){const s=Math.floor(c/13);if(known.has(c)){if(CARDS[c].playValue>ownHigh[s])knownHigher[s]++;}else{unknownSuitCounts[s]++;if(CARDS[c].playValue>ownHigh[s])higherUnknown[s]++;}}
 return {played,playedBySeat,partnerLead,partnerPreviousWin:winningPlay?{suit:winningPlay.card===null?null:Math.floor(winningPlay.card/13),strength:winningPlay.card===null?null:(winningPlay.aceDown?2:CARDS[winningPlay.card].playValue)/14}:null,
  partnerLeadCounts,ownSuitCounts,unknownSuitCounts,ownHigh,higherUnknown,knownHigher};
}
const names:string[]=[];
const group=(prefix:string,count:number)=>{for(let i=0;i<count;i++)names.push(`${prefix}.${i}`);};
for(const prefix of ['own','played','legal'])group(prefix,52);
group('playedBySeatSuit',16);group('publicVoidSeatSuit',16);
for(const prefix of ['heldCount','ownSuitCount','unknownSuitCount','ownHigh','higherUnknown','higherKnownOther'])group(prefix,4);
for(const prefix of ['publicTrump','caller','streakSeat'])group(prefix,5);
for(const prefix of ['dealer','partner'])group(prefix,4);
group('mode',3);group('modifier',4);group('trickPosition',5);
for(const scalar of ['trick','dealerScore','trumpRevealed','lockedSlot','callerOurTeam','streakCount','canRequestReveal','canShowTrump','partnerLeadStrength','partnerLeadStrengthKnown','partnerLeadAfterWin','partnerRepeatedLead','partnerPreviousWinStrength','partnerPreviousWinKnown'])group(scalar,1);
group('partnerLeadSuit',5);group('partnerPreviousWinSuit',5);group('partnerLeadSuitCounts',4);group('publicHeldSeatCard',208);group('publicHeldComplete',4);group('currentPlay',32);
export const FEATURE_NAMES:readonly string[]=Object.freeze(names);
export const FEATURE_SCHEMA='bundrung-v3-strategy-features/v1' as const;
export const FEATURE_COUNT=FEATURE_NAMES.length;
export function validateObservation(o:DecisionObservation):void {
 const seat=(n:number|null)=>n===null||Number.isSafeInteger(n)&&n>=0&&n<4;
 const cards=(xs:number[])=>Array.isArray(xs)&&xs.every(n=>Number.isSafeInteger(n)&&n>=0&&n<52)&&new Set(xs).size===xs.length;
 if(o.schema!==OBSERVATION_SCHEMA||!cards(o.ownCards)||!cards(o.legal)||!o.legal.length||o.legal.some(c=>!o.ownCards.includes(c))||o.teams.length!==4||o.teams[0]!==0||o.teams.some(t=>t!==0&&t!==1)||o.teams.filter(t=>t===0).length!==2||!seat(o.partner)||!o.partner||o.teams[o.partner]!==0||!seat(o.caller)||o.dealer===null||!seat(o.dealer)||!seat(o.streakSeat)||o.counts.length!==4||o.counts.some(n=>!Number.isSafeInteger(n)||n<0||n>13))throw new Error('V3_OBSERVATION_SCHEMA');
 if(!Number.isSafeInteger(o.currentTrick)||o.currentTrick<1||o.currentTrick>13||!Number.isSafeInteger(o.currentLength)||o.currentLength<0||o.currentLength>3||o.completedWinners.length!==o.currentTrick-1||o.completedWinners.some(n=>n===null||!seat(n))||o.history.length!==4*(o.currentTrick-1)+o.currentLength||!seat(o.currentLead)||!seat(o.publicTrump)||!o.trumpRevealed&&o.publicTrump!==null||typeof o.trumpRevealed!=='boolean'||typeof o.lockedSlot!=='boolean'||!Number.isFinite(o.score)||Math.abs(o.score)>416||!['CLOSE_TRUMP','OPEN_TRUMP','BWINJI'].includes(o.mode)||!['STANDARD','FACE_UP','FACE_DOWN_PLAY','FACE_DOWN_NO_PLAY'].includes(o.modifier))throw new Error('V3_OBSERVATION_CONTEXT');
 const played=new Set<number>();
 for(let i=0;i<o.history.length;i++){const p=o.history[i];if(p.trick!==Math.floor(i/4)+1||p.seat===null||!seat(p.seat)||!seat(p.lead)||p.card!==null&&(!Number.isSafeInteger(p.card)||p.card<0||p.card>=52||played.has(p.card))||p.card===null&&p.aceDown!==null||p.aceDown!==null&&typeof p.aceDown!=='boolean'||p.trumpRevealedAtPlay!==null&&typeof p.trumpRevealedAtPlay!=='boolean')throw new Error('V3_OBSERVATION_HISTORY');if(p.card!==null)played.add(p.card);}
 if(o.ownCards.some(c=>played.has(c))||o.ownCards.length!==o.counts[0]-Number(o.caller===0&&o.lockedSlot&&!o.trumpRevealed)||o.voids.length!==4||o.voids.some(v=>v.length!==4||v.some(n=>n!==0&&n!==1))||o.publicHands.length!==4)throw new Error('V3_OBSERVATION_OWNERSHIP');
 const known=new Map<number,number>();o.publicHands.forEach((h,i)=>{if(h===null)return;if(!cards(h)||h.length>o.counts[i]||h.some(c=>played.has(c)||i!==0&&o.ownCards.includes(c)))throw new Error('V3_PUBLIC_OWNERSHIP');for(const c of h){if(known.has(c)&&known.get(c)!==i)throw new Error('V3_PUBLIC_OWNERSHIP');known.set(c,i);}});
}
export function vectorize(o:DecisionObservation):number[]{
 validateObservation(o);
 const f=strategicFacts(o),x:number[]=[],onehot=(n:number,index:number|null)=>{for(let i=0;i<n;i++)x.push(Number(i===(index??n-1)));};
 x.push(...Array.from({length:52},(_,i)=>Number(o.ownCards.includes(i))),...f.played,...Array.from({length:52},(_,i)=>Number(o.legal.includes(i))));
 x.push(...f.playedBySeat.flat().map(n=>n/13),...o.voids.flat(),...o.counts.map(n=>n/13),...f.ownSuitCounts.map(n=>n/13),...f.unknownSuitCounts.map(n=>n/13),...f.ownHigh.map(n=>n/14),...f.higherUnknown.map(n=>n/13),...f.knownHigher.map(n=>n/13));
 onehot(5,o.publicTrump);onehot(5,o.caller);onehot(5,o.streakSeat);onehot(4,o.dealer);onehot(4,o.partner);onehot(3,['CLOSE_TRUMP','OPEN_TRUMP','BWINJI'].indexOf(o.mode));onehot(4,['STANDARD','FACE_UP','FACE_DOWN_PLAY','FACE_DOWN_NO_PLAY'].indexOf(o.modifier));onehot(5,o.currentLength);
 x.push(o.currentTrick/13,o.score/208,Number(o.trumpRevealed),Number(o.lockedSlot),Number(o.caller!==null&&o.teams[o.caller]===0),o.streakCount/13,Number(o.canRequestReveal),Number(o.canShowTrump),f.partnerLead?.strength??0,Number(f.partnerLead?.strength!==null&&f.partnerLead!==null),Number(!!f.partnerLead?.afterWin),Number(!!f.partnerLead?.repeated),f.partnerPreviousWin?.strength??0,Number(f.partnerPreviousWin?.strength!==null&&f.partnerPreviousWin!==null));
 onehot(5,f.partnerLead?.suit??null);onehot(5,f.partnerPreviousWin?.suit??null);x.push(...f.partnerLeadCounts.map(n=>n/13));
 for(const cards of o.publicHands)x.push(...Array.from({length:52},(_,i)=>Number(!!cards?.includes(i))));x.push(...o.publicHands.map((h,i)=>Number(h!==null&&h.length===o.counts[i])));
 const current=o.history.filter(p=>p.trick===o.currentTrick);
 for(let i=0;i<4;i++){const p=current[i];x.push(Number(!!p),p?p.seat/3:0,Number(!!p&&p.card!==null),p?.card===null||!p?0:Math.floor(p.card/13)/3,p?.card===null||!p?0:CARDS[p.card].playValue/14,Number(p?.aceDown===true),Number(p?.trumpRevealedAtPlay===true),Number(!!p&&p.trumpRevealedAtPlay!==null));}
 if(o.schema!==OBSERVATION_SCHEMA||x.length!==FEATURE_COUNT||x.some(v=>!Number.isFinite(v)||Math.abs(v)>2))throw new Error('V3_FEATURE_SCHEMA');return x;
}
export const legalMask=(o:DecisionObservation):number[]=>Array.from({length:52},(_,i)=>Number(o.legal.includes(i)));
