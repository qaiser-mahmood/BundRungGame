import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PublicGameState,
  PrivatePlayerState,
  Player,
  Card,
  Suit,
  TeamId,
  SeatPosition,
} from '../../shared/types';
import { PlayingCard, SuitIcon, RungSuitCard } from './PlayingCard';
import {
  Award,
  Crown,
  Eye,
  EyeOff,
  Flame,
  HelpCircle,
  Megaphone,
  Sparkles,
  Users,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Flag,
  Play,
  X,
  Shield,
  GraduationCap,
} from 'lucide-react';
import { sound } from '../utils/sound';

interface TableLayoutProps {
  publicState: PublicGameState;
  privateState: PrivatePlayerState;
  onPlayCard: (cardId: string) => void;
  onOpenScorecard: () => void;
  onOpenTutorial?: () => void;
  onDeclareOpenRung?: (suit: Suit, cardId: string, isFaceDown: boolean) => void;
  onSelectOpenRungSuit?: (suit: Suit | null) => void;
  onDeclareBwinjiLead?: (cardId: string, isFaceDown: boolean) => void;
  onToggleInspectPartnerCards?: () => void;
  onRespondToFaceDownRung?: (willPlay: boolean) => void;
  onRequestTrumpReveal?: () => void;
  onShowTrumpCard?: () => void;
  onResumeAfterTrumpReveal?: () => void;
  onToggleShowHand?: () => void;
  onVoteSurrender?: () => void;
}

const suitSymbols: Record<Suit, string> = {
  HEARTS: '♥',
  DIAMONDS: '♦',
  CLUBS: '♣',
  SPADES: '♠',
};

const suitOptions: { suit: Suit; symbol: string }[] = [
  { suit: 'SPADES', symbol: '♠' },
  { suit: 'CLUBS', symbol: '♣' },
  { suit: 'HEARTS', symbol: '♥' },
  { suit: 'DIAMONDS', symbol: '♦' },
];

