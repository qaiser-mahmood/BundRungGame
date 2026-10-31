import type {PublicGameState} from '../../../../shared/types';
import {BundRungEngine} from '../../../engine/BundRungEngine';
import {SimulationWorld} from '../../../engine/SimulationWorld';
import {CompactState,Play,SUITS,indexOf} from './CompactState';
export function fromObservation(state:PublicGameState,world:SimulationWorld):CompactState {
  BundRungEngine.validateSimulationWorld(state,world);
  const seat=(id:string|null|undefined)=>state.players.findIndex(p=>p.id===id);
  const hydrate=(trick:PublicGameState['currentTrick']):Play[]=>trick.cards.map(p=>({seat:seat(p.playerId),
    card:indexOf((p.card??world.concealed.get(`${trick.trickNumber}:${p.playerId}`))!.id),hidden:!!p.isFaceDown,
    aceDown:!!p.isAceDowngraded,revealed:p.trumpWasRevealed??state.isTrumpRevealed,trick:trick.trickNumber}));
  const caller=seat(state.trumpCallerPlayerId),locked=world.lockedTrump?indexOf(world.lockedTrump.id):-1;
  const history=state.completedTricks.flatMap(hydrate),plays=hydrate(state.currentTrick);
  return {source:state,hands:state.players.map((p,i)=>Uint8Array.from(world.get(p.id)!.filter(c=>!(i===caller&&indexOf(c.id)===locked)).map(c=>indexOf(c.id)))),
    actor:state.activePlayerIndex,dealer:state.dealerPlayerIndex,caller,locked,trump:world.trumpSuit?SUITS.indexOf(world.trumpSuit):-1,
    revealed:state.isTrumpRevealed,phase:state.phase,trick:state.currentTrick.trickNumber,lead:state.currentTrick.leadSuit?SUITS.indexOf(state.currentTrick.leadSuit):-1,
    leadSeat:seat(state.currentTrick.leadPlayerId),plays,history,winners:state.completedTricks.map(t=>seat(t.winnerPlayerId)),
    streakSeat:seat(state.streakWinnerPlayerId),streak:state.streakCount??0,lastWinner:seat(state.lastTrickWinnerPlayerId),
    lastCard:state.lastTrickWinningCard?indexOf(state.lastTrickWinningCard.id):-1,teamTricks:[state.team1TricksWon,state.team2TricksWon],
    teamStreak:state.consecutiveTricksCount,lastTeam:state.lastTrickWinnerTeam==='TEAM_1'?0:state.lastTrickWinnerTeam==='TEAM_2'?1:-1,
    pending:state.isTrumpRevealPending,paused:state.isRungRevealPaused,requester:seat(state.trumpRevealRequesterId),revealer:seat(state.rungRevealerPlayerId),
    challenge:state.faceDownLeadPending,challengeSeat:seat(state.faceDownLeadPlayerId),votes:state.players.map(p=>state.faceDownChallengeVotes?.[p.id]==='ACCEPT'?1:state.faceDownChallengeVotes?.[p.id]==='SURRENDER'?-1:0),
    accumulated:state.faceDownCallerCards.map(c=>({seat:caller,card:indexOf((c.card??world.concealed.get(`${c.trickNumber}:${state.trumpCallerPlayerId}`))!.id),trick:c.trickNumber,hidden:!c.isRevealed,aceDown:false,revealed:c.isRevealed})),
    openModifier:state.openTrumpModifier,bwinjiModifier:state.bwinjiModifier,score:state.scorecard,winner:-1,matchWinner:-1,loser:-1};
}
