import {describe,it,expect,vi,afterEach} from 'vitest';
import {setupGame,seededRandom,withRandom} from '../scripts/ai-benchmark';
import {BundRungEngine} from '../server/engine/BundRungEngine';
import {SimulationWorld} from '../server/engine/SimulationWorld';
import {sampleWorld} from '../server/ai/planning/WorldSampler';
import {CardTracker} from '../server/ai/planning/CardTracker';
import {advanceForced,MonteCarloPlanner,terminalUtility} from '../server/ai/planning/MonteCarloPlanner';

// Test referee has access to complete worlds; no production policy receives this helper.
function oracle(engine:BundRungEngine):SimulationWorld {
  const state=engine.getPublicState(),world=new SimulationWorld();
  for(const p of state.players){const priv=engine.getPrivateState(p.id);world.set(p.id,[...priv.myHand,...(priv.myTrumpCard?[priv.myTrumpCard]:[])]);
    for(const [key,card] of Object.entries(priv.knownConcealedCards??{}))world.concealed.set(key,card);
    if(p.id===state.trumpCallerPlayerId){world.lockedTrump=priv.myTrumpCard;world.trumpSuit=priv.secretTrumpSuit;}
    if(priv.teammateFaceDownCard)world.concealed.set(`${state.currentTrick.trickNumber}:${state.faceDownLeadPlayerId}`,priv.teammateFaceDownCard);
  }
  return world;
}
afterEach(()=>vi.restoreAllMocks());
describe('engine-based simulator parity and sampled-world invariants',()=>{
  it('matches every legal, reveal and terminal transition through complete seeded games',()=>{
    vi.spyOn(Date,'now').mockReturnValue(0);
    let tricks=0,reveals=0,concealed=0,terminal=0;
    for(let seed=1;seed<=12;seed++){
      const engine=setupGame(seed);
      for(let step=0;step<160;step++){
        const state=engine.getPublicState();
        if(state.phase==='GAME_RESOLVED'||state.phase==='MATCH_OVER'){terminal++;break;}
        const world=oracle(engine),copy=BundRungEngine.fromObservation(state,world);
        expect(copy.getPublicState()).toEqual(state);
        if(state.currentTrick.cards.some(c=>!c.card))concealed++;
        const forced=advanceForced(engine),otherForced=advanceForced(copy);expect(otherForced).toBe(forced);
        if(forced)reveals++;
        else{
          const id=state.currentTurnPlayerId!,legal=engine.getLegalCardsForPlayer(id);
          expect(copy.getLegalCardsForPlayer(id)).toEqual(legal);
          const chosen=[...legal].sort((a,b)=>a.playValue-b.playValue||a.id.localeCompare(b.id))[0];
          const before=state.completedTricks.length;
          engine.playCard(id,chosen.id);copy.playCard(id,chosen.id);
          if(engine.getPublicState().completedTricks.length>before)tricks++;
        }
        expect(copy.getPublicState()).toEqual(engine.getPublicState());
      }
    }
    expect(terminal).toBe(12);expect(tricks).toBeGreaterThan(30);expect(reveals).toBeGreaterThan(0);expect(concealed).toBeGreaterThan(0);
  });
  it('samples exact unique worlds over seeded midgame observations without relaxing constraints',()=>{
    let observations=0;
    for(let seed=2;seed<12;seed++){
      const engine=setupGame(seed);
      for(let step=0;step<80&&engine.getPhase()==='TRICK_PLAYING';step++){
        if(advanceForced(engine))continue;
        const state=engine.getPublicState(),actor=state.currentTurnPlayerId!,priv=engine.getPrivateState(actor),voids=CardTracker.getVoidMatrix(state);
        const a=sampleWorld(state,actor,priv.myHand,voids,priv,seededRandom(step));
        const b=sampleWorld(state,actor,priv.myHand,voids,priv,seededRandom(step));expect(a).toEqual(b);
        const ids=[...a.values()].flat().map(c=>c.id);
        for(const t of [...state.completedTricks,state.currentTrick])for(const pc of t.cards)ids.push((pc.card??a.concealed.get(`${t.trickNumber}:${pc.playerId}`))!.id);
        expect(ids).toHaveLength(52);expect(new Set(ids).size).toBe(52);
        for(const p of state.players){expect(a.get(p.id)).toHaveLength(p.cardsInHandCount);expect(a.get(p.id)!.some(c=>voids.get(p.id)?.has(c.suit))).toBe(false);}
        expect(()=>BundRungEngine.fromObservation(state,a)).not.toThrow();
        const card=engine.getLegalCardsForPlayer(actor)[0];engine.playCard(actor,card.id);observations++;
      }
    }
    expect(observations).toBeGreaterThan(100);
  });
  it.each([true,false])('matches explicit challenge accept/surrender=%s and keeps its concealed slot consistent',(accept)=>{
    const engine=setupGame(1),initial=engine.getPublicState(),caller=initial.trumpCallerPlayerId!;
    engine.declareBwinjiLead(caller,engine.getPrivateState(caller).myHand[0].id,true);
    const state=engine.getPublicState(),defenders=state.players.filter(p=>p.team!==state.players.find(p=>p.id===caller)!.team);
    const priv=engine.getPrivateState(defenders[0].id);
    const sampled=sampleWorld(state,defenders[0].id,priv.myHand,CardTracker.getVoidMatrix(state),priv,seededRandom(1));
    expect(()=>BundRungEngine.fromObservation(state,sampled)).not.toThrow();
    const copy=BundRungEngine.fromObservation(state,oracle(engine));
    for(const p of defenders){engine.respondToFaceDownRung(p.id,accept);copy.respondToFaceDownRung(p.id,accept);}
    expect(copy.getPublicState()).toEqual(engine.getPublicState());
    expect(engine.getPublicState().currentTrick.cards[0].card===null).toBe(!accept);
  });
  it('rejects contradictory worlds and emits an explicit legal fallback reason',()=>{
    const engine=setupGame(2),state=engine.getPublicState(),actor=state.currentTurnPlayerId!,priv=engine.getPrivateState(actor);
    const impossible=new Map(state.players.map(p=>[p.id,new Set(['HEARTS','DIAMONDS','CLUBS','SPADES'] as const)]));
    expect(()=>sampleWorld(state,actor,priv.myHand,impossible,priv)).toThrow();
    const diagnostic=vi.fn();
    const broken={...state,players:state.players.map(p=>({...p,cardsInHandCount:0}))};
    const cards=priv.myHand.slice(0,2);
    expect(MonteCarloPlanner.evaluateCandidates(cards,actor,priv.myHand,broken,null,1,priv,{diagnostic})).toBe(cards[0]);
    expect(diagnostic).toHaveBeenCalledOnce();
    expect(()=>terminalUtility(state,actor)).toThrow('ROLLOUT_INCOMPLETE');
  });
});

