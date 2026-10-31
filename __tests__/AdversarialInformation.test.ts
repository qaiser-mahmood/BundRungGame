import {describe,it,expect,vi,afterEach} from 'vitest';
import {BundRungEngine} from '../server/engine/BundRungEngine';
import {ALL_52_CARDS} from '../server/ai/planning/CardTracker';
import type {Card,Trick,FaceDownCallerCard} from '../shared/types';
const card=(id:string)=>ALL_52_CARDS.find(c=>c.id===id)!;
function adversarial(played:Card,locked:Card){
  const engine=new BundRungEngine();for(let i=0;i<4;i++)engine.addPlayer(`p${i}`,`P${i}`);
  // Deliberately echo concealed cards into secondary fields. The boundary must
  // fail closed even if an upstream producer accidentally retains such aliases.
  const source=engine as unknown as {phase:string;trumpMode:string;trumpCallerPlayerId:string;trumpSuit:string;trumpCard:Card;
    currentTrick:Trick;hands:Record<string,Card[]>;faceDownCallerCards:FaceDownCallerCard[];shownHandPlayerIds:Set<string>;
    lastTrickWinningCard:Card;resolveTrick:()=>unknown;tossEngine:{playerDrawHistory:Record<string,Card[]>}};
  source.phase='TRICK_PLAYING';source.trumpMode='CLOSE_TRUMP';source.trumpCallerPlayerId='p0';source.trumpSuit=locked.suit;source.trumpCard=locked;
  source.currentTrick={trickNumber:1,leadPlayerId:'p0',leadSuit:'DIAMONDS',winnerPlayerId:null,winningTeam:null,
    cards:[played,card('D_2'),card('D_3'),card('D_4')].map((c,i)=>({playerId:`p${i}`,card:{...c},playedAt:0,isFaceDown:i===0,isAceDowngraded:false}))};
  source.faceDownCallerCards=[{id:played.id,card:played,trickNumber:1,isRevealed:false}];
  Object.assign(source.currentTrick,{debugHiddenCard:played});
  Object.assign(source.currentTrick.cards[0],{debugHiddenCard:played});
  Object.assign(source.currentTrick.cards[0].card,{privateDebugCard:locked});
  Object.assign(source.faceDownCallerCards[0],{canonicalCardId:played.id});
  Object.assign(engine.getPlayers()[0],{privateDebugCard:locked});
  source.hands.p0=[card('H_2'),played,locked];source.hands.p1=[card('C_2')];source.shownHandPlayerIds=new Set(['p0']);
  // Toss uses a different deck: known toss cards must not be filtered depending
  // on what the hidden current deal happens to contain (that would be a side channel).
  source.tossEngine.playerDrawHistory={p2:[card('D_5')]};
  source.resolveTrick();Object.assign(source.currentTrick,{debugHiddenCard:played});return {engine,source};
}
afterEach(()=>vi.restoreAllMocks());
describe('all-field hidden-information noninterference',()=>{
  it('swapping concealed identities changes no unauthorized public or private payload field',()=>{
    const a=adversarial(card('D_5'),card('S_K')),b=adversarial(card('D_9'),card('S_Q'));
    for(const viewer of ['p1','p2','p3','']){
      const first=a.engine.getClientGameState(viewer),second=b.engine.getClientGameState(viewer);
      expect(first).toEqual(second);
      const state=first.publicState;
      expect(state.lastTrickWinningCard).toBeNull();expect(state.previousTrickCards![0].card).toBeNull();
      expect(state.completedTricks[0].cards[0].card).toBeNull();expect(state.faceDownCallerCards[0].card).toBeNull();
      expect(state.revealedHands.p0.map(c=>c.id)).toEqual(['H_2']);expect(state.statusMessage).toContain('concealed card');
      expect(state.tossDraws.p2.id).toBe('D_5');expect(state.tossDrawHistory.p2[0].id).toBe('D_5');
      expect(state.revealedTrumpCard).toBeNull();expect(state.trumpSuit).toBeNull();
    }
    expect(a.engine.getPrivateState('p0').myTrumpCard?.id).toBe('S_K');
    expect(a.engine.getPrivateState('p0').knownConcealedCards?.['1:p0']?.id).toBe('D_5');
  });
  it('discloses historical and winning metadata only after a legitimate explicit reveal',()=>{
    const {engine}=adversarial(card('D_5'),card('S_K'));
    engine.playCard('p0','H_2');expect(engine.getPrivateState('p1').canRequestRungReveal).toBe(true);
    engine.requestTrumpReveal('p1');engine.showTrumpCard('p0');
    const state=engine.getPublicState();expect(state.completedTricks[0].cards[0].card?.id).toBe('D_5');
    expect(state.lastTrickWinningCard?.id).toBe('D_5');expect(state.revealedTrumpCard?.id).toBe('S_K');
    expect(JSON.stringify(state)).not.toContain('privateDebug');
  });
  it('does not expose mutable nested scorecard entries through observations',()=>{
    const engine=new BundRungEngine();for(let i=0;i<4;i++)engine.addPlayer(`p${i}`,`P${i}`);
    engine.resolveGame('TEAM_1');
    const internal=engine as unknown as {scoringEngine:{state:{history:object[]}}};
    Object.assign(internal.scoringEngine.state.history[0],{privateDebugCard:card('S_A')});
    const state=engine.getPublicState();expect(JSON.stringify(state.scorecard)).not.toContain('privateDebug');state.scorecard.history[0].notes='injected-private-data';
    expect(engine.getPublicState().scorecard.history[0].notes).not.toBe('injected-private-data');
  });
});
