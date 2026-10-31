import {selectCandidate} from '../server/ai/DecisionPolicy';
import {LegacyMonteCarloPlanner} from '../server/ai/planning/LegacyMonteCarloPlanner';
import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { BotPlayer } from '../server/ai/BotPlayer';
import { ModelManager } from '../server/ai/neural/ModelManager';
import { runGame, runTournament, setupGame, seededRandom, withRandom } from '../scripts/ai-benchmark';

const withoutTiming = (r: ReturnType<typeof runGame>) => ({...r,revealActions:r.revealActions.map(({milliseconds,...a})=>a),decisions:r.decisions.map(({milliseconds,...d})=>d)});
describe('seeded AI benchmark',()=>{
  it('replays games exactly apart from wall-clock timing and restores globals',()=>{
    const random=Math.random, pick=BotPlayer.pickBestFromCandidates, neural=BotPlayer.useNeuralPolicy;
    const a=runGame(19,'TEAM_1','production');
    const b=runGame(19,'TEAM_1','production');
    expect(withoutTiming(a)).toEqual(withoutTiming(b));
    expect(a.winner).not.toBeNull();expect(a.error).toBeNull();expect(a.invalidMoves).toBe(0);
    expect(Math.random).toBe(random);expect(BotPlayer.pickBestFromCandidates).toBe(pick);expect(BotPlayer.useNeuralPolicy).toBe(neural);
  });
  it('replays advanced-search with fixed work independently of previous games',()=>{
    const options={iterations:16,timeMs:Infinity};
    const a=runGame(27,'TEAM_1','advanced-search','corrected-search',options,{worlds:1});
    const b=runGame(27,'TEAM_1','advanced-search','corrected-search',options,{worlds:1});
    expect(a.error).toBeNull();expect(a.winner).not.toBeNull();expect(a.invalidMoves).toBe(0);
    expect(withoutTiming(a)).toEqual(withoutTiming(b));
  });
  it('swaps candidate teams on identical setup and gives symmetric self-play results',()=>{
    const result=runTournament(1,2,'heuristic');
    expect(result.summary.completed).toBe(4);expect(result.summary.aborted).toBe(0);
    expect(result.summary.invalidMoves).toBe(0);expect(result.summary.candidateWins).toBe(2);
    expect(result.summary.signedScoreAdjustment).toBe(0);
    for(let i=0;i<result.results.length;i+=2){
      const [a,b]=result.results.slice(i,i+2);
      expect(a.dealHash).toBe(b.dealHash);expect(a.winner).toBe(b.winner);
      expect(a.signedScoreAdjustment).toBe(-b.signedScoreAdjustment!);
    }
  });
  it('passes the same available hand as handleBotTurn, excluding locked trump',()=>{
    const choose=BotPlayer.chooseMasterCard;
    let lockedObservations=0;
    const spy=vi.spyOn(BotPlayer,'chooseMasterCard').mockImplementation((...args)=>{
      const [, , , hand, , priv]=args;
      const expected=priv.myTrumpCard && priv.isMyTrumpCardPlayable ? [...priv.myHand,priv.myTrumpCard] : priv.myHand;
      expect(hand).toEqual(expected);
      if(priv.myTrumpCard && !priv.isMyTrumpCardPlayable)lockedObservations++;
      return choose(...args);
    });
    try {
      const result=runGame(2,'TEAM_1','production');
      expect(result.error).toBeNull();expect(lockedObservations).toBeGreaterThan(0);
    } finally {spy.mockRestore();}
  });
  it('does not confuse pre-reveal caller discards with a void in the locked trump slot (seed 65)',()=>{
    const result=runGame(65,'TEAM_2','corrected-search');
    expect(result.error).toBeNull();expect(result.search.samplingFailures).toBe(0);expect(result.search.fallbacks).toBe(0);
  });
  it('rejects unbounded legacy budgets before entering the preserved planner',()=>{
    const engine=setupGame(2),state=engine.getPublicState(),id=state.currentTurnPlayerId!,priv=engine.getPrivateState(id),cards=priv.myHand.slice(0,2);
    const planner=vi.spyOn(LegacyMonteCarloPlanner,'evaluateCandidates').mockReturnValue(cards[1]);
    try {
      expect(selectCandidate(cards,state,priv,id,state.players,{name:'production-legacy',search:{legacyIterations:Infinity}})).toBe(cards[0]);
      expect(planner).not.toHaveBeenCalled();
    }finally{planner.mockRestore();}
  });
  it('restores adapters when a policy throws',()=>{
    const random=Math.random,pick=BotPlayer.pickBestFromCandidates;
    expect(()=>withRandom(seededRandom(1),()=>{throw new Error('test');})).toThrow('test');
    expect(Math.random).toBe(random);expect(BotPlayer.pickBestFromCandidates).toBe(pick);
  });
  it('runs a direct neural policy without saving or changing the trained model',()=>{
    const hash=()=>createHash('sha256').update(readFileSync('server/ai/models/bund_rung_brain.json')).digest('hex');
    const before=hash();const save=vi.spyOn(ModelManager,'saveModel');
    try {
      const r=runGame(1,'TEAM_1','neural');
      expect(r.error).toBeNull();expect(r.winner).not.toBeNull();expect(r.invalidMoves).toBe(0);
      expect(r.decisions.some(d=>d.policy==='neural')).toBe(true);
      expect(save).not.toHaveBeenCalled();expect(hash()).toBe(before);
    } finally {save.mockRestore();}
  });
});
