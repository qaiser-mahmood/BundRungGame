import {afterEach,describe,expect,it,vi} from 'vitest';
import {performance} from 'node:perf_hooks';
import {setupGame,seededRandom} from '../scripts/ai-benchmark';
import {MonteCarloPlanner as MC,SearchBudgetExceeded,searchStats,SearchDiagnostic} from '../server/ai/planning/MonteCarloPlanner';
import {SamplingError} from '../server/ai/planning/WorldSampler';
import {CardTracker} from '../server/ai/planning/CardTracker';
import {SimulationWorld} from '../server/engine/SimulationWorld';
import {BundRungEngine} from '../server/engine/BundRungEngine';
function fixture(){
  const engine=setupGame(2),state=engine.getPublicState(),actor=state.currentTurnPlayerId!,priv=engine.getPrivateState(actor);
  const cards=priv.myHand.filter(c=>priv.legalPlayableCardIds.includes(c.id)).slice(0,2);
  const world=MC.generateConsistentWorld(state,actor,priv.myHand,CardTracker.getVoidMatrix(state),priv.secretTrumpSuit,priv,seededRandom(1));
  const events:SearchDiagnostic[]=[];
  const run=()=>MC.evaluateCandidates(cards,actor,priv.myHand,state,priv.secretTrumpSuit,6,priv,{timeMs:Infinity,onDiagnostic:e=>events.push(e)});
  return {engine,state,actor,priv,cards,world,events,run};
}
afterEach(()=>vi.restoreAllMocks());
describe('atomic common-world search recovery',()=>{
  it('retains scores after an independent sampling rejection following three completed worlds',()=>{
    const f=fixture(),before={...searchStats};let samples=0;
    vi.spyOn(MC,'generateConsistentWorld').mockImplementation(()=>{if(++samples===4)throw new SamplingError('INFEASIBLE_VOIDS');return f.world;});
    const simulate=vi.spyOn(MC,'simulateRollout').mockImplementation((_s,_id,_hand,c)=>c.id===f.cards[1].id?10:0);
    expect(f.run()).toBe(f.cards[1]);expect(simulate).toHaveBeenCalledTimes(10);
    expect(searchStats.worlds-before.worlds).toBe(5);expect(searchStats.fallbacks-before.fallbacks).toBe(0);
    expect(searchStats.samplingFailures-before.samplingFailures).toBe(1);expect(searchStats.recoveredDecisions-before.recoveredDecisions).toBe(1);
    expect(f.events).toEqual([expect.objectContaining({category:'sampling',count:1,attempts:6,completedComparisons:5,scoresUsed:true})]);
  });
  it('rejects an invalid world for all candidates before evaluating any of them',()=>{
    const f=fixture(),before={...searchStats};let samples=0;
    const invalid=new SimulationWorld(f.world);invalid.set(f.actor,[]);
    vi.spyOn(MC,'generateConsistentWorld').mockImplementation(()=>++samples===4?invalid:f.world);
    const simulate=vi.spyOn(MC,'simulateRollout').mockImplementation((_s,_id,_hand,c)=>c.id===f.cards[1].id?10:0);
    expect(f.run()).toBe(f.cards[1]);expect(simulate).toHaveBeenCalledTimes(10);
    expect(searchStats.invalidWorlds-before.invalidWorlds).toBe(1);expect(searchStats.transitionFailures-before.transitionFailures).toBe(0);
    expect(f.events[0]).toMatchObject({category:'world-validation',completedComparisons:5,scoresUsed:true});
  });
  it('never uses a candidate-dependent partial world or censors transition failures by resampling',()=>{
    const f=fixture(),before={...searchStats};let calls=0;
    const generate=vi.spyOn(MC,'generateConsistentWorld').mockReturnValue(f.world);
    vi.spyOn(MC,'simulateRollout').mockImplementation((_s,_id,_hand,c)=>{
      calls++;if(calls===7)return 1e9;if(calls===8)throw new Error('ROLLOUT_NO_LEGAL_ACTION');return c.id===f.cards[1].id?10:0;
    });
    expect(f.run()).toBe(f.cards[0]);expect(generate).toHaveBeenCalledTimes(4);
    expect(searchStats.worlds-before.worlds).toBe(3);expect(searchStats.partialComparisonsDiscarded-before.partialComparisonsDiscarded).toBe(1);
    expect(searchStats.transitionFailures-before.transitionFailures).toBe(1);expect(searchStats.samplingFailures-before.samplingFailures).toBe(0);
    expect(f.events[0]).toMatchObject({category:'transition',completedComparisons:3,scoresUsed:false});
  });
  it('uses only the three completed comparisons if a deadline interrupts a later candidate',()=>{
    const f=fixture(),before={...searchStats};let calls=0;
    vi.spyOn(MC,'generateConsistentWorld').mockReturnValue(f.world);
    vi.spyOn(MC,'simulateRollout').mockImplementation((_s,_id,_hand,c)=>{
      calls++;if(calls===7)return 1e9;if(calls===8)throw new SearchBudgetExceeded();return c.id===f.cards[1].id?10:0;
    });
    expect(f.run()).toBe(f.cards[1]);expect(searchStats.deadlineStops-before.deadlineStops).toBe(1);
    expect(searchStats.partialComparisonsDiscarded-before.partialComparisonsDiscarded).toBe(1);
    expect(f.events[0]).toMatchObject({category:'budget',completedComparisons:3,scoresUsed:true});
  });
  it('classifies unexpected sampler errors separately and fails closed rather than resampling them',()=>{
    const f=fixture(),before={...searchStats};let samples=0;
    vi.spyOn(MC,'generateConsistentWorld').mockImplementation(()=>{if(++samples===4)throw new TypeError('bad RNG');return f.world;});
    vi.spyOn(MC,'simulateRollout').mockImplementation((_s,_id,_hand,c)=>c.id===f.cards[1].id?10:0);
    expect(f.run()).toBe(f.cards[0]);expect(searchStats.internalFailures-before.internalFailures).toBe(1);
    expect(searchStats.transitionFailures-before.transitionFailures).toBe(0);expect(samples).toBe(4);
    expect(f.events[0]).toMatchObject({category:'internal',reason:'SAMPLER_INTERNAL_FAILURE',completedComparisons:3,scoresUsed:false});
  });
  it('checks the deadline between engine transitions, not just complete worlds',()=>{
    const f=fixture(),copy=BundRungEngine.fromObservation(f.state,f.world);
    vi.spyOn(BundRungEngine,'fromObservation').mockReturnValue(copy);
    const play=vi.spyOn(copy,'playCard');
    vi.spyOn(performance,'now').mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(100);
    expect(()=>MC.rollout(f.state,f.actor,f.cards[0],f.world,50)).toThrow(SearchBudgetExceeded);
    expect(play).toHaveBeenCalledTimes(1);
  });
});

describe('rollout allocation and setup work',()=>{
  it('serializes only terminal public history and never shuffles unused toss state',()=>{
    const f=fixture(),serialize=vi.spyOn(BundRungEngine.prototype,'getPublicState');
    const random=vi.spyOn(Math,'random').mockImplementation(()=>{throw new Error('UNEXPECTED_ROLLOUT_RANDOMNESS');});
    let terminal;
    try {terminal=MC.rollout(f.state,f.actor,f.cards[0],f.world);} finally {random.mockRestore();}
    expect(['GAME_RESOLVED','MATCH_OVER']).toContain(terminal.phase);
    expect(serialize).toHaveBeenCalledTimes(1);
    expect(terminal.completedTricks.length).toBeGreaterThan(1);
  });
});