export const TableLayout: React.FC<TableLayoutProps> = ({
  publicState,
  privateState,
  onPlayCard,
  onOpenScorecard,
  onOpenTutorial,
  onDeclareOpenRung,
  onSelectOpenRungSuit,
  onDeclareBwinjiLead,
  onToggleInspectPartnerCards,
  onRespondToFaceDownRung,
  onRequestTrumpReveal,
  onShowTrumpCard,
  onResumeAfterTrumpReveal,
  onToggleShowHand,
  onVoteSurrender,
}) => {
  const {
    phase,
    players,
    dealerPlayerIndex,
    currentTurnPlayerId,
    currentTrick,
    trumpMode,
    trumpSuit,
    isTrumpRevealed,
    trumpCallerPlayerId,
    trumpCardPlaced,
    trumpCardPlayerId,
    revealedTrumpCard,
    team1TricksWon,
    team2TricksWon,
    consecutiveTricksCount,
    lastTrickWinnerTeam,
    lastTrickWinnerPlayerId,
    lastTrickWinningCard,
    revealedHands = {},
    surrenderVotes = { TEAM_1: [], TEAM_2: [] },
    scorecard,
    statusMessage,
    firstRoundOpenTrumpAvailable,
    faceDownLeadPending,
    faceDownLeadPlayerId,
    faceDownLeadCardFaceDown,
    opponentsInspectingCards,
    faceDownCallerCards,
    isRungRevealPaused,
    isTrumpRevealPending,
    trumpRevealRequesterId,
  } = publicState;

  const {
    myPlayerId,
    myHand,
    myTrumpCard,
    isMyTrumpCardPlayable,
    legalPlayableCardIds,
    canRequestRungReveal,
    canShowTrump,
    secretTrumpSuit,
    teammateFaceDownCard,
    partnerHand,
    isInspectingPartnerCards,
    isMyHandRevealed = false,
    hasVotedSurrender = false,
  } = privateState;

  // Open Rung interactive state for Trick 1 (Draw from existing hand)
  const [selectedOpenRungSuit, setSelectedOpenRungSuit] = useState<Suit | null>(null);
  const [selectedLeadCardId, setSelectedLeadCardId] = useState<string | null>(null);
  const [isPeekingFaceDownCard, setIsPeekingFaceDownCard] = useState<boolean>(false);
  const [showPartnerInspection, setShowPartnerInspection] = useState<boolean>(false);

  const myPlayer = players.find((p) => p.id === myPlayerId) || players[0];
  const myIndex = players.findIndex((p) => p.id === myPlayerId);

  // Derive player positions relative to bottom (0 = Bottom/Me, 1 = Right, 2 = Top, 3 = Left)
  const getRelativePlayer = (offset: number): Player | undefined => {
    if (myIndex === -1) return players[offset % 4];
    return players[(myIndex + offset) % 4];
  };

  const bottomPlayer = getRelativePlayer(0);
  const rightPlayer = getRelativePlayer(1);
  const topPlayer = getRelativePlayer(2);
  const leftPlayer = getRelativePlayer(3);

  const dealer = players[dealerPlayerIndex];
  const rungCaller = players.find((p) => p.id === trumpCallerPlayerId);
  const faceDownCaller = players.find((p) => p.id === faceDownLeadPlayerId);
  const prevWinnerPlayer = players.find((p) => p.id === lastTrickWinnerPlayerId);
  const trumpRequester = players.find((p) => p.id === trumpRevealRequesterId);

  const isMyTurn = currentTurnPlayerId === myPlayerId;
  const canAnnounceOpenRung = firstRoundOpenTrumpAvailable && trumpMode !== 'BWINJI' && isMyTurn && !faceDownLeadPending;
  const isBwinjiCallerLead =
    trumpMode === 'BWINJI' &&
    currentTrick.trickNumber === 1 &&
    currentTrick.cards.length === 0 &&
    isMyTurn &&
    trumpCallerPlayerId === myPlayerId &&
    !faceDownLeadPending;

  const isDefendingTeam = faceDownCaller && myPlayer.team !== faceDownCaller.team;
  const isAttackingTeam = faceDownCaller && myPlayer.team === faceDownCaller.team;

  const selectedLeadCard = myHand.find((c) => c.id === selectedLeadCardId);

  // Group partner hand by suit for clear, un-jumbled inspection
  const groupedPartnerHand: Record<Suit, Card[]> = {
    SPADES: partnerHand ? partnerHand.filter((c) => c.suit === 'SPADES') : [],
    HEARTS: partnerHand ? partnerHand.filter((c) => c.suit === 'HEARTS') : [],
    CLUBS: partnerHand ? partnerHand.filter((c) => c.suit === 'CLUBS') : [],
    DIAMONDS: partnerHand ? partnerHand.filter((c) => c.suit === 'DIAMONDS') : [],
  };

  // Position of cards played in the trick relative to seating
  // If current trick has 0 cards, display the 4 cards from previous trick face-up until next trick is started
  const isShowingPreviousTrick = currentTrick.cards.length === 0 && Boolean(publicState.previousTrickCards);
  const displayTrickCards =
    currentTrick.cards.length > 0
      ? currentTrick.cards
      : (publicState.previousTrickCards || []);

  const getPlayedCardForPlayer = (playerId?: string) => {
    if (!playerId) return null;
    return displayTrickCards.find((c) => c.playerId === playerId);
  };

  const playedBottom = getPlayedCardForPlayer(bottomPlayer?.id);
  const playedRight = getPlayedCardForPlayer(rightPlayer?.id);
  const playedTop = getPlayedCardForPlayer(topPlayer?.id);
  const playedLeft = getPlayedCardForPlayer(leftPlayer?.id);

  const isCardFaceDownForViewer = (playedItem?: { playerId: string; card: Card; isFaceDown?: boolean } | null) => {
    if (!playedItem) return false;
    if (playedItem.playerId === faceDownLeadPlayerId && faceDownLeadPending) {
      // If challenger team clicks to peek, it reveals ONLY to them!
      if (faceDownCaller && myPlayer.team === faceDownCaller.team && isPeekingFaceDownCard) {
        return false;
      }
      return true; // Face-down on table by default!
    }
    if (playedItem.isFaceDown) {
      if (faceDownCaller && myPlayer.team === faceDownCaller.team && playedItem.playerId === faceDownLeadPlayerId && isPeekingFaceDownCard) {
        return false;
      }
      return true;
    }
    return false;
  };

  const handlePlayedCardClick = (playedItem?: { playerId: string; card: Card; isFaceDown?: boolean } | null) => {
    if (!playedItem) return;
    if (playedItem.playerId === faceDownLeadPlayerId && faceDownLeadPending) {
      if (faceDownCaller && myPlayer.team === faceDownCaller.team) {
        sound.playCardSlide();
        setIsPeekingFaceDownCard(!isPeekingFaceDownCard);
      }
    }
  };

  const getPlayedCardData = (playedItem?: { playerId: string; card: Card; isFaceDown?: boolean } | null) => {
    if (!playedItem) return null;
    if (
      playedItem.playerId === faceDownLeadPlayerId &&
      faceDownCaller &&
      myPlayer.team === faceDownCaller.team &&
      teammateFaceDownCard
    ) {
      return teammateFaceDownCard;
    }
    return playedItem.card;
  };

  const getPlayedCardBadge = (playedItem?: { playerId: string; card: Card; isFaceDown?: boolean; isAceDowngraded?: boolean } | null) => {
    if (!playedItem) return undefined;
    if (
      playedItem.playerId === faceDownLeadPlayerId &&
      faceDownLeadPending &&
      faceDownCaller &&
      myPlayer.team === faceDownCaller.team
    ) {
      return 'Peek';
    }
    if (playedItem.isAceDowngraded) {
      return 'Ace as 2';
    }
    return undefined;
  };

  const handleOpenRungSubmit = (isFaceDown: boolean) => {
    if (!selectedOpenRungSuit || !selectedLeadCardId || !onDeclareOpenRung) return;
    sound.playTrumpReveal();
    onDeclareOpenRung(selectedOpenRungSuit, selectedLeadCardId, isFaceDown);
    setSelectedOpenRungSuit(null);
    setSelectedLeadCardId(null);
  };

  const myTeamSurrenderCount = (surrenderVotes[myPlayer?.team || 'TEAM_1'] || []).length;

  return (
    <div className="relative w-full h-full flex flex-col justify-between p-1 sm:p-3 overflow-hidden select-none table-felt">
      {/* --- Top Bar: Show Cards, Surrender & Score --- */}
      <header className="flex items-center justify-between z-20 px-2 py-1 bg-slate-950/80 backdrop-blur-md rounded-xl border border-amber-500/30 gap-1 sm:gap-2">
        {/* Left: Show Cards & Team Surrender */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Show Cards Toggle Button */}
          {onToggleShowHand && (
            <button
              onClick={() => {
                sound.playCardSlide();
                onToggleShowHand();
              }}
              className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer shadow-sm ${isMyHandRevealed
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 border-emerald-400 text-white shadow-glow-gold'
                  : 'bg-slate-900/90 hover:bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                }`}
              title={isMyHandRevealed ? 'Click to hide your hand cards from other players' : 'Click to flip your hand cards face up for everyone to see'}
            >
              {isMyHandRevealed ? <Eye className="w-3.5 h-3.5 text-emerald-200" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
              <span>{isMyHandRevealed ? 'Public Hand' : 'Show Cards'}</span>
            </button>
          )}

          {/* Team Surrender Vote Button */}
          {onVoteSurrender && (phase === 'TRICK_PLAYING' || phase === 'BIDDING_PHASE') && (
            <button
              onClick={() => {
                sound.playCardSlide();
                onVoteSurrender();
              }}
              className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer shadow-sm ${hasVotedSurrender
                  ? 'bg-gradient-to-r from-red-800 to-rose-900 border-red-400 text-red-100 shadow-glow-gold'
                  : 'bg-slate-900/90 hover:bg-red-950/70 text-slate-300 border-slate-700 hover:text-red-200'
                }`}
              title="Both players on your team must click Surrender to concede the game to opponents"
            >
              <Flag className={`w-3.5 h-3.5 ${hasVotedSurrender ? 'text-red-300 fill-red-300' : 'text-slate-400'}`} />
              <span>{hasVotedSurrender ? 'Surrendered' : 'Surrender'}</span>
              <span className="text-[9px] sm:text-[10px] opacity-80">({myTeamSurrenderCount}/2)</span>
            </button>
          )}
        </div>

        {/* Center: Streak Indicator (if active) */}
        {consecutiveTricksCount > 1 && (
          <div className="px-2 py-0.5 bg-orange-950/80 border border-orange-500/60 rounded-full flex items-center gap-1 text-[10px] sm:text-xs font-bold text-orange-300 animate-pulse">
            <Flame className="w-3 h-3 text-orange-400" /> Streak: {consecutiveTricksCount}
          </div>
        )}

        {/* Right: Tutorial & Scorecard Trigger */}
        <div className="flex items-center gap-1.5">
          {onOpenTutorial && (
            <button
              onClick={() => {
                sound.playCardSlide();
                onOpenTutorial();
              }}
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-900/90 hover:bg-slate-800 text-amber-300 border border-amber-500/40 rounded-lg text-[10px] sm:text-xs transition font-semibold cursor-pointer shadow-sm"
              title="Open Interactive Game & UI Tutorial"
            >
              <GraduationCap className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Tutorial</span>
            </button>
          )}

          <button
            onClick={() => {
              sound.playCardSlide();
              onOpenScorecard();
            }}
            className="flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 font-bold rounded-lg text-[10px] sm:text-xs transition shadow-glow-gold cursor-pointer"
          >
            <Award className="w-3.5 h-3.5" /> Score ({scorecard.dealerScore} pts)
          </button>
        </div>
      </header>

      {/* --- Main Casino Table Play Area --- */}
      <main className="relative flex-1 flex items-center justify-center my-0.5 sm:my-2 w-full overflow-hidden">
        {/* --- Top Player (Partner) --- */}
        {topPlayer && (
          <div className="absolute top-0.5 sm:top-1 flex flex-col items-center z-10">
            <PlayerBadge
              player={topPlayer}
              isCurrentTurn={topPlayer.id === currentTurnPlayerId}
              isDealer={topPlayer.id === dealer?.id}
              isTrumpCaller={topPlayer.id === rungCaller?.id}
              isPrevWinner={topPlayer.id === lastTrickWinnerPlayerId}
              position="top"
            />
            <div className="flex items-center gap-1.5 mt-0.5 sm:mt-1">
              {revealedHands[topPlayer.id] && revealedHands[topPlayer.id].length > 0 ? (
                <div className="flex flex-col items-center bg-slate-950/90 px-2 py-1 rounded-xl border border-amber-400/60 shadow-glow-gold max-w-full">
                  <div className="text-[9px] font-bold text-amber-300 mb-0.5 flex items-center gap-1">
                    <Eye className="w-3 h-3 text-emerald-400" />
                    <span>{topPlayer.name.split(' ')[0]}'s Hand ({revealedHands[topPlayer.id].length}):</span>
                  </div>
                  <div className="flex justify-center -space-x-2 sm:-space-x-1 px-1 py-0.5 overflow-x-auto max-w-full">
                    {revealedHands[topPlayer.id].map((c) => (
                      <div key={c.id} className="hover:-translate-y-1.5 transition-transform hover:z-20">
                        <PlayingCard card={c} size="sm" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex -space-x-4">
                  {Array.from({ length: Math.min(topPlayer.cardsInHandCount, 8) }).map((_, i) => (
                    <PlayingCard key={i} faceDown size="xs" />
                  ))}
                </div>
              )}

              {(trumpCardPlaced || (isTrumpRevealed && (Boolean(revealedTrumpCard) || Boolean(trumpSuit)))) && topPlayer.id === trumpCardPlayerId && (
                <div className="flex flex-col items-center p-1 bg-amber-950/80 border-2 border-amber-400/90 rounded-xl shadow-glow-gold min-w-[48px] sm:min-w-[56px]">
                  <div className="text-[8px] sm:text-[9px] font-cinzel font-bold text-amber-300 uppercase tracking-wider mb-0.5">
                    Rung
                  </div>
                  {isTrumpRevealed ? (
                    revealedTrumpCard ? (
                      <PlayingCard card={revealedTrumpCard} size="xs" />
                    ) : trumpSuit ? (
                      <RungSuitCard suit={trumpSuit} size="xs" />
                    ) : null
                  ) : (
                    <PlayingCard faceDown size="xs" />
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- Left Player --- */}
        {leftPlayer && (
          <div className="absolute left-0.5 sm:left-2 flex flex-row items-center z-10 gap-0.5 sm:gap-1.5">
            {/* Hand cards on the outside */}
            <div className="flex flex-col items-center gap-0.5">
              {revealedHands[leftPlayer.id] && revealedHands[leftPlayer.id].length > 0 ? (
                <div className="flex flex-col items-center bg-slate-950/90 p-1 rounded-xl border border-amber-400/60 shadow-glow-gold">
                  <div className="text-[8px] font-bold text-amber-300 mb-0.5 flex items-center gap-0.5">
                    <Eye className="w-2.5 h-2.5 text-emerald-400" />
                    <span>Cards ({revealedHands[leftPlayer.id].length})</span>
                  </div>
                  <div className="grid grid-cols-2 gap-0.5 max-h-[160px] sm:max-h-[220px] overflow-y-auto px-0.5">
                    {revealedHands[leftPlayer.id].map((c) => (
                      <div key={c.id} className="hover:scale-105 transition-transform">
                        <PlayingCard card={c} size="xs" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col -space-y-6">
                  {Array.from({ length: Math.min(leftPlayer.cardsInHandCount, 6) }).map((_, i) => (
                    <PlayingCard key={i} faceDown size="xs" />
                  ))}
                </div>
              )}

              {(trumpCardPlaced || (isTrumpRevealed && (Boolean(revealedTrumpCard) || Boolean(trumpSuit)))) && leftPlayer.id === trumpCardPlayerId && (
                <div className="flex flex-col items-center p-1 bg-amber-950/80 border-2 border-amber-400/90 rounded-xl shadow-glow-gold min-w-[44px] sm:min-w-[56px] mt-0.5">
                  <div className="text-[7px] sm:text-[9px] font-cinzel font-bold text-amber-300 uppercase tracking-wider mb-0.5">
                    Rung
                  </div>
                  {isTrumpRevealed ? (
                    revealedTrumpCard ? (
                      <PlayingCard card={revealedTrumpCard} size="xs" />
                    ) : trumpSuit ? (
                      <RungSuitCard suit={trumpSuit} size="xs" />
                    ) : null
                  ) : (
                    <PlayingCard faceDown size="xs" />
                  )}
                </div>
              )}
            </div>

            {/* Name badge in front of cards facing table */}
            <PlayerBadge
              player={leftPlayer}
              isCurrentTurn={leftPlayer.id === currentTurnPlayerId}
              isDealer={leftPlayer.id === dealer?.id}
              isTrumpCaller={leftPlayer.id === rungCaller?.id}
              isPrevWinner={leftPlayer.id === lastTrickWinnerPlayerId}
              position="left"
            />
          </div>
        )}

        {/* --- Right Player --- */}
        {rightPlayer && (
          <div className="absolute right-0.5 sm:right-2 flex flex-row-reverse items-center z-10 gap-0.5 sm:gap-1.5">
            {/* Hand cards on the outside */}
            <div className="flex flex-col items-center gap-0.5">
              {revealedHands[rightPlayer.id] && revealedHands[rightPlayer.id].length > 0 ? (
                <div className="flex flex-col items-center bg-slate-950/90 p-1 rounded-xl border border-amber-400/60 shadow-glow-gold">
                  <div className="text-[8px] font-bold text-amber-300 mb-0.5 flex items-center gap-0.5">
                    <Eye className="w-2.5 h-2.5 text-emerald-400" />
                    <span>Cards ({revealedHands[rightPlayer.id].length})</span>
                  </div>
                  <div className="grid grid-cols-2 gap-0.5 max-h-[160px] sm:max-h-[220px] overflow-y-auto px-0.5">
                    {revealedHands[rightPlayer.id].map((c) => (
                      <div key={c.id} className="hover:scale-105 transition-transform">
                        <PlayingCard card={c} size="xs" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col -space-y-6">
                  {Array.from({ length: Math.min(rightPlayer.cardsInHandCount, 6) }).map((_, i) => (
                    <PlayingCard key={i} faceDown size="xs" />
                  ))}
                </div>
              )}

              {(trumpCardPlaced || (isTrumpRevealed && (Boolean(revealedTrumpCard) || Boolean(trumpSuit)))) && rightPlayer.id === trumpCardPlayerId && (
                <div className="flex flex-col items-center p-1 bg-amber-950/80 border-2 border-amber-400/90 rounded-xl shadow-glow-gold min-w-[44px] sm:min-w-[56px] mt-0.5">
                  <div className="text-[7px] sm:text-[9px] font-cinzel font-bold text-amber-300 uppercase tracking-wider mb-0.5">
                    Rung
                  </div>
                  {isTrumpRevealed ? (
                    revealedTrumpCard ? (
                      <PlayingCard card={revealedTrumpCard} size="xs" />
                    ) : trumpSuit ? (
                      <RungSuitCard suit={trumpSuit} size="xs" />
                    ) : null
                  ) : (
                    <PlayingCard faceDown size="xs" />
                  )}
                </div>
              )}
            </div>

            {/* Name badge in front of cards facing table */}
            <PlayerBadge
              player={rightPlayer}
              isCurrentTurn={rightPlayer.id === currentTurnPlayerId}
              isDealer={rightPlayer.id === dealer?.id}
              isTrumpCaller={rightPlayer.id === rungCaller?.id}
              isPrevWinner={rightPlayer.id === lastTrickWinnerPlayerId}
              position="right"
            />
          </div>
        )}

        {/* --- Center: 4-Way Trick Play Field --- */}
        <div className="relative w-48 h-48 sm:w-64 sm:h-64 md:w-80 md:h-80 rounded-full border border-felt-border/60 bg-felt-dark/40 flex items-center justify-center shadow-inner mt-6 sm:mt-10 mb-1">
          {/* Previous Turn Winner Floating Indicator */}
          {isShowingPreviousTrick && prevWinnerPlayer && (
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 z-30 px-3 py-0.5 bg-gradient-to-r from-amber-950/90 via-slate-900/90 to-amber-950/90 border border-amber-400/80 rounded-full shadow-glow-gold flex items-center gap-1.5 whitespace-nowrap text-[10px] sm:text-xs">
              <Award className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-bold text-slate-300">Previous Turn Won By:</span>
              <span className="font-extrabold text-amber-300">{prevWinnerPlayer.name}</span>
              {lastTrickWinningCard && (
                <span className="font-semibold text-emerald-400">
                  ({lastTrickWinningCard.rank} of {lastTrickWinningCard.suit} {suitSymbols[lastTrickWinningCard.suit]})
                </span>
              )}
            </div>
          )}

          {/* Game Name on Table Felt */}
          <div className="absolute text-center pointer-events-none select-none flex flex-col items-center justify-center opacity-20">
            <div className="text-xl sm:text-3xl font-cinzel font-black tracking-widest text-amber-200 uppercase">
              {trumpMode === 'BWINJI' ? 'BWINJI' : 'BUND RUNG'}
            </div>
          </div>

          {/* Played cards container with 4 designated cardinal positions */}
          <div className="relative w-36 h-36 sm:w-48 sm:h-48 md:w-56 md:h-56 flex items-center justify-center">
            {/* Top played card */}
            <div className="absolute top-1 sm:top-2">
              <AnimatePresence mode="popLayout">
                {playedTop && (
                  <motion.div
                    key={`played_top_${playedTop.card.id}_${playedTop.playedAt || ''}`}
                    initial={{ y: -20, opacity: 0, scale: 0.9 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{ duration: 0.2 }}
                    className={
                      isShowingPreviousTrick && playedTop.playerId === lastTrickWinnerPlayerId
                        ? 'ring-2 ring-amber-400 rounded-lg shadow-glow-gold scale-105 z-10'
                        : ''
                    }
                  >
                    <PlayingCard
                      card={getPlayedCardData(playedTop) || playedTop.card}
                      faceDown={isCardFaceDownForViewer(playedTop)}
                      badge={getPlayedCardBadge(playedTop)}
                      onClick={() => handlePlayedCardClick(playedTop)}
                      size="sm"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Bottom played card */}
            <div className="absolute bottom-1 sm:bottom-2">
              <AnimatePresence mode="popLayout">
                {playedBottom && (
                  <motion.div
                    key={`played_bottom_${playedBottom.card.id}_${playedBottom.playedAt || ''}`}
                    initial={{ y: 20, opacity: 0, scale: 0.9 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{ duration: 0.2 }}
                    className={
                      isShowingPreviousTrick && playedBottom.playerId === lastTrickWinnerPlayerId
                        ? 'ring-2 ring-amber-400 rounded-lg shadow-glow-gold scale-105 z-10'
                        : ''
                    }
                  >
                    <PlayingCard
                      card={getPlayedCardData(playedBottom) || playedBottom.card}
                      faceDown={isCardFaceDownForViewer(playedBottom)}
                      badge={getPlayedCardBadge(playedBottom)}
                      onClick={() => handlePlayedCardClick(playedBottom)}
                      size="sm"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Left played card */}
            <div className="absolute left-1 sm:left-2">
              <AnimatePresence mode="popLayout">
                {playedLeft && (
                  <motion.div
                    key={`played_left_${playedLeft.card.id}_${playedLeft.playedAt || ''}`}
                    initial={{ x: -20, opacity: 0, scale: 0.9 }}
                    animate={{ x: 0, opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{ duration: 0.2 }}
                    className={
                      isShowingPreviousTrick && playedLeft.playerId === lastTrickWinnerPlayerId
                        ? 'ring-2 ring-amber-400 rounded-lg shadow-glow-gold scale-105 z-10'
                        : ''
                    }
                  >
                    <PlayingCard
                      card={getPlayedCardData(playedLeft) || playedLeft.card}
                      faceDown={isCardFaceDownForViewer(playedLeft)}
                      badge={getPlayedCardBadge(playedLeft)}
                      onClick={() => handlePlayedCardClick(playedLeft)}
                      size="sm"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Right played card */}
            <div className="absolute right-1 sm:right-2">
              <AnimatePresence mode="popLayout">
                {playedRight && (
                  <motion.div
                    key={`played_right_${playedRight.card.id}_${playedRight.playedAt || ''}`}
                    initial={{ x: 20, opacity: 0, scale: 0.9 }}
                    animate={{ x: 0, opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{ duration: 0.2 }}
                    className={
                      isShowingPreviousTrick && playedRight.playerId === lastTrickWinnerPlayerId
                        ? 'ring-2 ring-amber-400 rounded-lg shadow-glow-gold scale-105 z-10'
                        : ''
                    }
                  >
                    <PlayingCard
                      card={getPlayedCardData(playedRight) || playedRight.card}
                      faceDown={isCardFaceDownForViewer(playedRight)}
                      badge={getPlayedCardBadge(playedRight)}
                      onClick={() => handlePlayedCardClick(playedRight)}
                      size="sm"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* --- In-Game Modals & Action Strips --- */}
        {/* Opponent Card Inspection Banner for Defending Team */}
        <AnimatePresence>
          {faceDownLeadPending && isDefendingTeam && (() => {
            const defendingPartner = players.find((p) => p.team === myPlayer.team && p.id !== myPlayerId);
            const myChallengeVote = publicState.faceDownChallengeVotes?.[myPlayerId];
            const partnerChallengeVote = defendingPartner ? publicState.faceDownChallengeVotes?.[defendingPartner.id] : null;

            return (
              <motion.div
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                className="absolute inset-x-2 sm:inset-x-8 top-8 sm:top-12 z-40 bg-slate-950/95 border-2 border-amber-500/90 rounded-2xl p-3 sm:p-4 shadow-2xl backdrop-blur-md max-w-2xl mx-auto flex flex-col items-center"
              >
                {/* Banner Title & Description */}
                <div className="text-center mb-2">
                  <div className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-500/10 border border-amber-500/30 rounded-full mb-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[10px] sm:text-[11px] font-bold text-amber-300 uppercase tracking-wider">
                      Face-Down Challenge
                    </span>
                  </div>
                  <h3 className="text-xs sm:text-sm font-cinzel font-black text-amber-300">
                    {faceDownCaller?.name} declared <span className="text-white">{trumpSuit} ({trumpMode === 'BWINJI' ? 'BWINJI' : 'Open Rung'})</span> with a face-down card.
                  </h3>
                </div>

                {/* Partner Vote Announcement Banner */}
                {partnerChallengeVote === 'SURRENDER' && myChallengeVote !== 'SURRENDER' && (
                  <div className="w-full flex items-center gap-2 p-2 sm:p-2.5 bg-rose-950/80 border-2 border-rose-500/70 rounded-xl text-xs sm:text-sm text-rose-200 mb-2.5 shadow-md animate-pulse">
                    <Flag className="w-4 h-4 text-rose-400 flex-shrink-0" />
                    <span>
                      📢 <strong className="text-white">{defendingPartner?.name}</strong> has voted to <strong>Surrender</strong>! Do you want to surrender or accept the challenge?
                    </span>
                  </div>
                )}

                {partnerChallengeVote === 'ACCEPT' && myChallengeVote !== 'ACCEPT' && (
                  <div className="w-full flex items-center gap-2 p-2 sm:p-2.5 bg-emerald-950/80 border-2 border-emerald-500/70 rounded-xl text-xs sm:text-sm text-emerald-200 mb-2.5 shadow-md animate-pulse">
                    <Play className="w-4 h-4 text-emerald-400 flex-shrink-0 fill-emerald-400" />
                    <span>
                      📢 <strong className="text-white">{defendingPartner?.name}</strong> has voted to <strong>Accept the Challenge</strong>! Do you want to accept or surrender?
                    </span>
                  </div>
                )}

                {/* My Vote Confirmation State */}
                {myChallengeVote && (
                  <div className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-slate-900/90 border border-slate-700 rounded-xl text-xs text-amber-300 mb-2.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    <span>
                      You voted to <strong>{myChallengeVote === 'ACCEPT' ? 'Accept Challenge' : 'Surrender'}</strong>. Waiting for {defendingPartner?.name || 'partner'} to confirm...
                    </span>
                  </div>
                )}

                {/* Action buttons: Inspect Partner, Accept Challenge, Surrender */}
                <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                  <button
                    onClick={() => {
                      sound.playCardSlide();
                      if (onToggleInspectPartnerCards) {
                        onToggleInspectPartnerCards();
                      } else {
                        setShowPartnerInspection(!showPartnerInspection);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition shadow cursor-pointer ${isInspectingPartnerCards || (showPartnerInspection && !onToggleInspectPartnerCards)
                        ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-glow-gold'
                        : 'bg-slate-900 hover:bg-slate-800 text-amber-300 border-amber-500/50'
                      }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    {isInspectingPartnerCards || (showPartnerInspection && !onToggleInspectPartnerCards)
                      ? "Return Partner Cards"
                      : "Inspect Partner's Cards"}
                  </button>

                  <button
                    onClick={() => {
                      sound.playCardPlace();
                      if (onRespondToFaceDownRung) onRespondToFaceDownRung(true);
                    }}
                    className={`px-4 py-1.5 rounded-xl font-cinzel font-black text-xs sm:text-sm flex items-center gap-1.5 transition cursor-pointer shadow-glow-gold ${
                      myChallengeVote === 'ACCEPT'
                        ? 'bg-emerald-600 text-white ring-2 ring-emerald-300'
                        : partnerChallengeVote === 'ACCEPT'
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 text-slate-950 ring-2 ring-emerald-400 animate-pulse'
                        : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 text-slate-950'
                    }`}
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    {partnerChallengeVote === 'ACCEPT'
                      ? 'Confirm Accept Challenge'
                      : myChallengeVote === 'ACCEPT'
                      ? '✓ Voted Accept'
                      : 'Accept Challenge'}
                  </button>

                  <button
                    onClick={() => {
                      sound.playCardPlace();
                      if (onRespondToFaceDownRung) onRespondToFaceDownRung(false);
                    }}
                    className={`px-4 py-1.5 rounded-xl font-cinzel font-bold text-xs sm:text-sm border flex items-center gap-1.5 transition cursor-pointer ${
                      myChallengeVote === 'SURRENDER'
                        ? 'bg-red-800 text-white border-red-400 ring-2 ring-red-400'
                        : partnerChallengeVote === 'SURRENDER'
                        ? 'bg-red-950 hover:bg-red-900 text-red-100 border-red-500 ring-2 ring-red-400 animate-pulse'
                        : 'bg-red-950/90 hover:bg-red-900 text-red-200 border-red-500/50'
                    }`}
                  >
                    <Flag className="w-3.5 h-3.5" />
                    {partnerChallengeVote === 'SURRENDER'
                      ? 'Confirm Surrender'
                      : myChallengeVote === 'SURRENDER'
                      ? '✓ Voted Surrender'
                      : 'Surrender'}
                  </button>
                </div>

                {/* Minimal Partner Hand Inspection Window */}
                <AnimatePresence>
                  {Boolean(isInspectingPartnerCards || (showPartnerInspection && !onToggleInspectPartnerCards)) && partnerHand && partnerHand.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="w-full flex flex-col items-center mt-3 pt-2.5 border-t border-slate-800"
                    >
                      <div className="w-full flex items-center justify-center px-2 mb-1.5">
                        <div className="text-[11px] sm:text-xs font-bold text-amber-300 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-amber-400" />
                          <span>Partner's Cards:</span>
                        </div>
                      </div>
                      <div
                        className="flex justify-center -space-x-1.5 sm:-space-x-1 px-3 py-2 overflow-x-auto max-w-full overflow-y-visible"
                        style={{ minHeight: '105px' }}
                      >
                        {partnerHand.map((card) => (
                          <div
                            key={card.id}
                            className="hover:-translate-y-2 hover:z-30 hover:scale-105 transition-all duration-150 relative cursor-default"
                          >
                            <PlayingCard card={card} size="sm" />
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* Attacking Team Status Banner during Face-Down Challenge */}
        <AnimatePresence>
          {faceDownLeadPending && isAttackingTeam && (() => {
            const defendingPlayers = players.filter((p) => p.team !== myPlayer.team);
            const votes = publicState.faceDownChallengeVotes || {};

            return (
              <motion.div
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                className="absolute inset-x-4 top-10 sm:top-14 z-40 p-3 sm:p-4 bg-slate-950/95 border-2 border-purple-400/90 rounded-2xl shadow-2xl text-center max-w-lg mx-auto backdrop-blur-md"
              >
                <div className="text-purple-300 font-cinzel font-black text-xs sm:text-sm mb-1 flex items-center justify-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  {faceDownCaller?.id === myPlayerId
                    ? `You declared ${trumpSuit} (${trumpMode === 'BWINJI' ? 'Bwinji' : 'Open Rung'}) with a face-down card!`
                    : `${faceDownCaller?.name} declared ${trumpSuit} (${trumpMode === 'BWINJI' ? 'Bwinji' : 'Open Rung'}) with a face-down card!`}
                </div>
                <p className="text-[11px] sm:text-xs text-slate-300 mb-2">
                  {isPeekingFaceDownCard ? (
                    <span className="text-emerald-400 font-semibold">
                      👁 Peeking: {teammateFaceDownCard?.rank} of {teammateFaceDownCard?.suit} (Click card to hide).
                    </span>
                  ) : (
                    <span>
                      👉 <strong className="text-amber-300">Click the face-down card</strong> to peek at it.
                    </span>
                  )}
                </p>
                <div className="inline-flex flex-wrap items-center justify-center gap-2 text-[10px] sm:text-xs text-amber-300 bg-amber-950/80 px-3 py-1 rounded-xl border border-amber-500/50">
                  <span className="font-bold flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
                    Opponents deciding:
                  </span>
                  {defendingPlayers.map((dp) => {
                    const v = votes[dp.id];
                    return (
                      <span key={dp.id} className="px-1.5 py-0.5 rounded bg-slate-900 text-slate-200 border border-slate-700">
                        {dp.name}: {v === 'ACCEPT' ? '✓ Accepted' : v === 'SURRENDER' ? '✗ Surrender' : 'Deciding...'}
                      </span>
                    );
                  })}
                </div>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* Open Rung Selection Notification Banner for other players */}
        <AnimatePresence>
          {Boolean(
            publicState.pendingOpenRungSuit &&
            publicState.pendingOpenRungPlayerId &&
            publicState.pendingOpenRungPlayerId !== myPlayerId
          ) && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="absolute inset-x-4 top-14 z-40 p-4 bg-slate-950/95 border-2 border-amber-400 rounded-2xl shadow-2xl text-center max-w-md mx-auto backdrop-blur-md"
              >
                <div className="text-amber-300 font-cinzel font-black text-sm sm:text-base mb-2 flex items-center justify-center gap-2">
                  <Megaphone className="w-4 h-4 text-amber-400" />
                  {players.find((p) => p.id === publicState.pendingOpenRungPlayerId)?.name || 'A player'} has declared {publicState.pendingOpenRungSuit} Rung
                </div>
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-slate-900/90 border border-slate-700 rounded-xl text-xs text-amber-300 font-semibold animate-pulse">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                  Waiting for {players.find((p) => p.id === publicState.pendingOpenRungPlayerId)?.name || 'player'} to play the card...
                </div>
              </motion.div>
            )}
        </AnimatePresence>

        {/* Trump Reveal Request Notification Modal / Banner for all players */}
        <AnimatePresence>
          {isTrumpRevealPending && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="absolute inset-x-4 top-14 z-40 p-4 bg-slate-950/95 border-2 border-yellow-400 rounded-2xl shadow-2xl text-center max-w-md mx-auto backdrop-blur-md"
            >
              <div className="text-amber-300 font-cinzel font-black text-sm sm:text-base mb-3 flex items-center justify-center gap-2">
                <Eye className="w-5 h-5 text-amber-400" /> {trumpRequester?.name || 'Opponent'} Asked to Reveal Rung
              </div>

              {canShowTrump ? (
                <button
                  onClick={() => {
                    sound.playTrumpReveal();
                    if (onShowTrumpCard) onShowTrumpCard();
                  }}
                  className="px-6 py-2.5 bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600 hover:from-amber-300 text-slate-950 font-cinzel font-black text-xs sm:text-sm rounded-xl shadow-glow-gold border-2 border-yellow-200 cursor-pointer animate-pulse"
                >
                  🎴 Show Secret Rung Card
                </button>
              ) : (
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900/90 border border-slate-700 rounded-xl text-xs text-amber-300 font-semibold animate-pulse">
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                  Waiting for {rungCaller?.name || 'Caller'} to reveal the Rung...
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Trump Revealed Paused Banner (Inspection State for all players) */}
        <AnimatePresence>
          {isRungRevealPaused && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm pointer-events-auto"
            >
              <motion.div
                initial={{ scale: 0.9, y: 10 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 10 }}
                className="bg-slate-950/95 border-2 border-amber-400/90 rounded-2xl p-4 sm:p-6 shadow-2xl text-center max-w-xs sm:max-w-sm w-full flex flex-col items-center"
              >
                <div className="text-amber-300 font-cinzel font-black text-base sm:text-lg mb-3 flex items-center justify-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400" /> Rung Revealed
                </div>
                <div className="flex justify-center my-2 p-2 bg-slate-900/80 rounded-xl border border-amber-500/40 shadow-inner">
                  {revealedTrumpCard ? (
                    <PlayingCard card={revealedTrumpCard} size="md" />
                  ) : trumpSuit ? (
                    <RungSuitCard suit={trumpSuit} size="md" />
                  ) : null}
                </div>
                <div className="text-xs text-slate-300 mt-2 mb-3">
                  {!isMyTurn && (
                    <span>Waiting for {players.find((p) => p.id === currentTurnPlayerId)?.name || 'turn player'} to resume...</span>
                  )}
                </div>
                {isMyTurn && onResumeAfterTrumpReveal && (
                  <button
                    onClick={() => {
                      sound.playCardSlide();
                      onResumeAfterTrumpReveal();
                    }}
                    className="px-6 py-2 bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 text-slate-950 font-cinzel font-black text-xs sm:text-sm rounded-xl shadow-glow-gold cursor-pointer"
                  >
                    Continue Play
                  </button>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* --- Bottom Area: Private Player Hand --- */}
      <footer className="z-20 flex flex-col items-center">
        {/* Trick 1 Bwinji Lead Control Banner (Lead Face-Up or Face-Down Challenge) */}
        {isBwinjiCallerLead && (
          <div className="mb-2 px-3 sm:px-4 py-2 bg-slate-950/95 border-2 border-purple-400/90 rounded-2xl shadow-glow-gold flex flex-wrap items-center justify-center gap-2 sm:gap-3 max-w-2xl">
            <div className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
              <Megaphone className="w-3.5 h-3.5 text-purple-400" />
              <span>
                Bwinji Rung: <strong className="text-white">{trumpSuit} {trumpSuit && suitSymbols[trumpSuit]}</strong>
              </span>
              <span className="text-slate-400 mx-1">|</span>
              {selectedLeadCard ? (
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Selected Lead: {selectedLeadCard.rank} of {selectedLeadCard.suit}
                </span>
              ) : (
                <span className="text-purple-200/90 animate-pulse">
                  👉 Click a card from your hand below to lead
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                disabled={!selectedLeadCardId}
                onClick={() => {
                  if (selectedLeadCardId && onDeclareBwinjiLead) {
                    sound.playCardSlide();
                    onDeclareBwinjiLead(selectedLeadCardId, false);
                    setSelectedLeadCardId(null);
                  }
                }}
                className={`px-3 py-1 rounded-lg font-bold text-xs flex items-center gap-1 transition ${selectedLeadCardId
                    ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 shadow-glow-gold cursor-pointer'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'
                  }`}
              >
                <Eye className="w-3.5 h-3.5" /> Face Up
              </button>

              <button
                disabled={!selectedLeadCardId}
                onClick={() => {
                  if (selectedLeadCardId && onDeclareBwinjiLead) {
                    sound.playCardSlide();
                    onDeclareBwinjiLead(selectedLeadCardId, true);
                    setSelectedLeadCardId(null);
                  }
                }}
                className={`px-3 py-1 rounded-lg font-bold text-xs flex items-center gap-1 transition ${selectedLeadCardId
                    ? 'bg-purple-800 hover:bg-purple-700 text-white shadow cursor-pointer'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'
                  }`}
              >
                <EyeOff className="w-3.5 h-3.5" /> Face Down (Challenge)
              </button>
            </div>
          </div>
        )}

        {/* Trick 1 Open Rung Announcement Control Strip (Drawn from existing hand!) */}
        {canAnnounceOpenRung && (
          <div className="mb-2 px-3 sm:px-4 py-2 bg-slate-950/95 border-2 border-amber-400/90 rounded-2xl shadow-glow-gold flex flex-wrap items-center justify-center gap-2 sm:gap-3 max-w-2xl">
            {!selectedOpenRungSuit ? (
              <>
                <span className="text-[11px] font-cinzel font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Megaphone className="w-3.5 h-3.5 text-amber-400" /> Announce Open Rung:
                </span>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {suitOptions.map(({ suit }) => {
                    const isRed = suit === 'HEARTS' || suit === 'DIAMONDS';
                    return (
                      <button
                        key={suit}
                        onClick={() => {
                          sound.playCardSlide();
                          setSelectedOpenRungSuit(suit);
                          setSelectedLeadCardId(null);
                          if (onSelectOpenRungSuit) onSelectOpenRungSuit(suit);
                        }}
                        className="py-1.5 px-3 rounded-xl border transition-all cursor-pointer shadow-md bg-gradient-to-b from-white via-slate-50 to-slate-100 border-slate-300 hover:border-amber-400 hover:shadow-glow-gold hover:-translate-y-0.5 active:scale-95 flex items-center justify-center"
                        title={`Announce Open Rung ${suit}`}
                      >
                        <span className={`${isRed ? 'text-red-600' : 'text-slate-950'} flex items-center justify-center`}>
                          <SuitIcon suit={suit} className="w-5 h-5 sm:w-6 sm:h-6" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 w-full">
                <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                  <Megaphone className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    Rung: <strong className="text-white">{selectedOpenRungSuit} {suitSymbols[selectedOpenRungSuit]}</strong>
                  </span>
                  <span className="text-slate-400 mx-1">|</span>
                  {selectedLeadCard ? (
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Selected Lead: {selectedLeadCard.rank} of {selectedLeadCard.suit}
                    </span>
                  ) : (
                    <span className="text-amber-200/90 animate-pulse">
                      👉 Click a card from your hand below to lead
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    disabled={!selectedLeadCardId}
                    onClick={() => handleOpenRungSubmit(false)}
                    className={`px-3 py-1 rounded-lg font-bold text-xs flex items-center gap-1 transition ${selectedLeadCardId
                        ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 shadow-glow-gold cursor-pointer'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'
                      }`}
                  >
                    <Eye className="w-3.5 h-3.5" /> Face Up
                  </button>

                  <button
                    disabled={!selectedLeadCardId}
                    onClick={() => handleOpenRungSubmit(true)}
                    className={`px-3 py-1 rounded-lg font-bold text-xs flex items-center gap-1 transition ${selectedLeadCardId
                        ? 'bg-amber-700 hover:bg-amber-600 text-white shadow cursor-pointer'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'
                      }`}
                  >
                    <EyeOff className="w-3.5 h-3.5" /> Face Down
                  </button>

                  <button
                    onClick={() => {
                      setSelectedOpenRungSuit(null);
                      setSelectedLeadCardId(null);
                      if (onSelectOpenRungSuit) onSelectOpenRungSuit(null);
                    }}
                    className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
                    title="Cancel Announcement"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Ask to Reveal Rung Button (When void in lead suit & Rung unrevealed) */}
        {canRequestRungReveal && onRequestTrumpReveal && (
          <motion.button
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={() => {
              sound.playTrumpReveal();
              onRequestTrumpReveal();
            }}
            className="mb-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-cinzel font-black text-xs sm:text-sm rounded-xl shadow-glow-gold flex items-center gap-2 border-2 border-yellow-200 cursor-pointer animate-pulse"
          >
            <Eye className="w-4 h-4" /> Ask to Reveal Rung
          </motion.button>
        )}

        {/* Player Badge & Hand Container */}
        <div className="w-full max-w-5xl flex flex-col items-center">
          {bottomPlayer && (
            <div className="mb-0.5 sm:mb-1 flex">
              <PlayerBadge
                player={bottomPlayer}
                isCurrentTurn={bottomPlayer.id === currentTurnPlayerId}
                isDealer={bottomPlayer.id === dealer?.id}
                isTrumpCaller={bottomPlayer.id === rungCaller?.id}
                isPrevWinner={bottomPlayer.id === lastTrickWinnerPlayerId}
                position="bottom"
              />
            </div>
          )}

          {/* Interactive Hand Cards + Caller Hidden Cards + Dedicated Separate Rung Slot */}
          <div className="flex items-start justify-center gap-1.5 sm:gap-3 max-w-full">
            {/* Rung Caller Hidden / Revealed Cards Panel (Left of Hand Cards, Top-Aligned) */}
            {faceDownCallerCards && faceDownCallerCards.length > 0 && !isRungRevealPaused && (
              <div className="flex flex-col items-center flex-shrink-0 p-1 sm:p-2 bg-slate-950/90 border-2 border-amber-500/60 rounded-xl backdrop-blur-md shadow-2xl mr-1 sm:mr-2">
                <div className="text-[9px] sm:text-[10px] font-cinzel font-bold text-amber-300 mb-1 flex items-center gap-1">
                  <EyeOff className="w-3 h-3 text-amber-400" />
                  <span>{rungCaller?.name || 'Caller'}'s Hidden ({faceDownCallerCards.length})</span>
                </div>
                <div className="flex gap-1 sm:gap-1.5">
                  {faceDownCallerCards.map((fd, i) => (
                    <div key={fd.id || i} className="flex flex-col items-center hover:z-30 hover:-translate-y-1 transition-transform">
                      {fd.isRevealed ? (
                        <PlayingCard card={fd.card} size="xs" badge={`T${fd.trickNumber}`} />
                      ) : (
                        <PlayingCard faceDown size="xs" badge={`T${fd.trickNumber}`} />
                      )}
                      <span className="text-[8px] text-amber-300/80 font-semibold mt-0.5">
                        {fd.isRevealed ? 'Revealed' : 'Face-Down'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mobile 2-Row Layout for Hand Cards (< sm screens) */}
            <div className="flex sm:hidden flex-col items-center gap-1 max-w-full overflow-x-auto py-0.5">
              {myHand.length > 6 ? (
                <>
                  <div className="flex justify-center -space-x-2 px-1">
                    {myHand.slice(0, Math.ceil(myHand.length / 2)).map((card) => {
                      const isSelectingLead = (Boolean(selectedOpenRungSuit) && canAnnounceOpenRung) || isBwinjiCallerLead;
                      const isSelectedForLead = selectedLeadCardId === card.id;
                      const isPlayable =
                        !isSelectingLead &&
                        !faceDownLeadPending &&
                        !isRungRevealPaused &&
                        currentTurnPlayerId === myPlayerId &&
                        legalPlayableCardIds.includes(card.id);

                      return (
                        <div
                          key={card.id}
                          className={`relative transition-all duration-200 hover:z-30 ${isSelectedForLead
                              ? 'scale-108 -translate-y-1.5 ring-2 ring-amber-400 rounded-md z-10 shadow-glow-gold'
                              : isSelectingLead
                                ? 'hover:scale-104 hover:-translate-y-1 cursor-pointer'
                                : ''
                            }`}
                        >
                          <PlayingCard
                            card={card}
                            isPlayable={isPlayable || isSelectingLead}
                            isSelected={isSelectedForLead}
                            onClick={() => {
                              if (isSelectingLead) {
                                sound.playCardSlide();
                                setSelectedLeadCardId(card.id);
                              } else if (isMyTurn && !faceDownLeadPending && !isRungRevealPaused) {
                                onPlayCard(card.id);
                              }
                            }}
                            size="sm"
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-center -space-x-2 px-1">
                    {myHand.slice(Math.ceil(myHand.length / 2)).map((card) => {
                      const isSelectingLead = (Boolean(selectedOpenRungSuit) && canAnnounceOpenRung) || isBwinjiCallerLead;
                      const isSelectedForLead = selectedLeadCardId === card.id;
                      const isPlayable =
                        !isSelectingLead &&
                        !faceDownLeadPending &&
                        !isRungRevealPaused &&
                        currentTurnPlayerId === myPlayerId &&
                        legalPlayableCardIds.includes(card.id);

                      return (
                        <div
                          key={card.id}
                          className={`relative transition-all duration-200 hover:z-30 ${isSelectedForLead
                              ? 'scale-108 -translate-y-1.5 ring-2 ring-amber-400 rounded-md z-10 shadow-glow-gold'
                              : isSelectingLead
                                ? 'hover:scale-104 hover:-translate-y-1 cursor-pointer'
                                : ''
                            }`}
                        >
                          <PlayingCard
                            card={card}
                            isPlayable={isPlayable || isSelectingLead}
                            isSelected={isSelectedForLead}
                            onClick={() => {
                              if (isSelectingLead) {
                                sound.playCardSlide();
                                setSelectedLeadCardId(card.id);
                              } else if (isMyTurn && !faceDownLeadPending && !isRungRevealPaused) {
                                onPlayCard(card.id);
                              }
                            }}
                            size="sm"
                          />
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="flex justify-center -space-x-2 px-1">
                  {myHand.map((card) => {
                    const isSelectingLead = (Boolean(selectedOpenRungSuit) && canAnnounceOpenRung) || isBwinjiCallerLead;
                    const isSelectedForLead = selectedLeadCardId === card.id;
                    const isPlayable =
                      !isSelectingLead &&
                      !faceDownLeadPending &&
                      !isRungRevealPaused &&
                      currentTurnPlayerId === myPlayerId &&
                      legalPlayableCardIds.includes(card.id);

                    return (
                      <div
                        key={card.id}
                        className={`relative transition-all duration-200 hover:z-30 ${isSelectedForLead
                            ? 'scale-108 -translate-y-1.5 ring-2 ring-amber-400 rounded-md z-10 shadow-glow-gold'
                            : isSelectingLead
                              ? 'hover:scale-104 hover:-translate-y-1 cursor-pointer'
                              : ''
                          }`}
                      >
                        <PlayingCard
                          card={card}
                          isPlayable={isPlayable || isSelectingLead}
                          isSelected={isSelectedForLead}
                          onClick={() => {
                            if (isSelectingLead) {
                              sound.playCardSlide();
                              setSelectedLeadCardId(card.id);
                            } else if (isMyTurn && !faceDownLeadPending && !isRungRevealPaused) {
                              onPlayCard(card.id);
                            }
                          }}
                          size="sm"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Desktop Single-Row Layout for Hand Cards (>= sm screens) */}
            <div
              className="hidden sm:flex justify-center -space-x-3.5 sm:-space-x-5 px-1 sm:px-3 overflow-x-auto max-w-full overflow-y-visible"
              style={{ paddingTop: '16px', paddingBottom: '12px', minHeight: '110px' }}
            >
              {myHand.map((card) => {
                const isSelectingLead = (Boolean(selectedOpenRungSuit) && canAnnounceOpenRung) || isBwinjiCallerLead;
                const isSelectedForLead = selectedLeadCardId === card.id;
                const isPlayable =
                  !isSelectingLead &&
                  !faceDownLeadPending &&
                  !isRungRevealPaused &&
                  currentTurnPlayerId === myPlayerId &&
                  legalPlayableCardIds.includes(card.id);

                return (
                  <div
                    key={card.id}
                    className={`relative transition-all duration-200 hover:z-30 ${isSelectedForLead
                        ? 'scale-108 -translate-y-2 ring-2 ring-amber-400 rounded-md z-10 shadow-glow-gold'
                        : isSelectingLead
                          ? 'hover:scale-104 hover:-translate-y-1 cursor-pointer'
                          : ''
                      }`}
                  >
                    <PlayingCard
                      card={card}
                      isPlayable={isPlayable || isSelectingLead}
                      isSelected={isSelectedForLead}
                      onClick={() => {
                        if (isSelectingLead) {
                          sound.playCardSlide();
                          setSelectedLeadCardId(card.id);
                        } else if (isMyTurn && !faceDownLeadPending && !isRungRevealPaused) {
                          onPlayCard(card.id);
                        }
                      }}
                      size="sm"
                    />
                  </div>
                );
              })}
            </div>

            {/* Separate Dedicated Rung Card Slot */}
            {(myTrumpCard || (trumpCallerPlayerId === myPlayerId && (trumpCardPlaced || isTrumpRevealed))) && (
              <div className="flex flex-col items-center flex-shrink-0 p-1 sm:p-1.5 bg-amber-950/50 border-2 border-amber-400/90 rounded-xl shadow-glow-gold ml-1 sm:ml-2">
                <div className="text-[9px] sm:text-[10px] font-cinzel font-bold text-amber-300 uppercase tracking-wider mb-0.5 sm:mb-1 flex items-center gap-1">
                  <Crown className="w-3 h-3 text-amber-400 fill-amber-400" /> Rung
                </div>
                {myTrumpCard ? (
                  <div className="transition-transform duration-200">
                    <PlayingCard
                      card={myTrumpCard}
                      faceDown={false}
                      isPlayable={!faceDownLeadPending && !isRungRevealPaused && (!selectedOpenRungSuit || !canAnnounceOpenRung) && !isBwinjiCallerLead && isMyTrumpCardPlayable}
                      onClick={() => {
                        if (!faceDownLeadPending && !isRungRevealPaused && (!selectedOpenRungSuit || !canAnnounceOpenRung) && !isBwinjiCallerLead && isMyTrumpCardPlayable) {
                          onPlayCard(myTrumpCard.id);
                        }
                      }}
                      size="sm"
                    />
                  </div>
                ) : revealedTrumpCard ? (
                  <div className="opacity-90">
                    <PlayingCard
                      card={revealedTrumpCard}
                      faceDown={false}
                      size="sm"
                    />
                  </div>
                ) : trumpSuit ? (
                  <RungSuitCard suit={trumpSuit} size="sm" />
                ) : (
                  <div className="w-12 sm:w-16 aspect-[5/7] rounded-md border border-dashed border-amber-500/40 flex flex-col items-center justify-center text-[9px] text-amber-400/60 font-semibold p-1 text-center">
                    Played
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};

// Sub-component for Player Info Badge
interface PlayerBadgeProps {
  player: Player;
  isCurrentTurn: boolean;
  isDealer: boolean;
  isTrumpCaller: boolean;
  isPrevWinner?: boolean;
  position: 'top' | 'bottom' | 'left' | 'right';
}

const PlayerBadge: React.FC<PlayerBadgeProps> = ({
  player,
  isCurrentTurn,
  isDealer,
  isTrumpCaller,
  isPrevWinner,
  position,
}) => {
  const isSide = position === 'left' || position === 'right';
  const firstName = player.name.trim().split(' ')[0] || player.name;

  if (isSide) {
    return (
      <div
        className={`px-1 py-1.5 rounded-lg border bg-slate-950/90 flex flex-col items-center justify-center min-w-[22px] transition-all shadow-md ${isCurrentTurn
            ? 'bg-amber-950/95 border-amber-400 shadow-glow-gold scale-105 z-20 animate-pulse'
            : isPrevWinner
              ? 'border-amber-400/80'
              : 'border-slate-700'
          }`}
      >
        {/* Badges container at the top */}
        {(isDealer || isTrumpCaller || isPrevWinner) && (
          <div className="flex flex-col items-center gap-0.5 mb-1">
            {isDealer && (
              <span className="w-3.5 h-3.5 rounded-full bg-amber-500 text-slate-950 font-black text-[8px] flex items-center justify-center shadow" title="Dealer">
                D
              </span>
            )}
            {isTrumpCaller && (
              <span title="Rung Caller" className="flex-shrink-0">
                <Crown className="w-3 h-3 text-amber-400 fill-amber-400" />
              </span>
            )}
            {isPrevWinner && (
              <span
                className="w-3.5 h-3.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 font-black text-[8px] flex items-center justify-center shadow-glow-gold"
                title="Won previous turn (+1 trick)"
              >
                1
              </span>
            )}
          </div>
        )}

        {/* Vertical First Name: First letter at top, last letter at bottom */}
        <div className="flex flex-col items-center leading-none select-none">
          {firstName.split('').map((char, idx) => (
            <span
              key={idx}
              className="text-[10px] sm:text-[11px] font-extrabold text-white uppercase leading-[11px] sm:leading-[12px] tracking-normal"
            >
              {char}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`px-2.5 sm:px-3 py-1 rounded-xl border flex items-center gap-1.5 transition-all shadow ${isCurrentTurn
          ? 'bg-amber-950/90 border-amber-400 shadow-glow-gold scale-105 z-20 animate-pulse'
          : isPrevWinner
            ? 'bg-slate-900/90 border-amber-400/70'
            : 'bg-slate-900/80 border-slate-700'
        }`}
    >
      <span className="text-[11px] sm:text-xs font-bold text-white truncate max-w-[80px] sm:max-w-[120px]">
        {firstName}
      </span>
      {isDealer && (
        <span className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-amber-500 text-slate-950 font-black text-[8px] sm:text-[9px] flex items-center justify-center shadow flex-shrink-0" title="Dealer">
          D
        </span>
      )}
      {isTrumpCaller && (
        <span title="Rung Caller" className="flex-shrink-0">
          <Crown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400 fill-amber-400" />
        </span>
      )}
      {isPrevWinner && (
        <span
          className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 font-black text-[8px] sm:text-[9px] flex items-center justify-center shadow-glow-gold flex-shrink-0"
          title="Won previous turn (+1 trick)"
        >
          1
        </span>
      )}
    </div>
  );
};
