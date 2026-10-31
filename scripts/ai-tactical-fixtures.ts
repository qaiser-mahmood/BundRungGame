import type {Card,PrivatePlayerState,PublicGameState} from '../shared/types';
import {ALL_52_CARDS} from '../server/ai/planning/CardTracker';
import {setupGame} from './ai-benchmark';
export const card=(id:string):Card=>ALL_52_CARDS.find(c=>c.id===id)!;
export interface TacticalFixture {name:string;state:PublicGameState;priv:PrivatePlayerState;legal:Card[];expected:string;}
export function tacticalFixtures():TacticalFixture[]{
  const fixture=(name:string,plays:[string,string][],hand:string[],expected:string):TacticalFixture=>{
    const engine=setupGame(2),state=engine.getPublicState(),priv=engine.getPrivateState('p0');
    Object.assign(state,{currentTurnPlayerId:'p0',isTrumpRevealed:true,trumpSuit:'SPADES',trumpCallerPlayerId:'p1',trumpCardPlaced:false,streakCount:0,lastTrickWinningCard:null,completedTricks:[],revealedHands:{}});
    state.currentTrick={trickNumber:8,leadPlayerId:plays[0]?.[0]??'p0',leadSuit:plays.length?card(plays[0][1]).suit:null,cards:plays.map(([playerId,id])=>({playerId,card:card(id),playedAt:0})),winnerPlayerId:null,winningTeam:null};
    priv.myHand=hand.map(card);priv.myTrumpCard=null;priv.secretTrumpSuit=null;priv.partnerHand=null;priv.myPlayerId='p0';
    state.players.forEach(p=>p.cardsInHandCount=hand.length);
    return {name,state,priv,legal:hand.map(card),expected};
  };
  const safe=fixture('conserve when partner has closed trick',[['p1','H_2'],['p2','H_K'],['p3','H_Q']],['H_3','H_A'],'H_3');
  const defend=fixture('overtake partner to stop a known remaining Ace',[['p2','H_K'],['p3','H_2']],['D_3','S_2'],'S_2');
  defend.state.revealedHands.p1=[card('H_A'),card('D_2')];
  const ruffSafe=fixture('conserve trump when partner already safe',[['p1','H_2'],['p2','H_A'],['p3','H_Q']],['D_2','S_2'],'D_2');
  const block=fixture('block opponent streak at last seat',[['p1','H_K'],['p2','H_2'],['p3','H_Q']],['H_3','H_A'],'H_A');
  block.state.streakCount=1;block.state.streakWinnerPlayerId='p1';
  const streak=fixture('same player must win eligible consecutive trick',[['p1','H_2'],['p2','H_K'],['p3','H_Q']],['H_3','H_A'],'H_A');
  streak.state.streakWinnerPlayerId='p0';streak.state.streakCount=1;
  const caller=fixture('caller team cannot claim early consecutive win',[['p1','H_2'],['p2','H_K'],['p3','H_Q']],['H_3','H_A'],'H_3');
  caller.state.trumpCallerPlayerId='p2';caller.state.streakWinnerPlayerId='p0';caller.state.streakCount=1;
  const first=fixture('first trick cannot complete streak',[['p1','H_2'],['p2','H_K'],['p3','H_Q']],['H_3','H_A'],'H_3');
  first.state.currentTrick.trickNumber=1;first.state.streakWinnerPlayerId='p0';first.state.streakCount=1;
  const hidden=fixture('hidden trump has no winning power',[['p1','H_K'],['p2','H_2'],['p3','H_Q']],['H_A','S_2'],'H_A');
  hidden.state.isTrumpRevealed=false;hidden.state.trumpSuit=null;hidden.priv.secretTrumpSuit='SPADES';
  const ace=fixture('downgraded lead Ace loses control',[],['H_A','D_K'],'D_K');
  ace.state.lastTrickWinnerPlayerId='p0';ace.state.lastTrickWinningCard=card('S_A');
  ace.state.revealedHands={p1:[card('H_3'),card('D_Q')],p2:[card('C_2'),card('C_3')],p3:[card('H_4'),card('D_J')]};
  const last=fixture('final trick requires team win',[['p1','H_K'],['p2','H_2'],['p3','H_Q']],['H_3','H_A'],'H_A');last.state.currentTrick.trickNumber=13;
  const sacrifice=fixture('sacrifice when no available card can rescue trick',[['p1','H_A'],['p2','H_2'],['p3','H_K']],['H_3','H_Q'],'H_3');
  const locked=fixture('protect concealed trump when partner safe',[['p1','H_2'],['p2','H_A'],['p3','H_Q']],['D_2','S_K'],'D_2');
  locked.state.isTrumpRevealed=false;locked.state.trumpSuit=null;locked.priv.secretTrumpSuit='SPADES';
  const partnerVoid=fixture('lead towards partner known trump ruff',[],['H_2','D_2'],'H_2');
  partnerVoid.state.revealedHands={p1:[card('H_A'),card('D_K')],p2:[card('S_A'),card('D_5')],p3:[card('H_K'),card('D_Q')]};
  // A lead towards a void can help, but an opponent's higher trump reverses it.
  const voidCounter=fixture('do not lead into stronger opponent ruff',[],['H_2','D_A'],'D_A');
  voidCounter.state.revealedHands={p1:[card('S_A'),card('D_3')],p2:[card('S_2'),card('D_2')],p3:[card('H_K'),card('D_4')]};
  return [safe,defend,ruffSafe,block,streak,caller,first,hidden,ace,last,sacrifice,locked,partnerVoid,voidCounter];
}
