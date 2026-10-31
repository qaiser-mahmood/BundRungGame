import type {Card,PrivatePlayerState,PublicGameState} from '../../../../shared/types';
import {CardTracker} from '../../planning/CardTracker';
import {indexOf,SUITS} from '../simulation/CompactState';
export const FEATURE_SCHEMA='bundrung-v2-observation-144/v1';
export const FEATURE_COUNT=144;
export function features(state:PublicGameState,priv:PrivatePlayerState):number[]{
 const x=new Array<number>(FEATURE_COUNT).fill(0);
 for(const c of [...priv.myHand,...(priv.myTrumpCard?[priv.myTrumpCard]:[])])x[indexOf(c.id)]=1;
 for(const c of CardTracker.getPlayedCards(state))x[52+indexOf(c.id)]=1;
 for(const [i,p] of state.currentTrick.cards.entries()){
  const c=p.card??priv.knownConcealedCards?.[`${state.currentTrick.trickNumber}:${p.playerId}`];
  x[104+3*i]=c?c.playValue/14:0;x[105+3*i]=c?(SUITS.indexOf(c.suit)+1)/4:0;
  x[106+3*i]=(state.players.findIndex(a=>a.id===p.playerId)+1)/4;
 }
 const onehot=(offset:number,suit:Card['suit']|null)=>x[offset+(suit?SUITS.indexOf(suit):4)]=1;
 onehot(116,state.currentTrick.leadSuit);onehot(121,state.isTrumpRevealed?state.trumpSuit:null);onehot(126,priv.secretTrumpSuit);
 state.players.forEach((p,i)=>x[131+i]=p.cardsInHandCount/13);
 const team=state.players.find(p=>p.id===priv.myPlayerId)?.team;
 x[135]=state.currentTrick.trickNumber/13;x[136]=(state.streakCount??0)/2;
 x[137]=Number(state.players.find(p=>p.id===state.trumpCallerPlayerId)?.team!==team);x[138]=Number(state.streakWinnerPlayerId===priv.myPlayerId);
 x[139]=Number(state.lastTrickWinningCard?.rank==='A');x[140]=state.scorecard.dealerScore/208;x[141]=Number(priv.canRequestRungReveal);x[142]=Number(priv.isMyTrumpCardPlayable);x[143]=1;
 if(x.length!==FEATURE_COUNT||x.some(v=>!Number.isFinite(v)))throw new Error('V2_FEATURES');return x;
}
export const legalMask=(cards:Card[]):number[]=>Array.from({length:52},(_,i)=>Number(cards.some(c=>indexOf(c.id)===i)));
