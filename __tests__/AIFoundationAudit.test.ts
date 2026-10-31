import { SimulationWorld } from '../server/engine/SimulationWorld';
import { TurnLearning } from '../server/ai/neural/LiveLearningEngine';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BundRungEngine } from '../server/engine/BundRungEngine';
import { BotPlayer } from '../server/ai/BotPlayer';
import { MonteCarloPlanner as MC } from '../server/ai/planning/MonteCarloPlanner';
import { ALL_52_CARDS, CardTracker } from '../server/ai/planning/CardTracker';
import { ModelManager } from '../server/ai/neural/ModelManager';
import { NeuralNetwork } from '../server/ai/neural/NeuralNetwork';
import { StateVectorizer } from '../server/ai/neural/StateVectorizer';
import { LiveLearningEngine as Live } from '../server/ai/neural/LiveLearningEngine';
import { ReinforcementLearner } from '../server/ai/neural/ReinforcementLearner';
import { ReplayBuffer, Transition } from '../server/ai/neural/ReplayBuffer';
import { setupGame, seededRandom, withRandom } from '../scripts/ai-benchmark';
import type { Card, Suit } from '../shared/types';

const card = (id: string) => ALL_52_CARDS.find(c => c.id === id)!;
function fixture() {
  vi.spyOn(Date,'now').mockReturnValue(0);
  const engine = new BundRungEngine();
  for (let i=0;i<4;i++) engine.addPlayer(`p${i}`,`Seat ${i}`,true);
  const internal = engine as any;
  internal.phase = 'TRICK_PLAYING';
  internal.trumpMode = 'CLOSE_TRUMP';
  internal.trumpCallerPlayerId = 'p0';
  internal.trumpSuit = 'SPADES';
  internal.currentTurnPlayerIndex = 0;
  internal.resetCurrentTrick(13,'p0');
  const hands = [['H_2'],['H_3'],['H_4'],['H_A']].map(h=>h.map(card));
  hands.forEach((h,i)=>{internal.hands[`p${i}`]=h;internal.players[i].cardsInHandCount=h.length;});
  return {engine,internal,hands};
}
afterEach(()=>{vi.restoreAllMocks();BotPlayer.useNeuralPolicy=false;});

