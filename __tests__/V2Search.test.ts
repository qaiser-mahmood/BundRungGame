import {afterEach,describe,expect,it,vi} from 'vitest';
import {setupGame,seededRandom} from '../scripts/ai-benchmark';
import {ismcts,selectAction,Node} from '../server/ai/v2/search/ISMCTS';
import {decideV2,v2Stats} from '../server/ai/v2/strategy/DecisionController';
import {BeliefState} from '../server/ai/v2/beliefs/BeliefState';
import {ParticleSampler} from '../server/ai/v2/beliefs/ParticleSampler';
import {effectiveSampleSize,normalizedWeights} from '../server/ai/v2/beliefs/OpponentLikelihood';
import {fromObservation} from '../server/ai/v2/simulation/adapters';
import {observe,informationKey} from '../server/ai/v2/simulation/observation';
import {apply} from '../server/ai/v2/simulation/FastSimulator';
import {oracleWorld} from '../scripts/v2-parity';
import {BotPlayer} from '../server/ai/BotPlayer';
import {CARDS,indexOf} from '../server/ai/v2/simulation/CompactState';
import {defaultPolicy} from '../server/ai/DecisionPolicy';
import {performance} from 'node:perf_hooks';
function fixture(){const engine=setupGame(2),state=engine.getPublicState(),priv=engine.getPrivateState(state.currentTurnPlayerId!);return {engine,state,priv,cards:engine.getLegalCardsForPlayer(priv.myPlayerId)};}
afterEach(()=>vi.restoreAllMocks());
describe('AI v2 information-set search and control',()=>{
 it('reproduces fixed-work root statistics with a local seed and does not mutate live observations',()=>{
  const f=fixture(),before=JSON.stringify(f.engine.getClientGameState(f.priv.myPlayerId)),globalRandom=Math.random;
  const run=()=>ismcts(f.state,f.priv,f.cards,{iterations:16,particles:8,timeMs:Infinity,random:seededRandom(4)});
  const a=run(),b=run();expect(a.completed).toBe(16);expect(a.root).toEqual(b.root);expect(a.card).toEqual(b.card);expect(a.nodes).toBeLessThanOrEqual(512);
  expect(JSON.stringify(f.engine.getClientGameState(f.priv.myPlayerId))).toBe(before);expect(Math.random).toBe(globalRandom);
 });
 it('changing real hidden holdings changes neither actor observation nor seeded choice',()=>{
  const f=fixture(),run=()=>ismcts(f.engine.getPublicState(),f.engine.getPrivateState(f.priv.myPlayerId),f.cards,{iterations:16,timeMs:Infinity,random:seededRandom(8)});
  const first=run(),world=oracleWorld(f.engine),o=observe(fromObservation(f.state,world));
  const opponents=f.state.players.filter(p=>p.id!==f.priv.myPlayerId),hands=f.engine.getHands();[hands[opponents[0].id][0],hands[opponents[1].id][0]]=[hands[opponents[1].id][0],hands[opponents[0].id][0]];
  const second=run(),other=observe(fromObservation(f.engine.getPublicState(),oracleWorld(f.engine)));
  expect(informationKey(o)).toBe(informationKey(other));expect(second.root).toEqual(first.root);expect(second.card).toEqual(first.card);
 });
 it('keeps availability selection restricted to the legal set in each world',()=>{
  const node:Node={visits:20,edges:new Map([[1,{visits:10,available:10,sum:1}],[2,{visits:10,available:20,sum:1}]])};
  expect(selectAction(node,[2],()=>0,1)).toBe(2);expect(selectAction(node,[1,2],()=>0,1)).toBe(2);expect(selectAction(node,[3],()=>0,1)).toBe(3);
 });
 it('does not commit partial simulation statistics on deadline interruption',()=>{
  const f=fixture();let count=0;const now=performance.now();vi.spyOn(performance,'now').mockImplementation(()=>now+(++count>10?100:0));
  const result=ismcts(f.state,f.priv,f.cards,{iterations:16,particles:1,timeMs:1,random:seededRandom(2)});
  expect(result.completed).toBe(0);expect(result.root.every(x=>x.visits===0&&x.available===0)).toBe(true);expect(result.fallback).toBe(true);
 });
 it('uses authoritative corrected-search on internal errors rather than censoring failed worlds',()=>{
  const f=fixture(),before=v2Stats.fallbacks,spy=vi.spyOn(BotPlayer,'chooseMasterCard').mockReturnValue(f.cards[0]);
  expect(decideV2(f.state,f.priv,f.cards,{timeMs:10},{particles:0})).toEqual(f.cards[0]);expect(spy.mock.calls[0][6]?.name).toBe('corrected-search');expect(v2Stats.fallbacks).toBe(before+1);
 });
 it('routes only publicly determined endgames to exact team minimax',()=>{
  const f=fixture(),s=f.state,c=(id:string)=>CARDS[indexOf(id)];
  Object.assign(s,{currentTurnPlayerId:'p0',activePlayerIndex:0,isTrumpRevealed:true,trumpSuit:'SPADES',trumpCallerPlayerId:'p0',trumpCardPlaced:false,revealedTrumpCard:null,
   faceDownCallerCards:[],faceDownLeadPending:false,isRungRevealPaused:false,isTrumpRevealPending:false,trumpRevealRequesterId:null,completedTricks:[],previousTrickCards:null,lastTrickWinningCard:null,streakCount:0,streakWinnerPlayerId:null});
  s.currentTrick={trickNumber:12,leadPlayerId:'p0',leadSuit:null,cards:[],winnerPlayerId:null,winningTeam:null};
  s.revealedHands={p0:[c('H_A'),c('H_2')],p1:[c('H_K'),c('H_3')],p2:[c('H_4'),c('H_5')],p3:[c('H_6'),c('H_7')]};s.players.forEach(p=>p.cardsInHandCount=2);
  const p={...f.priv,myPlayerId:'p0',myHand:s.revealedHands.p0,myTrumpCard:null},before=v2Stats.exact;
  expect(decideV2(s,p,p.myHand,{timeMs:Infinity}).id).toBe('H_2');expect(v2Stats.exact).toBe(before+1);
 });
 it('enforces node and iteration caps independently of time',()=>{
  const f=fixture(),r=ismcts(f.state,f.priv,f.cards,{iterations:8,nodeLimit:1,timeMs:Infinity,random:seededRandom(1)});expect(r.nodes).toBe(1);expect(r.completed).toBe(8);
 });
 it('does not share particle pools across rooms or observers',()=>{
  const f=fixture(),a=new ParticleSampler(new BeliefState(f.state,f.priv),seededRandom(1),false,8),b=new ParticleSampler(new BeliefState(f.state,f.priv),seededRandom(1),false,8);
  expect(a.diagnostics).not.toBe(b.diagnostics);expect(a.sample()).not.toBe(b.sample());
 });
 it('normalizes log weights stably, reports ESS and keeps hard constraints in weighted samples',()=>{
  const w=normalizedWeights([-10000,-10001]);expect(w.reduce((a,b)=>a+b)).toBeCloseTo(1);expect(effectiveSampleSize(w)).toBeGreaterThan(1);
  const f=fixture(),pool=new ParticleSampler(new BeliefState(f.state,f.priv),seededRandom(5),true,16);expect(pool.diagnostics.ess).toBeGreaterThan(0);
  for(let i=0;i<16;i++){const s=fromObservation(f.state,pool.sample());expect(s.hands.reduce((n,h)=>n+h.length,0)+Number(s.locked>=0)).toBe(52);}
 });
 it('retains the production default and rejects illegal compact plays',()=>{
  expect(defaultPolicy.name).toBe('corrected-search');const f=fixture(),s=fromObservation(f.state,oracleWorld(f.engine));expect(()=>apply(s,{type:'play',card:255})).toThrow('V2_ILLEGAL_CARD');
 });
});
