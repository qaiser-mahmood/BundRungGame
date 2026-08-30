import React, { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  FullClientGameState,
  ClientToServerEvents,
  ServerToClientEvents,
  Suit,
  TeamId,
  OpenTrumpModifier,
} from '../shared/types';
import { LobbyView } from './components/LobbyView';
import { TossModal } from './components/TossModal';
import { CutModal } from './components/CutModal';
import { BiddingModal } from './components/BiddingModal';
import { TableLayout } from './components/TableLayout';
import { ScorecardModal } from './components/ScorecardModal';
import { GameOverModal } from './components/GameOverModal';
import { GameResolvedModal } from './components/GameResolvedModal';
import { TutorialModal } from './components/TutorialModal';
import { sound } from './utils/sound';

export const App: React.FC = () => {
  const [socket, setSocket] = useState<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const [gameState, setGameState] = useState<FullClientGameState | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string>('');
  const [showScorecardModal, setShowScorecardModal] = useState<boolean>(false);
  const [showTutorialModal, setShowTutorialModal] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ message: string; type?: string } | null>(null);

  // Initialize Socket connection directly to backend server port 3001
  useEffect(() => {
    const serverUrl =
      (import.meta as any).env?.VITE_SERVER_URL ||
      (typeof window !== 'undefined'
        ? `${window.location.protocol}//${window.location.hostname}:3001`
        : 'http://localhost:3001');

    const socketInstance: Socket<ServerToClientEvents, ClientToServerEvents> = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketInstance.on('connect', () => {
      console.log('Connected to Bund Rung server with socket ID:', socketInstance.id);
    });

    socketInstance.on('gameStateUpdated', (state: FullClientGameState) => {
      setGameState(state);
      if (state.privateState.myPlayerId) {
        setMyPlayerId(state.privateState.myPlayerId);
      }
    });

    socketInstance.on('notification', (data) => {
      setNotification(data);
      setTimeout(() => setNotification(null), 3500);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  if (!gameState || !socket) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-950 text-amber-300">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <div className="font-cinzel text-lg tracking-wider">Connecting to Bund Rung Engine...</div>
        </div>
      </div>
    );
  }

  const { publicState, privateState } = gameState;
  const phase = publicState.phase;

  // Handlers
  const handleJoinLobby = (name: string) => {
    socket.emit('joinLobby', { playerName: name });
  };

  const handleAddBots = () => {
    socket.emit('addBot', {});
  };

  const handleStartToss = () => {
    socket.emit('drawTossCard', { cardIndex: 0 }); // Trigger toss phase
  };

  const handleDrawTossCard = (cardIndex: number) => {
    socket.emit('drawTossCard', { cardIndex });
  };

  const handleDealerShuffle = () => {
    socket.emit('dealerShuffle');
  };

  const handleDealerOfferCut = () => {
    socket.emit('dealerOfferCut');
  };

  const handlePerformCut = (cardIndex: number) => {
    socket.emit('performCut', { cardIndex });
  };

  const handleDealerDistribute5Cards = () => {
    socket.emit('dealerDistribute5Cards');
  };

  const handleSubmitBid = (
    action: 'SELECT_CARD_TRUMP' | 'BWINJI' | 'PASS',
    cardIdOrSuit?: string,
    suit?: Suit
  ) => {
    socket.emit('submitBid', { action, cardId: cardIdOrSuit, suit });
  };

  const handlePlayCard = (cardId: string) => {
    sound.playCardPlace();
    socket.emit('playCard', { cardId });
  };

  const handleRematchSameRoster = () => {
    socket.emit('startNewMatch');
  };

  const activeDealer = publicState.players[publicState.dealerPlayerIndex];

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-slate-950 text-slate-100 flex flex-col font-sans select-none">
      {/* Main Table Layout (Always in background / active during play) */}
      <TableLayout
        publicState={publicState}
        privateState={privateState}
        onPlayCard={handlePlayCard}
        onOpenScorecard={() => setShowScorecardModal(true)}
        onOpenTutorial={() => setShowTutorialModal(true)}
        onSelectOpenRungSuit={(suit) =>
          socket.emit('selectOpenRungSuit', { suit })
        }
        onDeclareOpenRung={(suit, cardId, isFaceDown) =>
          socket.emit('declareOpenRung', { suit, cardId, isFaceDown })
        }
        onDeclareBwinjiLead={(cardId, isFaceDown) =>
          socket.emit('declareBwinjiLead', { cardId, isFaceDown })
        }
        onToggleInspectPartnerCards={() =>
          socket.emit('toggleInspectPartnerCards')
        }
        onRespondToFaceDownRung={(willPlay) =>
          socket.emit('respondToFaceDownRung', { willPlay })
        }
        onRequestTrumpReveal={() => socket.emit('requestTrumpReveal')}
        onShowTrumpCard={() => socket.emit('showTrumpCard')}
        onResumeAfterTrumpReveal={() => socket.emit('resumeAfterTrumpReveal')}
        onToggleShowHand={() => socket.emit('toggleShowHand')}
        onVoteSurrender={() => socket.emit('voteSurrender')}
      />

      {/* 1. Lobby Waiting Screen (Section 2.1 & 2.2) */}
      {(phase === 'WAITING_FOR_PLAYERS' || phase === 'TEAM_FORMATION') && (
        <LobbyView
          players={publicState.players}
          myPlayerId={myPlayerId}
          teamNames={publicState.teamNames}
          onJoinLobby={handleJoinLobby}
          onAddBots={handleAddBots}
          onStartToss={() => socket.emit('startMatchToss')}
          onSwapSeats={(player1Id, player2Id) =>
            socket.emit('swapPlayerSeats', { player1Id, player2Id })
          }
          onUpdateTeamName={(team, name) =>
            socket.emit('updateTeamName', { team, name })
          }
          onOpenTutorial={() => setShowTutorialModal(true)}
          statusMessage={publicState.statusMessage}
        />
      )}

      {/* 2. Initial Toss Modal (Section 3.1) */}
      {(phase === 'INITIAL_TOSS' || phase === 'TOSS_TIE_BREAKER' || phase === 'TOSS_COMPLETE') && (
        <TossModal
          players={publicState.players}
          myPlayerId={myPlayerId}
          dealerPlayerIndex={publicState.dealerPlayerIndex}
          tossCardsRemaining={publicState.tossCardsRemaining}
          tossDraws={publicState.tossDraws}
          tossDrawHistory={publicState.tossDrawHistory}
          tossDrawnThisRound={publicState.tossDrawnThisRound}
          tossRound={publicState.tossRound}
          tiedPlayerIds={publicState.tiedPlayerIds}
          isTieBreaker={phase === 'TOSS_TIE_BREAKER'}
          isTossComplete={phase === 'TOSS_COMPLETE'}
          onDrawCard={handleDrawTossCard}
          onDistributeCards={() => socket.emit('dealerDistributeCards')}
          statusMessage={publicState.statusMessage}
        />
      )}

      {/* 3. Dealer Cut & Shuffle Modal (Section 4.1 & 4.2) */}
      {(phase === 'PRE_DEAL_SHUFFLE' || phase === 'PRE_DEAL_CUT') && (
        <CutModal
          players={publicState.players}
          dealerPlayerIndex={publicState.dealerPlayerIndex}
          cutOfferPlayerId={publicState.cutOfferPlayerId}
          myPlayerId={myPlayerId}
          isCutPhase={phase === 'PRE_DEAL_CUT'}
          cutDone={publicState.cutDone}
          onShuffle={handleDealerShuffle}
          onOfferCut={handleDealerOfferCut}
          onPerformCut={handlePerformCut}
          onDistribute5Cards={handleDealerDistribute5Cards}
          statusMessage={publicState.statusMessage}
        />
      )}

      {/* 4. Bidding Modal (Section 5.1 & 5.2) */}
      {phase === 'BIDDING_PHASE' && (
        <BiddingModal
          myPlayerId={myPlayerId}
          biddingTurnPlayerId={publicState.biddingTurnPlayerId}
          biddingPassCount={publicState.biddingPassCount}
          my5Cards={privateState.myHand}
          players={publicState.players}
          trumpMode={publicState.trumpMode}
          trumpCallerPlayerId={publicState.trumpCallerPlayerId}
          onSubmitBid={handleSubmitBid}
          statusMessage={publicState.statusMessage}
        />
      )}

      {/* 5. Scorecard Modal (Section 6.1 & 6.2) */}
      {showScorecardModal && activeDealer && (
        <ScorecardModal
          scorecard={publicState.scorecard}
          activeDealerName={activeDealer.name}
          activeDealerTeam={activeDealer.team}
          teamNames={publicState.teamNames}
          onClose={() => setShowScorecardModal(false)}
        />
      )}

      {/* 5b. Game Resolved / Next Game Modal (Between 13-trick Games) */}
      {phase === 'GAME_RESOLVED' && !publicState.isMatchOver && (
        <GameResolvedModal
          gameIndex={publicState.gameIndex}
          players={publicState.players}
          dealerPlayerIndex={publicState.dealerPlayerIndex}
          myPlayerId={myPlayerId}
          team1TricksWon={publicState.team1TricksWon}
          team2TricksWon={publicState.team2TricksWon}
          lastGameWinningTeam={publicState.lastGameWinningTeam}
          scorecard={publicState.scorecard}
          statusMessage={publicState.statusMessage}
          teamNames={publicState.teamNames}
          onDistributeNextGame={() => socket?.emit('dealerDistributeNextGame')}
          onOpenScorecard={() => setShowScorecardModal(true)}
        />
      )}

      {/* 6. Match Over / KHOTI Modal (Section 7) */}
      {publicState.isMatchOver && (
        <GameOverModal
          losingTeamKhoti={publicState.losingTeamKhoti}
          matchWinnerTeam={publicState.matchWinnerTeam}
          score={publicState.scorecard.dealerScore}
          teamNames={publicState.teamNames}
          onRematchSameRoster={handleRematchSameRoster}
        />
      )}

      {/* 7. Interactive Game & UI Tutorial Modal */}
      <TutorialModal
        isOpen={showTutorialModal}
        onClose={() => setShowTutorialModal(false)}
      />
    </div>
  );
};
export default App;
