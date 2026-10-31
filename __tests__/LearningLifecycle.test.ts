import {BotPlayer} from '../server/ai/BotPlayer';
import {describe,it,expect,vi} from 'vitest';
import {setupGame} from '../scripts/ai-benchmark';
import {TurnLearning} from '../server/ai/neural/LiveLearningEngine';
import {advanceForced} from '../server/ai/planning/MonteCarloPlanner';
import {BundRungEngine} from '../server/engine/BundRungEngine';
function step(engine:BundRungEngine,learning:TurnLearning){
  if(advanceForced(engine)){learning.observe(engine);return;}
  const s=engine.getPublicState(),id=s.currentTurnPlayerId!;
  const priv=engine.getPrivateState(id);learning.play(engine,id,priv.legalPlayableCardIds[0]);
}
describe('room and episode learning isolation',()=>{
  it('closes at next legal decision, not between turns; rejects bad actions without recording',()=>{
    const engine=setupGame(2),learning=new TurnLearning('a');
    const s=engine.getPublicState(),id=s.currentTurnPlayerId!,priv=engine.getPrivateState(id);
    learning.play(engine,id,priv.legalPlayableCardIds[0]);
    expect(learning.experiences).toHaveLength(0);
    expect(()=>learning.play(engine,id,'invalid')).toThrow();
    expect(learning.experiences).toHaveLength(0);
    for(let i=0;i<100&&!learning.experiences.length;i++)step(engine,learning);
    expect(learning.experiences.length).toBeGreaterThan(0);
    for(const t of learning.experiences){expect(t.nextState).not.toBe(t.state);if(!t.done)expect(t.legalActionsNext.length).toBeGreaterThan(0);}
  });
  it('interleaves rooms without mixing histories and terminates every pending action at hand end',()=>{
    const a=setupGame(2),b=setupGame(3),la=new TurnLearning('a'),lb=new TurnLearning('b');
    for(let i=0;i<300;i++){
      for(const [engine,learning] of [[a,la],[b,lb]] as const){
        if(engine.getPhase()==='TRICK_PLAYING')step(engine,learning);
      }
      if(a.getPhase()!=='TRICK_PLAYING'&&b.getPhase()!=='TRICK_PLAYING')break;
    }
    for(const [engine,learning,id] of [[a,la,'a'],[b,lb,'b']] as const){
      expect(['GAME_RESOLVED','MATCH_OVER']).toContain(engine.getPhase());
      expect(learning.experiences.every(t=>t.roomId===id)).toBe(true);
      expect(learning.experiences.filter(t=>t.done)).toHaveLength(4);
      const before=learning.experiences.length;learning.observe(engine);expect(learning.experiences.length).toBe(before);
    }
  });
  it('resets boundaries between consecutive hands on the same engine',()=>{
    const engine=setupGame(2),learning=new TurnLearning('same-room');
    for(let i=0;i<300&&engine.getPhase()==='TRICK_PLAYING';i++)step(engine,learning);
    expect(engine.getPhase()).toBe('GAME_RESOLVED');
    const firstIds=new Set(learning.experiences.map(t=>t.episodeId)),before=learning.experiences.length;
    const state=engine.getPublicState();engine.dealerDistributeNextGame(state.players[state.dealerPlayerIndex].id);
    learning.observe(engine);
    for(let i=0;i<100&&engine.getPhase()!=='TRICK_PLAYING';i++)for(const p of engine.getPlayers()){
      if(engine.getPhase()==='TRICK_PLAYING')break;
      BotPlayer.handleBotTurn(engine,p.id,{roomId:'same-room',policy:{name:'heuristic'}});
    }
    for(let i=0;i<300&&engine.getPhase()==='TRICK_PLAYING';i++)step(engine,learning);
    const next=learning.experiences.slice(before);
    expect(next.length).toBeGreaterThan(0);expect(next.every(t=>!firstIds.has(t.episodeId))).toBe(true);
    expect(next.filter(t=>t.done)).toHaveLength(4);
  });
  it('discards pending experience on departure/replacement and separates subsequent episodes',()=>{
    const engine=setupGame(2),learning=new TurnLearning('room');
    step(engine,learning);learning.reset();
    const next=setupGame(4);
    for(let i=0;i<300&&next.getPhase()==='TRICK_PLAYING';i++)step(next,learning);
    expect(learning.experiences.length).toBeGreaterThan(0);
    const episodes=new Set(learning.experiences.map(t=>t.episodeId));expect(episodes.size).toBe(1);
    expect(learning.experiences.filter(t=>t.done)).toHaveLength(4);
  });
});