describe('targeted authoritative endgame/scoring parity',()=>{
  it('downgrades future consecutive Ace leads and awards trick 13 despite the other team majority',()=>{
    const engine=new BundRungEngine();for(let i=0;i<4;i++)engine.addPlayer(`p${i}`,`P${i}`);
    const cards=CardTracker.getUnseenCards(engine.getPublicState(),[]);
    const c=(id:string)=>cards.find(c=>c.id===id)!;
    type Fixture={phase:'TRICK_PLAYING';trumpMode:'CLOSE_TRUMP';trumpSuit:'SPADES';isTrumpRevealed:boolean;trumpCallerPlayerId:string;
      currentTurnPlayerIndex:number;currentTrick:import('../shared/types').Trick;hands:Record<string,import('../shared/types').Card[]>;team1TricksWon:number;team2TricksWon:number;};
    const fixture=engine as unknown as Fixture;
    Object.assign(fixture,{phase:'TRICK_PLAYING',trumpMode:'CLOSE_TRUMP',trumpSuit:'SPADES',isTrumpRevealed:true,trumpCallerPlayerId:'p0',currentTurnPlayerIndex:0,
      currentTrick:{trickNumber:12,leadPlayerId:'p0',leadSuit:null,cards:[],winnerPlayerId:null,winningTeam:null},team1TricksWon:6,team2TricksWon:5,
      hands:{p0:[c('H_A'),c('S_A')],p1:[c('H_2'),c('S_3')],p2:[c('H_3'),c('S_2')],p3:[c('H_4'),c('S_4')]}});
    for(const p of engine.getPlayers())p.cardsInHandCount=2;
    const world=oracle(engine),result=MonteCarloPlanner.rollout(engine.getPublicState(),'p0',c('H_A'),world);
    expect(result.lastGameWinningTeam).toBe('TEAM_2');expect(result.team1TricksWon).toBe(7);expect(result.team2TricksWon).toBe(6);
    expect(result.completedTricks.at(-1)?.cards.find(p=>p.playerId==='p0')?.isAceDowngraded).toBe(true);
    expect(terminalUtility(result,'p0')).toBeLessThan(0);
  });
  it.each([
    ['CLOSE_TRUMP','STANDARD'],['OPEN_TRUMP','FACE_UP'],['OPEN_TRUMP','FACE_DOWN_PLAY'],
    ['OPEN_TRUMP','FACE_DOWN_NO_PLAY'],['BWINJI','FACE_UP'],['BWINJI','FACE_DOWN_PLAY'],['BWINJI','FACE_DOWN_NO_PLAY'],
  ] as const)('matches %s/%s scoring and KHOTI at final trick',(mode,modifier)=>{
    const engine=setupGame(2),state=engine.getPublicState(),world=oracle(engine);
    const copy=BundRungEngine.fromObservation(state,world);
    // Scoring matrix exercised through both engine instances. No-play is a
    // forced challenge resolution, so use resolveGame rather than fabricate play.
    const configure=(e:BundRungEngine)=>{
      const f=e as unknown as {trumpMode:typeof mode;openTrumpModifier:string|null;bwinjiModifier:string|null;scoringEngine:import('../server/engine/ScoringEngine').ScoringEngine};
      f.trumpMode=mode;f.openTrumpModifier=mode==='OPEN_TRUMP'?modifier:null;f.bwinjiModifier=mode==='BWINJI'?modifier:null;
    };
    configure(engine);configure(copy);engine.resolveGame('TEAM_2');copy.resolveGame('TEAM_2');
    expect(copy.getPublicState().scorecard).toEqual(engine.getPublicState().scorecard);
    expect(copy.getPublicState().phase).toBe(engine.getPublicState().phase);
    expect(copy.getPublicState().matchWinnerTeam).toBe(engine.getPublicState().matchWinnerTeam);
    expect(terminalUtility(copy.getPublicState(),'p0')).toBe(terminalUtility(engine.getPublicState(),'p0'));
  });
});