describe('AI audit: verified invariants',()=>{
  it('shares each sampled world across all candidate comparisons and does not mutate inputs',()=>{
    const {engine,internal}=fixture();
    const hands=[['H_2','S_2'],['H_3','C_3'],['H_4','C_4'],['H_A','C_5']].map(h=>h.map(card));
    hands.forEach((h,i)=>{internal.hands[`p${i}`]=[...h];internal.players[i].cardsInHandCount=2;});
    internal.resetCurrentTrick(12,'p0');
    const state=engine.getPublicState();
    const world=new SimulationWorld(hands.map((h,i)=>[`p${i}`,h]));
    const before=JSON.stringify({state,hands,world:[...world]});
    const gen=vi.spyOn(MC,'generateConsistentWorld').mockReturnValue(world);
    const sim=vi.spyOn(MC,'simulateRollout');
    MC.evaluateCandidates([card('H_2'),card('S_2')],'p0',[card('H_2'),card('S_2')],state,null,3,undefined,{timeMs:Infinity});
    expect(gen).toHaveBeenCalledTimes(3);
    expect(sim).toHaveBeenCalledTimes(6);
    expect(sim.mock.calls.every(call=>call[4]===world)).toBe(true);
    expect(JSON.stringify({state,hands,world:[...world]})).toBe(before);
  });
  it('excludes visible played and own cards, and produces exact unconstrained counts without duplicates',()=>{
    const {engine}=fixture();
    const state=engine.getPublicState();
    const own=ALL_52_CARDS.slice(0,13);
    state.players.forEach(p=>p.cardsInHandCount=13);
    const world=withRandom(seededRandom(7),()=>MC.generateConsistentWorld(state,'p0',own,new Map()));
    expect([...world.values()].map(h=>h.length)).toEqual([13,13,13,13]);
    const ids=[...world].filter(([id])=>id!=='p0').flatMap(([,cards])=>cards).map(c=>c.id);
    expect(new Set(ids).size).toBe(39);
    expect(ids.some(id=>own.some(c=>c.id===id))).toBe(false);
    state.currentTrick.cards=[{playerId:'p1',card:card('S_A'),playedAt:0}];
    expect(CardTracker.getUnseenCards(state,own).some(c=>c.id==='S_A')).toBe(false);
  });
  it('does not consult engine opponent hand storage when generating worlds',()=>{
    const engine=setupGame(2),state=engine.getPublicState(),priv=engine.getPrivateState('p0');
    const first=withRandom(seededRandom(2),()=>MC.generateConsistentWorld(state,'p0',priv.myHand,new Map(),null,priv));
    engine.getHands().p1=[card('S_A')];
    const second=withRandom(seededRandom(2),()=>MC.generateConsistentWorld(state,'p0',priv.myHand,new Map(),null,priv));
    expect(second).toEqual(first);
  });
  it('applies the initial candidate Ace downgrade without mutating cards',()=>{
    const {engine,internal}=fixture();
    const hands=[['S_A'],['S_3'],['S_2'],['S_4']].map(h=>h.map(card));
    internal.lastTrickWinnerPlayerId='p0';internal.lastTrickWinningCard=card('H_A');
    internal.team1TricksWon=6;internal.team2TricksWon=6;
    hands.forEach((h,i)=>internal.hands[`p${i}`]=[...h]);
    const score=MC.simulateRollout(engine.getPublicState(),'p0',hands[0],hands[0][0],new Map(hands.slice(1).map((h,i)=>[`p${i+1}`,h])),null);
    for(let i=0;i<4;i++)engine.playCard(`p${i}`,hands[i][0].id);
    expect(engine.getPublicState().lastGameWinningTeam).toBe('TEAM_2');expect(score).toBeLessThan(0);
    expect(card('S_A').playValue).toBe(14);
  });
  it('corrected policy never delegates failed search to an unvalidated neural action',()=>{
    const {engine}=fixture();const state=engine.getPublicState(), priv=engine.getPrivateState('p0');
    const candidates=[card('H_2'),card('S_2')];
    const get=vi.spyOn(ModelManager,'getModel').mockReturnValue(null);
    const mc=vi.spyOn(MC,'evaluateCandidates').mockReturnValue(candidates[1]);
    expect(BotPlayer.pickBestFromCandidates(candidates,state,priv,'p0',engine.getPlayers())).toBe(candidates[1]);
    mc.mockImplementation(()=>{throw new Error('planner failure');});
    expect(BotPlayer.pickBestFromCandidates(candidates,state,priv,'p0',engine.getPlayers())).toBe(candidates[0]);
    expect(get).not.toHaveBeenCalled();
  });
  it('neural legal-action selection and serialization preserve masked decisions',()=>{
    const net=new NeuralNetwork(4,4,4,3,3,52), input=new Float32Array([1,0,1,0]);
    expect([7,9]).toContain(net.selectAction(input,[7,9],0));
    const restored=NeuralNetwork.fromJSON(net.toJSON());
    expect(restored.forward(input)).toEqual(net.forward(input));
    expect(net.selectAction(input,[9],1)).toBe(9);
  });
  it('replay ring evicts oldest items and sampling is with replacement',()=>{
    const replay=new ReplayBuffer(2);
    const item=(action:number):Transition=>({state:new Float32Array(1),nextState:new Float32Array(1),action,reward:0,done:true,legalActionsNext:[]});
    replay.push(item(1));replay.push(item(2));replay.push(item(3));
    expect(replay.size()).toBe(2);
    const samples=withRandom(()=>0,()=>replay.sample(2));
    expect(samples.map(x=>x.action)).toEqual([3,3]);
  });
  it('Bellman targets honor next legal mask and do not bootstrap terminal transitions',()=>{
    const learner=new ReinforcementLearner();learner.batchSize=1;
    const target=vi.spyOn(learner.targetNetwork,'forward').mockReturnValue(Float32Array.from({length:52},(_,i)=>i===7?2:100));
    vi.spyOn(learner.onlineNetwork,'forward').mockReturnValue(new Float32Array(52));
    const train=vi.spyOn(learner.onlineNetwork,'trainStep').mockReturnValue(0);
    vi.spyOn(learner.targetNetwork,'softUpdateFrom').mockImplementation(()=>{});
    const transition:Transition={state:new Float32Array(245),nextState:new Float32Array(245),action:3,reward:1,done:false,legalActionsNext:[7]};
    learner.recordExperience(transition);learner.trainBatch();
    expect(train.mock.calls[0][1][3]).toBeCloseTo(2.9);
    expect(train.mock.calls[0][2].filter(Boolean)).toHaveLength(1);
    learner.replayBuffer=new ReplayBuffer(1);learner.recordExperience({...transition,done:true});learner.trainBatch();
    expect(train.mock.calls[1][1][3]).toBe(1);
    expect(target).toHaveBeenCalledOnce();
  });
});

