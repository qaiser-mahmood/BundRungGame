import {livePolicyFromEnvironment} from '../server/ai/LivePolicy';
import {describe,it,expect,vi,afterEach} from 'vitest';
import {performance} from 'node:perf_hooks';
import {setupGame,seededRandom} from '../scripts/ai-benchmark';
import {tacticalFixtures,card} from '../scripts/ai-tactical-fixtures';
import {OpponentBeliefs} from '../server/ai/planning/OpponentBeliefs';
import {rankPartnershipActions} from '../server/ai/planning/PartnershipStrategy';
import {advancedSearch} from '../server/ai/planning/AdvancedSearch';
import {solvePublicEndgame,endgameStats} from '../server/ai/planning/ExactEndgame';
import {MonteCarloPlanner,advanceForced} from '../server/ai/planning/MonteCarloPlanner';
import {BundRungEngine} from '../server/engine/BundRungEngine';
import {defaultPolicy} from '../server/ai/DecisionPolicy';
function fixture(){const engine=setupGame(2),state=engine.getPublicState(),priv=engine.getPrivateState(state.currentTurnPlayerId!);return {engine,state,priv,legal:engine.getLegalCardsForPlayer(priv.myPlayerId)};}
afterEach(()=>vi.restoreAllMocks());
describe('advanced observation-only policy',()=>{
  for(const f of tacticalFixtures())it(f.name,()=>expect(rankPartnershipActions(f.state,f.priv,f.legal)[0].card.id).toBe(f.expected));
  it('enables an explicit server opt-in without changing the default',()=>{expect(livePolicyFromEnvironment(undefined).name).toBe('corrected-search');expect(livePolicyFromEnvironment('advanced-search').name).toBe('advanced-search');expect(()=>livePolicyFromEnvironment('unknown')).toThrow('INVALID_BOT_DECISION_POLICY');});
  it('keeps the corrected baseline as default',()=>expect(defaultPolicy.name).toBe('corrected-search'));
  it('conditions particles on own ownership and exact hand counts',()=>{
    const f=fixture(),b=new OpponentBeliefs(f.state,f.priv);
    for(let i=0;i<8;i++){const w=b.sample(seededRandom(i));BundRungEngine.validateSimulationWorld(f.state,w);
      expect(w.get(f.priv.myPlayerId)?.map(c=>c.id).sort()).toEqual([...f.priv.myHand,...(f.priv.myTrumpCard?[f.priv.myTrumpCard]:[])].map(c=>c.id).sort());}
    expect(b.probability(f.priv.myPlayerId,c=>c.id===f.priv.myHand[0].id)).toBe(1);
    expect(b.sampleCount).toBe(8);
  });
  it('treats losing a trick as soft evidence, never a higher-card exclusion',()=>{
    const f=tacticalFixtures()[0];const b=new OpponentBeliefs(f.state,f.priv);
    expect(b.higherCardProbability('p1',card('D_K'))).toBeGreaterThan(0);
    f.state.completedTricks=[{...f.state.currentTrick,leadSuit:'HEARTS',cards:[{playerId:'p1',card:card('D_2'),playedAt:0}],trickNumber:2}];
    const updated=new OpponentBeliefs(f.state,f.priv);expect(updated.voidProbability('p1','HEARTS')).toBe(1);
  });
  it('resets beliefs between decisions, observers, games and rooms',()=>{
    const f=fixture(),a=new OpponentBeliefs(f.state,f.priv);a.sample(seededRandom(1));
    const other=fixture(),b=new OpponentBeliefs(other.state,other.priv);expect(b.sampleCount).toBe(0);expect(a.sampleCount).toBe(1);
    expect(new OpponentBeliefs({...f.state,gameIndex:99},f.priv).sampleCount).toBe(0);
  });
  it('keeps hidden trump uncertain and respects the caller secret only in their own observation',()=>{
    const f=tacticalFixtures()[7],b=new OpponentBeliefs(f.state,f.priv);expect(b.trumpProbability('SPADES')).toBe(1);
    expect(new OpponentBeliefs(f.state,{...f.priv,secretTrumpSuit:null}).trumpProbability('SPADES')).toBe(.25);
  });
  it('is reproducible with fixed work and leaves live state unchanged',()=>{
    const f=fixture(),before=JSON.stringify(f.engine.getClientGameState(f.priv.myPlayerId));
    const run=()=>advancedSearch(f.state,f.priv,f.legal,{timeMs:Infinity,random:seededRandom(19)},{worlds:1});
    expect(run().id).toBe(run().id);expect(JSON.stringify(f.engine.getClientGameState(f.priv.myPlayerId))).toBe(before);
  });
  it('only passes the simulated actor observation to continuation decisions',()=>{
    const f=fixture(),b=new OpponentBeliefs(f.state,f.priv),world=b.sample(seededRandom(6));let calls=0;
    MonteCarloPlanner.rollout(f.state,f.priv.myPlayerId,f.legal[0],world,Infinity,(s,p,legal)=>{
      calls++;expect(p.myPlayerId).toBe(s.currentTurnPlayerId);expect(legal.every(c=>p.legalPlayableCardIds.includes(c.id))).toBe(true);
      expect(Object.keys(p)).not.toContain('hands');return legal[0];
    });expect(calls).toBeGreaterThan(0);
  });
  it('falls back to a ranked legal card when the budget expires before search',()=>{
    const f=fixture(),now=performance.now();let calls=0;
    vi.spyOn(performance,'now').mockImplementation(()=>now+(calls++?100:0));
    expect(f.legal).toContain(advancedSearch(f.state,f.priv,f.legal,{timeMs:1}));
  });
  it('honors legitimate inspected ownership and replaces stale revealed beliefs',()=>{
    const f=fixture(),partner=f.state.players.find(p=>p.id!==f.priv.myPlayerId&&p.team===f.state.players.find(x=>x.id===f.priv.myPlayerId)!.team)!;
    const hand=f.engine.getPrivateState(partner.id).myHand;
    const b=new OpponentBeliefs(f.state,{...f.priv,partnerHand:hand});
    expect(b.knownHand(partner.id)).toEqual(hand);
    expect(b.probability(partner.id,c=>c.id===hand[0].id)).toBe(1);
    expect(new OpponentBeliefs(f.state,f.priv).knownHand(partner.id)).toBeNull();
  });
  it('adversarial hidden-engine changes cannot affect identical observations',()=>{
    const f=fixture(),options=()=>({timeMs:Infinity,random:seededRandom(89)});
    const expected=advancedSearch(f.state,f.priv,f.legal,options(),{worlds:1});
    const hidden=f.engine.getPrivateState(f.state.players.find(p=>p.id!==f.priv.myPlayerId)!.id);
    hidden.myHand.reverse();
    expect(advancedSearch(f.state,f.priv,f.legal,options(),{worlds:1}).id).toBe(expected.id);
  });
  it('rejects partial endgame values on node exhaustion',()=>{
    const f=fixture();f.state.players.forEach(p=>p.cardsInHandCount=1);
    // A complete public last trick is reconstructed from a real game below;
    // incomplete disclosures must abstain even with an unlimited time budget.
    expect(solvePublicEndgame(f.state,f.priv,f.legal,Infinity,0)).toBeNull();
  });
  it('does not solve private-only or sampled endgames as if public knowledge',()=>{
    const f=fixture();f.state.players.forEach(p=>p.cardsInHandCount=1);
    expect(solvePublicEndgame(f.state,f.priv,f.legal,Infinity)).toBeNull();
  });
  it('solves a real publicly shown endgame through the authoritative engine',()=>{
    let solved=false;
    for(let seed=1;seed<40&&!solved;seed++){
      const engine=setupGame(seed);
      for(let step=0;step<160&&engine.getPhase()==='TRICK_PLAYING';step++){
        if(advanceForced(engine))continue;
        const state=engine.getPublicState(),id=state.currentTurnPlayerId!,legal=engine.getLegalCardsForPlayer(id);
        if(state.currentTrick.trickNumber>=12){
          for(const p of state.players)engine.toggleShowHand(p.id);
          const shown=engine.getPublicState(),before=JSON.stringify(shown),count=endgameStats.solved;
          expect(solvePublicEndgame(shown,engine.getPrivateState(id),legal,Infinity,0)).toBeNull();
          const choice=solvePublicEndgame(shown,engine.getPrivateState(id),legal,Infinity,5000);
          if(choice){expect(legal).toContainEqual(choice);expect(endgameStats.solved).toBe(count+1);expect(JSON.stringify(engine.getPublicState())).toBe(before);solved=true;break;}
        }
        engine.playCard(id,legal[0].id);
      }
    }expect(solved).toBe(true);
  });
});
