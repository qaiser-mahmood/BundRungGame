import {describe,it,expect} from 'vitest';
import {setupGame} from '../scripts/ai-benchmark';
import {advanceForced} from '../server/ai/planning/MonteCarloPlanner';
import {CARDS,indexOf} from '../server/ai/v2/simulation/CompactState';
import {observeDecision,vectorize,legalMask,FEATURE_COUNT,FEATURE_NAMES,strategicFacts,DecisionObservation} from '../server/ai/v3/data/Observation';
import {LinearHead} from '../server/ai/v3/learning/LinearBaseline';
import type {Card} from '../shared/types';
function position(predicate:(e:ReturnType<typeof setupGame>)=>boolean=()=>true){
 for(let seed=2;seed<50;seed++){const e=setupGame(seed);for(let step=0;step<70&&e.getPhase()==='TRICK_PLAYING';step++){
  if(advanceForced(e))continue;const s=e.getPublicState(),p=e.getPrivateState(s.currentTurnPlayerId!),legal=e.getLegalCardsForPlayer(p.myPlayerId);
  if(legal.length>1&&predicate(e))return {e,s,p,o:observeDecision(s,p)};e.playCard(p.myPlayerId,legal[0].id);
 }}throw new Error('NO_OBSERVABLE_FIXTURE');
}
describe('V3 observable strategic-memory privacy',()=>{
 it('has stable named finite features, legal masks and anonymous chronological seats',()=>{
  const {s,p,o}=position();const x=vectorize(o);expect(x).toHaveLength(FEATURE_COUNT);expect(new Set(FEATURE_NAMES).size).toBe(FEATURE_COUNT);expect(x.every(Number.isFinite)).toBe(true);
  expect(legalMask(o).filter(Boolean).length).toBe(p.legalPlayableCardIds.length);expect(o.teams[0]).toBe(0);
  for(const player of s.players){expect(JSON.stringify(o)).not.toContain('"'+player.id+'"');expect(JSON.stringify(o)).not.toContain(player.name);}
  expect(o.history.every(h=>h.seat>=0&&h.seat<4)).toBe(true);
 });
 it('real hidden-hand swaps preserve model inputs and nontrivial predictions',()=>{
  const {e,s,p,o}=position(),others=s.players.filter(x=>x.id!==p.myPlayerId),hands=e.getHands(),head=new LinearHead(5,Array.from({length:5*FEATURE_COUNT},(_,i)=>Math.sin(i)*.01));head.trainingRows=20;
  const first=head.probabilities(vectorize(o));[hands[others[0].id][0],hands[others[1].id][0]]=[hands[others[1].id][0],hands[others[0].id][0]];
  const after=observeDecision(e.getPublicState(),e.getPrivateState(p.myPlayerId));expect(after).toEqual(o);expect(vectorize(after)).toEqual(vectorize(o));expect(head.probabilities(vectorize(after))).toEqual(first);
 });
 it('even the caller does not encode its undisclosed locked identity or suit',()=>{
  const {e,s,p,o}=position(e=>{const s=e.getPublicState();return !s.isTrumpRevealed&&s.currentTurnPlayerId===s.trumpCallerPlayerId&&!!e.getPrivateState(s.currentTurnPlayerId!).myTrumpCard;});
  const other=s.players.find(x=>x.id!==p.myPlayerId)!,hands=e.getHands(),replacement=hands[other.id][0],old=p.myTrumpCard!;
  const source=e as unknown as {trumpCard:Card;chosenTrumpCard:Card;trumpSuit:Card['suit']};source.trumpCard=replacement;source.chosenTrumpCard=replacement;source.trumpSuit=replacement.suit;hands[other.id][0]=old;
  const after=observeDecision(e.getPublicState(),e.getPrivateState(p.myPlayerId));expect(after.publicTrump).toBeNull();expect(after).toEqual(o);expect(vectorize(after)).toEqual(vectorize(o));
 });
 it('ignores hidden aliases in secondary metadata and nonowner private fields',()=>{
  const {s,p,o}=position(e=>!e.getPublicState().isTrumpRevealed),secret=CARDS.find(c=>!p.myHand.some(h=>h.id===c.id))!;
  const altered=structuredClone(s);altered.statusMessage=secret.id;altered.lastTrickWinningCard=secret;altered.previousTrickCards=[{playerId:s.players[1].id,card:secret,playedAt:1}];altered.revealedTrumpCard=secret;altered.pendingOpenRungSuit=secret.suit;
  altered.faceDownCallerCards=[{id:secret.id,card:secret,trickNumber:1,isRevealed:false}];altered.players.forEach(x=>x.name=secret.id);
  const priv={...p,secretTrumpSuit:secret.suit,teammateFaceDownCard:secret,partnerHand:[secret],knownConcealedCards:{'1:alias':secret}};
  expect(observeDecision(altered,priv)).toEqual(o);
 });
 it('concealed Ace/debug metadata never becomes a public card fact',()=>{
  const {s,p}=position(e=>e.getPublicState().completedTricks.some(t=>t.cards.some(c=>!c.card)));
  const a=structuredClone(s),b=structuredClone(s);
  for(const [state,flag] of [[a,true],[b,false]] as const)for(const t of [...state.completedTricks,state.currentTrick])for(const c of t.cards)if(!c.card){c.isAceDowngraded=flag;Object.assign(c,{debugCardId:flag?'H_A':'D_K'});}
  expect(observeDecision(a,p)).toEqual(observeDecision(b,p));expect(observeDecision(a,p).history.filter(h=>h.card===null).every(h=>h.aceDown===null)).toBe(true);
 });
 it('does not expose the forced unrevealed final locked card through the action mask',()=>{
  const {e,s,p}=position(e=>{const s=e.getPublicState();return !s.isTrumpRevealed&&s.currentTurnPlayerId===s.trumpCallerPlayerId&&!!e.getPrivateState(s.currentTurnPlayerId!).myTrumpCard;});
  e.getHands()[p.myPlayerId]=[];e.getPlayers().find(x=>x.id===p.myPlayerId)!.cardsInHandCount=1;
  expect(()=>observeDecision(e.getPublicState(),e.getPrivateState(p.myPlayerId))).toThrow('V3_ACTION_REQUIRES_PUBLIC_IDENTITY');expect(s.isTrumpRevealed).toBe(false);
 });
 it('reconstructs each room/hand independently with no previous-observer cache',()=>{
  const a=position(e=>e.getPublicState().completedTricks.length>1),fresh=position();observeDecision(a.s,a.p);
  expect(observeDecision(fresh.s,fresh.p)).toEqual(fresh.o);expect(vectorize(fresh.o)).not.toEqual(vectorize(a.o));
 });
});
describe('V3 expert hypotheses remain observations, not labels',()=>{
 function hypothetical():DecisionObservation {
  const {o}=position();return {...structuredClone(o),currentTrick:3,currentLength:1,completedWinners:[o.partner,o.partner],history:[
   {trick:1,seat:o.partner,card:indexOf('H_A'),lead:0,aceDown:false,trumpRevealedAtPlay:false},
   {trick:2,seat:o.partner,card:indexOf('D_2'),lead:1,aceDown:false,trumpRevealedAtPlay:false},
   {trick:3,seat:o.partner,card:indexOf('D_3'),lead:1,aceDown:false,trumpRevealedAtPlay:false}]};
 }
 it('records low/high leads, repetitions and preceding wins without a shortage inference',()=>{
  const low=hypothetical(),high=structuredClone(low);high.history[2].card=indexOf('D_K');
  expect(strategicFacts(low).partnerLead!.strength).toBeLessThan(strategicFacts(high).partnerLead!.strength!);
  expect(strategicFacts(low).partnerLead!.afterWin).toBe(true);expect(strategicFacts(low).partnerLead!.repeated).toBe(true);
  expect(strategicFacts(low)).not.toHaveProperty('intendedReturnSuit');expect(strategicFacts(low)).not.toHaveProperty('partnerShortage');expect(low.voids).toEqual(high.voids);
 });
 it('keeps ambiguous high-win to different-low evidence distinct, without assigning intent',()=>{
  const o=hypothetical();o.history[1].card=indexOf('H_A');o.history[1].lead=0;o.history[0].card=indexOf('C_K');o.history[0].lead=2;
  const f=strategicFacts(o);expect(f.partnerPreviousWin!.suit).toBe(0);expect(f.partnerLead!.suit).toBe(1);expect(f.partnerLead!.strength).toBeLessThan(.5);
 });
 it('counts visible higher cards separately from unlocated cards',()=>{
  const o=hypothetical();o.history=[];o.ownCards=[indexOf('H_K')];o.publicHands=[null,[indexOf('H_A')],null,null];
  const f=strategicFacts(o);expect(f.knownHigher[0]).toBe(1);expect(f.higherUnknown[0]).toBe(0);
 });
 it('uses effective lead power for a publicly downgraded Ace',()=>{
  const o=hypothetical();o.history[2].card=indexOf('D_A');o.history[2].aceDown=true;expect(strategicFacts(o).partnerLead!.strength).toBe(2/14);
 });
});
