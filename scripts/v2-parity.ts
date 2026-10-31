import {isDeepStrictEqual} from 'node:util';
import {BundRungEngine} from '../server/engine/BundRungEngine';
import {SimulationWorld} from '../server/engine/SimulationWorld';
import {setupGame,seededRandom} from './ai-benchmark';
import {fromObservation} from '../server/ai/v2/simulation/adapters';
import {CARDS,CompactState,indexOf} from '../server/ai/v2/simulation/CompactState';
import {Action,apply,canRequest,canShow,forcedAction,legalCards} from '../server/ai/v2/simulation/FastSimulator';
export function oracleWorld(engine:BundRungEngine):SimulationWorld {
 const state=engine.getPublicState(),w=new SimulationWorld();
 for(const p of state.players){const priv=engine.getPrivateState(p.id);w.set(p.id,[...priv.myHand,...(priv.myTrumpCard?[priv.myTrumpCard]:[])]);
 for(const [k,c] of Object.entries(priv.knownConcealedCards??{}))w.concealed.set(k,c);
 if(priv.teammateFaceDownCard)w.concealed.set(`${state.currentTrick.trickNumber}:${state.faceDownLeadPlayerId}`,priv.teammateFaceDownCard);
 if(priv.myTrumpCard){w.lockedTrump=priv.myTrumpCard;w.trumpSuit=priv.secretTrumpSuit;}}
 if(!w.trumpSuit)w.trumpSuit=state.trumpSuit;return w;
}
export function compare(engine:BundRungEngine,s:CompactState):void {
 const p=engine.getPublicState(),ids=p.players.map(x=>x.id),seat=(id:string|null|undefined)=>ids.indexOf(id??'');
 const publicPlay=(x:typeof p.currentTrick.cards[number])=>[seat(x.playerId),x.card?.id??null,!!x.isFaceDown,!!x.isAceDowngraded];
 const compactPlay=(x:CompactState['plays'][number])=>[x.seat,x.hidden&&!s.revealed?null:CARDS[x.card].id,x.hidden,x.aceDown];
 const expected={accumulated:p.faceDownCallerCards.map(c=>[c.trickNumber,c.card?.id??null,!c.isRevealed]),plays:p.currentTrick.cards.map(publicPlay),history:p.completedTricks.flatMap(t=>t.cards.map(publicPlay)),phase:p.phase,actor:p.activePlayerIndex,dealer:p.dealerPlayerIndex,trick:p.currentTrick.trickNumber,
  lead:p.currentTrick.leadSuit,revealed:p.isTrumpRevealed,locked:p.trumpCardPlaced,pending:p.isTrumpRevealPending,paused:p.isRungRevealPaused,
  challenge:p.faceDownLeadPending,counts:p.players.map(x=>x.cardsInHandCount),winner:p.lastGameWinningTeam,
  streak:p.streakCount,streakSeat:seat(p.streakWinnerPlayerId),last:seat(p.lastTrickWinnerPlayerId),teamTricks:[p.team1TricksWon,p.team2TricksWon],
  winners:p.completedTricks.map(t=>seat(t.winnerPlayerId)),score:p.scorecard,match:p.matchWinnerTeam,
  legal:ids.map(id=>engine.getLegalCardsForPlayer(id).map(c=>indexOf(c.id)).sort((a,b)=>a-b)),request:ids.map(id=>engine.getPrivateState(id).canRequestRungReveal),show:ids.map(id=>engine.getPrivateState(id).canShowTrump)};
 const actual={accumulated:s.accumulated.map(c=>[c.trick,s.revealed||!c.hidden?CARDS[c.card].id:null,c.hidden]),plays:s.plays.map(compactPlay),history:s.history.map(compactPlay),phase:s.phase,actor:s.actor,dealer:s.dealer,trick:s.trick,lead:s.lead<0?null:CARDS[s.lead*13].suit,revealed:s.revealed,locked:s.locked>=0,pending:s.pending,paused:s.paused,
  challenge:s.challenge,counts:s.hands.map((h,i)=>h.length+Number(i===s.caller&&s.locked>=0)),winner:s.winner<0?null:s.winner===0?'TEAM_1':'TEAM_2',
  streak:s.streak,streakSeat:s.streakSeat,last:s.lastWinner,teamTricks:s.teamTricks,winners:s.winners,score:s.score,match:s.matchWinner<0?null:s.matchWinner===0?'TEAM_1':'TEAM_2',
  legal:ids.map((_,i)=>legalCards(s,i).sort((a,b)=>a-b)),request:ids.map((_,i)=>canRequest(s,i)),show:ids.map((_,i)=>canShow(s,i))};
 if(!isDeepStrictEqual(actual,expected))throw new Error(JSON.stringify({expected,actual}));
}
export function applyAuthoritative(engine:BundRungEngine,a:Action):void {
 const state=engine.getPublicState();
 if(a.type==='play')engine.playCard(state.currentTurnPlayerId!,CARDS[a.card].id);
 else if(a.type==='request')engine.requestTrumpReveal(state.currentTurnPlayerId!);
 else if(a.type==='show')engine.showTrumpCard(state.trumpCallerPlayerId!);
 else if(a.type==='resume')engine.resumeAfterTrumpReveal();
 else engine.respondToFaceDownRung(state.players[a.seat].id,a.accept);
}
export function runParity(games=400){
 let transitions=0,midTrick=0,reveals=0,terminals=0,aceDowngrades=0,concealed=0;
 for(let seed=1;seed<=games;seed++){
  const engine=setupGame(seed),random=seededRandom(seed^0xfeed);let s=fromObservation(engine.getPublicState(),oracleWorld(engine));
  for(let step=0;step<180;step++){
   compare(engine,s);if(s.phase!=='TRICK_PLAYING'){terminals++;break;}
   if(step%7===0){s=fromObservation(engine.getPublicState(),oracleWorld(engine));if(s.plays.length)midTrick++;compare(engine,s);}
   let action=forcedAction(s);if(!action){const legal=legalCards(s);if(!legal.length)throw new Error('PARITY_NO_ACTION');action={type:'play',card:legal[Math.floor(random()*legal.length)]};}
   if(action.type==='show')reveals++;applyAuthoritative(engine,action);apply(s,action);transitions++;
   aceDowngrades+=Number(s.plays.at(-1)?.aceDown??false);concealed+=Number(s.accumulated.length>0);
  }
 }
 return {games,transitions,midTrick,reveals,terminals,aceDowngrades,concealed};
}
if(process.argv[1]?.endsWith('v2-parity.ts'))console.log(JSON.stringify(runParity(Number(process.argv[2]??400)),null,2));
