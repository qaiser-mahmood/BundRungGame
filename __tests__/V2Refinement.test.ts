import {afterEach,vi} from 'vitest';
import * as fast from '../server/ai/v2/simulation/FastSimulator';
import {sampleWorld} from '../server/ai/planning/WorldSampler';
import {CardTracker} from '../server/ai/planning/CardTracker';
import {advanceForced} from '../server/ai/planning/MonteCarloPlanner';
import {decideV2,v2Stats} from '../server/ai/v2/strategy/DecisionController';
import {BotPlayer} from '../server/ai/BotPlayer';
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {setupGame,seededRandom} from '../scripts/ai-benchmark';
import {tacticalFixtures,tacticalLegalCards} from '../scripts/ai-tactical-fixtures';
import {oracleWorld} from '../scripts/v2-parity';
import {ismcts} from '../server/ai/v2/search/ISMCTS';
import {observe,informationKey,stateInformationKey,ActorObservation} from '../server/ai/v2/simulation/observation';
import {fromObservation} from '../server/ai/v2/simulation/adapters';
import {cloneState,indexOf,CARDS} from '../server/ai/v2/simulation/CompactState';
import {apply,legalCards,forcedAction} from '../server/ai/v2/simulation/FastSimulator';
import {controlRollout,controlSummary} from '../server/ai/v2/strategy/controlRollout';
import {rolloutAction} from '../server/ai/v2/strategy/rollout';
function fixture(seed=2){const e=setupGame(seed);return {e,s:fromObservation(e.getPublicState(),oracleWorld(e))};}
function puzzle(f:ReturnType<typeof tacticalFixtures>[number]):ActorObservation {
 const seat=(id:string|null|undefined)=>f.state.players.findIndex(p=>p.id===id);
 const p=(x:typeof f.state.currentTrick.cards[number],trick:number)=>({seat:seat(x.playerId),card:x.card?indexOf(x.card.id):-1,hidden:!!x.isFaceDown,aceDown:!!x.isAceDowngraded,revealed:x.trumpWasRevealed??f.state.isTrumpRevealed,trick});
 return {knownHands:f.state.players.map(p=>f.state.revealedHands[p.id]?.map(c=>indexOf(c.id))??null),actor:seat(f.priv.myPlayerId),team:0,teams:f.state.players.map(p=>p.team==='TEAM_1'?0:1),hand:f.priv.myHand.map(c=>indexOf(c.id)),locked:f.priv.myTrumpCard?indexOf(f.priv.myTrumpCard.id):-1,
  secretTrump:f.priv.secretTrumpSuit?['HEARTS','DIAMONDS','CLUBS','SPADES'].indexOf(f.priv.secretTrumpSuit):-1,trump:f.state.isTrumpRevealed&&f.state.trumpSuit?['HEARTS','DIAMONDS','CLUBS','SPADES'].indexOf(f.state.trumpSuit):-1,
  revealed:f.state.isTrumpRevealed,caller:seat(f.state.trumpCallerPlayerId),callerTeam:f.state.players[seat(f.state.trumpCallerPlayerId)].team==='TEAM_1'?0:1,counts:f.state.players.map(p=>p.cardsInHandCount),lockedPlaced:f.state.trumpCardPlaced,requester:-1,revealer:-1,
  lead:f.state.currentTrick.leadSuit?['HEARTS','DIAMONDS','CLUBS','SPADES'].indexOf(f.state.currentTrick.leadSuit):-1,trick:f.state.currentTrick.trickNumber,plays:f.state.currentTrick.cards.map(x=>p(x,f.state.currentTrick.trickNumber)),history:[],
  streakSeat:seat(f.state.streakWinnerPlayerId),streak:f.state.streakCount??0,lastWinner:seat(f.state.lastTrickWinnerPlayerId),lastCard:f.state.lastTrickWinningCard?indexOf(f.state.lastTrickWinningCard.id):-1};
}
afterEach(()=>vi.restoreAllMocks());
describe('search efficiency and adversarial information sets',()=>{
 it('retains historical fixed-work root statistics after allocation optimizations',()=>{
  const previous=JSON.parse(readFileSync('benchmarks/ai-v2-results.json','utf8')).rootDiagnostics.records;
  for(const record of previous){const e=setupGame(record.seed),state=e.getPublicState(),priv=e.getPrivateState(state.currentTurnPlayerId!);
   if(state.faceDownLeadPending||priv.canRequestRungReveal)continue;
   const r=ismcts(state,priv,e.getLegalCardsForPlayer(priv.myPlayerId),{timeMs:Infinity,random:seededRandom(record.seed)});
   expect(r.root).toEqual(record.diagnostic.root);expect(r.nodes).toBe(record.diagnostic.nodes);
  }
 });
 it('matches cached/light and uncached/full searches on reachable midgames',()=>{
  for(let seed=2;seed<8;seed++){
   const e=setupGame(seed);for(let step=0;step<12&&e.getPhase()==='TRICK_PLAYING';step++){
    const s=fromObservation(e.getPublicState(),oracleWorld(e)),a=forcedAction(s);
    if(a){if(a.type==='show')e.showTrumpCard(e.getPublicState().trumpCallerPlayerId!);else if(a.type==='request')e.requestTrumpReveal(e.getPublicState().currentTurnPlayerId!);else if(a.type==='resume')e.resumeAfterTrumpReveal();else if(a.type==='challenge')e.respondToFaceDownRung(e.getPlayers()[a.seat].id,a.accept);}
    else e.playCard(e.getPublicState().currentTurnPlayerId!,CARDS[legalCards(s)[0]].id);
   }
   if(e.getPhase()!=='TRICK_PLAYING')continue;
   const state=e.getPublicState(),id=state.currentTurnPlayerId!,priv=e.getPrivateState(id),cards=e.getLegalCardsForPlayer(id);if(!cards.length)continue;
   const run=(optimized:boolean)=>ismcts(state,priv,cards,{iterations:32,timeMs:Infinity,random:seededRandom(seed),reuseTemplates:optimized,lightRollouts:optimized});
   const old=run(false),fast=run(true);expect(fast.root).toEqual(old.root);expect(fast.nodes).toBe(old.nodes);expect(fast.efficiency.templateBuilds).toBeLessThanOrEqual(16);
  }
 });
 it('does not mutate compact templates or sibling clones',()=>{
  const {s}=fixture(),before=Array.from(s.hands[0]),a=cloneState(s),b=cloneState(s);const legal=legalCards(a);if(legal.length)apply(a,{type:'play',card:legal[0]});
  expect(Array.from(s.hands[0])).toEqual(before);expect(b.plays).toEqual(s.plays);expect(b.hands.map(h=>Array.from(h))).toEqual(s.hands.map(h=>Array.from(h)));
 });
 it('hides concealed card identity, Ace metadata, locked trump and debug aliases from other actors',()=>{
  const {s}=fixture(),actor=(s.caller+1)%4,a=cloneState(s),b=cloneState(s);
  for(const [state,c] of [[a,indexOf('H_A')],[b,indexOf('D_K')]] as const){state.revealed=false;state.locked=c;state.trump=Math.floor(c/13);state.lastCard=c;state.lastWinner=state.caller;
   state.history=[{seat:state.caller,card:c,hidden:true,aceDown:c%13===12,revealed:false,trick:1}];Object.assign(state.history[0],{debugCardId:CARDS[c].id});state.plays=[];}
  // Ordinary hand lengths are public; changing the lock identity does not alter them.
  const first=observe(a,actor,true,true),second=observe(b,actor,true,true);
  expect(first).toEqual(second);expect(informationKey(first)).toBe(informationKey(second));expect(first.history[0].card).toBe(-1);expect(first.history[0].aceDown).toBe(false);
  expect(JSON.stringify(first)).not.toContain('debugCardId');expect(controlRollout(first,[indexOf('C_2'),indexOf('S_2')])).toBe(controlRollout(second,[indexOf('C_2'),indexOf('S_2')]));
  expect(observe(a,a.caller).locked).toBe(a.locked);a.revealed=true;expect(observe(a,actor).history[0].card).toBe(a.lastCard);
 });
 it('redacts concealed aliases from secondary winning-card metadata',()=>{
  const {s}=fixture(),actor=(s.caller+1)%4,a=cloneState(s),b=cloneState(s);
  for(const [state,c] of [[a,indexOf('H_A')],[b,indexOf('D_K')]] as const){state.revealed=false;state.lastWinner=actor;state.lastCard=c;
   state.accumulated=[{seat:s.caller,card:c,hidden:true,aceDown:false,revealed:false,trick:1}];state.history=[];state.plays=[];}
  expect(observe(a,actor)).toEqual(observe(b,actor));expect(observe(a,actor).lastCard).toBe(-1);
 });
 it('produces identical direct and DTO keys through actual simulated histories',()=>{
  for(let seed=2;seed<16;seed++){const {s}=fixture(seed);
   for(let step=0;step<160&&s.phase==='TRICK_PLAYING';step++){
    expect(stateInformationKey(s)).toBe(informationKey(observe(s)));
    const forced=forcedAction(s);if(forced)apply(s,forced);else apply(s,{type:'play',card:legalCards(s)[0]});
   }
  }
 });
 it('is invariant across feasible hidden worlds in reachable unrevealed positions',()=>{
  let positions=0;
  for(let seed=2;seed<20;seed++){
   const e=setupGame(seed);
   for(let step=0;step<20&&e.getPhase()==='TRICK_PLAYING';step++){
    if(advanceForced(e))continue;
    const state=e.getPublicState(),id=state.currentTurnPlayerId!,priv=e.getPrivateState(id),legal=e.getLegalCardsForPlayer(id);
    if(!state.isTrumpRevealed&&state.completedTricks.length){
     let expected:string|undefined,choice:number|undefined;
     for(let n=0;n<8;n++){
      const world=sampleWorld(state,id,priv.myHand,CardTracker.getVoidMatrix(state),priv,seededRandom(seed*100+n));
      const s=fromObservation(state,world),o=observe(s,s.actor,false,true),key=stateInformationKey(s,o),pick=controlRollout(o,legal.map(c=>indexOf(c.id)));
      if(expected!==undefined){expect(key).toBe(expected);expect(pick).toBe(choice);}expected=key;choice=pick;
     }positions++;
    }
    e.playCard(id,legal[0].id);
   }
  }expect(positions).toBeGreaterThan(10);
 });
 it('discards a decision after a transition failure following successful simulations',()=>{
  const {e,s}=fixture(),state=e.getPublicState(),priv=e.getPrivateState(state.currentTurnPlayerId!),legal=e.getLegalCardsForPlayer(priv.myPlayerId),before=JSON.stringify(state),original=fast.apply;
  let starts=0;const onResult=vi.fn(),fallback=vi.spyOn(BotPlayer,'chooseMasterCard').mockReturnValue(legal[0]),count=v2Stats.fallbacks;
  vi.spyOn(fast,'apply').mockImplementation((world,action)=>{if(action.type==='play'&&world.actor===s.actor&&world.history.length===s.history.length&&world.plays.length===s.plays.length&&++starts===4)throw new Error('V2_TEST_TRANSITION');original(world,action);});
  expect(decideV2(state,priv,legal,{timeMs:Infinity},{iterations:8,adaptive:false,random:seededRandom(9),onResult})).toBe(legal[0]);
  expect(starts).toBe(4);expect(onResult).not.toHaveBeenCalled();expect(fallback).toHaveBeenCalledOnce();expect(v2Stats.fallbacks).toBe(count+1);expect(JSON.stringify(e.getPublicState())).toBe(before);
 });
 it('keeps legal/semantic public reveal states distinct in tree keys',()=>{
  const {s}=fixture(),a=cloneState(s),b=cloneState(s);a.revealed=b.revealed=true;a.revealer=a.actor;b.revealer=-1;
  expect(informationKey(observe(a))).not.toBe(informationKey(observe(b)));
  b.requester=(b.actor+1)%4;expect(informationKey(observe(a))).not.toBe(informationKey(observe(b)));
 });
 it('produces equivalent safe control summaries with full and lightweight observations',()=>{
  const {s}=fixture();expect(controlSummary(observe(s))).toEqual(controlSummary(observe(s,s.actor,false,true)));
 });
 for(const f of tacticalFixtures())it('control rollout: '+f.name,()=>{
  const legal=tacticalLegalCards(f).map(c=>indexOf(c.id)),choice=controlRollout(puzzle(f),legal);expect(legal).toContain(choice);expect(CARDS[choice].id).toBe(f.expected);
 });
 it('keeps original rollout available as an explicit ablation',()=>{const f=tacticalFixtures()[0],o=puzzle(f),legal=f.legal.map(c=>indexOf(c.id));expect(rolloutAction(o,legal)).toBe(indexOf(f.expected));});
});
