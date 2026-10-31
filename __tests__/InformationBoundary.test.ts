import { describe,it,expect } from 'vitest';
import { BundRungEngine } from '../server/engine/BundRungEngine';
import { CardTracker,ALL_52_CARDS } from '../server/ai/planning/CardTracker';
import { StateVectorizer } from '../server/ai/neural/StateVectorizer';
const secret=ALL_52_CARDS.find(c=>c.id==='D_5')!;
describe('viewer serialization boundary',()=>{
  it('redacts current/history/previous/side-panel cards for players and spectators until reveal',()=>{
    const engine=new BundRungEngine();for(let i=0;i<4;i++)engine.addPlayer(`p${i}`,`P${i}`);
    // An authoritative fixture is intentionally allowed to hold real identities.
    const internals=engine as unknown as {trumpCallerPlayerId:string;trumpSuit:string;trumpCard:typeof secret;
      isTrumpRevealed:boolean;currentTrick: {trickNumber:number;leadPlayerId:string;leadSuit:null;cards:{playerId:string;card:typeof secret;isFaceDown:boolean;playedAt:number}[];winnerPlayerId:null;winningTeam:null};
      completedTricks:unknown[];previousTrickCards:unknown[];faceDownCallerCards:unknown[]};
    internals.trumpCallerPlayerId='p0';internals.trumpSuit='DIAMONDS';internals.trumpCard=ALL_52_CARDS.find(c=>c.id==='D_A')!;
    internals.currentTrick={trickNumber:2,leadPlayerId:'p1',leadSuit:null,cards:[{playerId:'p0',card:secret,isFaceDown:true,playedAt:0}],winnerPlayerId:null,winningTeam:null};
    internals.completedTricks=[{...internals.currentTrick,trickNumber:1}];internals.previousTrickCards=internals.currentTrick.cards;
    internals.faceDownCallerCards=[{id:secret.id,card:secret,trickNumber:1,isRevealed:false}];
    for(const id of ['p1','p2','p3','']) {
      const payload=engine.getClientGameState(id);
      expect(JSON.stringify(payload)).not.toContain('D_5');expect(JSON.stringify(payload)).not.toContain('D_A');
      expect(payload.publicState.currentTrick.cards).toHaveLength(1);
      expect(payload.publicState.currentTrick.cards[0].card).toBeNull();
      expect(CardTracker.getPlayedCards(payload.publicState)).toHaveLength(0);
      expect(StateVectorizer.vectorize(payload.publicState,payload.privateState,id,payload.publicState.players)[52+StateVectorizer.cardToIndex(secret)]).toBe(0);
    }
    expect(engine.getPrivateState('p0').myTrumpCard?.id).toBe('D_A');
    expect(engine.getPrivateState('p0').knownConcealedCards?.['1:p0']).toEqual(secret);
    internals.isTrumpRevealed=true;
    expect(engine.getPublicState().completedTricks[0].cards[0].card).toEqual(secret);
    const snapshot=engine.getPublicState();snapshot.currentTrick.cards[0].card!.rank='2';
    expect(engine.getPublicState().currentTrick.cards[0].card?.rank).toBe('5');
  });
});