// Audit IDs retained as ordinary passing correctness regressions.
describe('AI audit: repaired defects',()=>{
  it('MC-01: feasible void constraints must never be relaxed',()=>{
    const {engine}=fixture();const state=engine.getPublicState();
    const unseen=['H_2','C_2','S_2'].map(card);
    const known=ALL_52_CARDS.filter(c=>!unseen.includes(c));
    const own=[card('D_2')], played=known.filter(c=>c.id!=='D_2');
    state.completedTricks=Array.from({length:12},(_,i)=>({...state.currentTrick,trickNumber:i+1,
      cards:played.slice(i*4,i*4+4).map((c,j)=>({playerId:`p${j}`,card:c,playedAt:0}))}));
    const voids=new Map<string,Set<Suit>>([['p1',new Set(['HEARTS','CLUBS'])]]);
    const worlds=Array.from({length:20},(_,i)=>withRandom(seededRandom(i),()=>MC.generateConsistentWorld(state,'p0',own,voids)));
    expect(worlds.every(w=>!w.get('p1')!.some(c=>voids.get('p1')!.has(c.suit)))).toBe(true);
  });
  it('MC-02: a caller locked card must not be assigned to an opponent',()=>{
    const {engine,internal}=fixture();internal.trumpCard=card('S_A');
    const state=engine.getPublicState();state.players.forEach(p=>p.cardsInHandCount=13);
    const own=ALL_52_CARDS.filter(c=>c.suit==='HEARTS').slice(0,12);
    const world=withRandom(seededRandom(1),()=>MC.generateConsistentWorld(state,'p0',own,new Map(),'SPADES', {...engine.getPrivateState('p0'),myHand:own,myTrumpCard:card('S_A')}));
    expect([...world].filter(([id])=>id!=='p0').flatMap(([,cards])=>cards).some(c=>c.id==='S_A')).toBe(false);
    expect(world.get('p0')!.some(c=>c.id==='S_A')).toBe(true);
  });
  it('MC-03: final-trick winner, not majority, determines final utility sign',()=>{
    const {engine,internal,hands}=fixture();internal.team1TricksWon=10;internal.team2TricksWon=2;
    const score=MC.simulateRollout(engine.getPublicState(),'p0',hands[0],hands[0][0],new Map(hands.slice(1).map((h,i)=>[`p${i+1}`,h])),null);
    for(let i=0;i<4;i++)engine.playCard(`p${i}`,hands[i][0].id);
    expect(engine.getPublicState().lastGameWinningTeam).toBe('TEAM_2');
    expect(score).toBeLessThan(0);
  });
  it('MC-04: secret trump must not beat lead suit before reveal',()=>{
    const {engine,internal}=fixture();
    const hands=[['H_2'],['H_A'],['S_K'],['H_3']].map(h=>h.map(card));
    hands.forEach((h,i)=>internal.hands[`p${i}`]=[...h]);
    internal.team1TricksWon=6;internal.team2TricksWon=6;
    const score=MC.simulateRollout(engine.getPublicState(),'p0',hands[0],hands[0][0],new Map(hands.slice(1).map((h,i)=>[`p${i+1}`,h])),'SPADES');
    for(let i=0;i<4;i++)engine.playCard(`p${i}`,hands[i][0].id);
    expect(engine.getPublicState().lastGameWinningTeam).toBe('TEAM_2');
    expect(engine.getPublicState().isTrumpRevealed).toBe(false);
    expect(score).toBeLessThan(0);
  });
  it('MC-05: trick 1 plus another teammate winning trick 2 is not an early win',()=>{
    const {engine,internal}=fixture();internal.resetCurrentTrick(2,'p0');internal.isTrumpRevealed=true;
    internal.lastTrickWinnerPlayerId='p1';internal.lastTrickWinnerTeam='TEAM_2';internal.consecutiveTricksCount=1;
    const hands=[['H_2','C_2'],['H_3','C_3'],['H_4','C_4'],['H_A','C_5']].map(h=>h.map(card));
    hands.forEach((h,i)=>{internal.hands[`p${i}`]=[...h];internal.players[i].cardsInHandCount=2;});
    const world=new SimulationWorld(hands.map((h,i)=>[`p${i}`,h]));world.trumpSuit='SPADES';
    const clone=BundRungEngine.fromObservation(engine.getPublicState(),world);
    for(let i=0;i<4;i++){engine.playCard(`p${i}`,hands[i][0].id);clone.playCard(`p${i}`,hands[i][0].id);}
    expect(engine.getPhase()).toBe('TRICK_PLAYING');
    expect(clone.getPublicState()).toEqual(engine.getPublicState());
    expect(()=>MC.rollout(clone.getPublicState(),'p3',card('C_5'),new SimulationWorld())).toThrow();
  });
  it('MC-06: publicly revealed hands must constrain ownership in sampled worlds',()=>{
    const {engine}=fixture();const state=engine.getPublicState();
    const own=ALL_52_CARDS.slice(0,13);state.players.forEach(p=>p.cardsInHandCount=13);
    state.revealedHands={p1:[card('S_A')]};
    const worlds=Array.from({length:10},(_,i)=>withRandom(seededRandom(i),()=>MC.generateConsistentWorld(state,'p0',own,new Map())));
    expect(worlds.every(w=>w.get('p1')!.some(c=>c.id==='S_A'))).toBe(true);
  });
  it('RL-03: explicit bot learning contexts isolate actual rooms',()=>{
    const before=vi.spyOn(Live,'playCard').mockReturnValue({trickCompleted:false,trickWinner:null});
    vi.spyOn(BotPlayer,'chooseMasterCard').mockReturnValue(card('H_2'));
    for(let i=0;i<2;i++){const {engine}=fixture();BotPlayer.handleBotTurn(engine,'p0',{roomId:`room${i}`,learning:true});}
    expect(new Set(before.mock.calls.map(call=>call[1])).size).toBe(2);
  });
  it('INFO-01: opponents must not see unrevealed face-down caller identities',()=>{
    const {engine,internal}=fixture();
    internal.currentTrick.cards=[{playerId:'p0',card:card('D_5'),isFaceDown:true,playedAt:0}];
    internal.faceDownCallerCards=[{id:'D_5',card:card('D_5'),trickNumber:1,isRevealed:false}];
    const opponentView=engine.getClientGameState('p1').publicState;
    expect(JSON.stringify(opponentView)).not.toContain('D_5');
  });
  it('RL-01: fresh learner feature dimension matches vectorizer',()=>{
    expect(new ReinforcementLearner().onlineNetwork.inputSize).toBe(StateVectorizer.FEATURE_COUNT);
  });
  it('NN-01: unselected advantage outputs receive the dueling mean gradient',()=>{
    const net=new NeuralNetwork(2,2,2,2,2,52), input=new Float32Array([1,0]);
    const before=net.b_adv2[1];const target=net.forward(input);target[0]+=1;
    net.trainStep(input,target,Array.from({length:52},(_,i)=>i===0),.001);
    expect(net.b_adv2[1]).not.toBe(before);
  });
  it('NN-02: malformed model tensors must not silently retain random weights',()=>{
    expect(()=>NeuralNetwork.fromJSON({inputSize:245,w_shared1:[0]})).toThrow();
  });
  it('RL-02: live nextState differs from pre-play state and GAME_RESOLVED is terminal',()=>{
    const {engine,internal,hands}=fixture();internal.team1TricksWon=6;internal.team2TricksWon=6;
    const learning=new TurnLearning('audit');
    for(let i=0;i<4;i++)learning.play(engine,`p${i}`,hands[i][0].id);
    expect(learning.experiences).toHaveLength(4);
    expect(engine.getPhase()).toBe('GAME_RESOLVED');
    expect(learning.experiences.every(t=>t.done && t.nextState!==t.state)).toBe(true);
  });
});