describe('individual streak reconstruction',()=>{
  it('terminates on the same opponent player winning tricks 2 and 3',()=>{
    const engine=new BundRungEngine();for(let i=0;i<4;i++)engine.addPlayer(`p${i}`,`P${i}`);
    const cards=CardTracker.getUnseenCards(engine.getPublicState(),[]),c=(id:string)=>cards.find(c=>c.id===id)!;
    const fixture=engine as unknown as {phase:string;trumpMode:string;trumpSuit:string;isTrumpRevealed:boolean;trumpCallerPlayerId:string;
      currentTurnPlayerIndex:number;currentTrick:import('../shared/types').Trick;hands:Record<string,import('../shared/types').Card[]>;
      playerConsecutiveTricksCount:number;playerConsecutiveTricksWinnerId:string;};
    Object.assign(fixture,{phase:'TRICK_PLAYING',trumpMode:'CLOSE_TRUMP',trumpSuit:'SPADES',isTrumpRevealed:true,
      trumpCallerPlayerId:'p0',currentTurnPlayerIndex:1,playerConsecutiveTricksCount:1,playerConsecutiveTricksWinnerId:'p1',
      currentTrick:{trickNumber:3,leadPlayerId:'p1',leadSuit:null,cards:[],winnerPlayerId:null,winningTeam:null},
      hands:{p0:[c('H_4'),c('D_4')],p1:[c('H_A'),c('D_A')],p2:[c('H_2'),c('D_2')],p3:[c('H_3'),c('D_3')]}});
    for(const p of engine.getPlayers())p.cardsInHandCount=2;
    const result=MonteCarloPlanner.rollout(engine.getPublicState(),'p1',c('H_A'),oracle(engine));
    for(const [id,card] of [['p1','H_A'],['p2','H_2'],['p3','H_3'],['p0','H_4']])engine.playCard(id,card);
    expect(result.phase).toBe('GAME_RESOLVED');expect(result.lastGameWinningTeam).toBe('TEAM_2');
    expect(result.scorecard).toEqual(engine.getPublicState().scorecard);expect(result.completedTricks).toHaveLength(1);
  });
});
