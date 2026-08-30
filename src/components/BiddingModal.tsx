import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, Player, Suit, TrumpMode } from '../../shared/types';
import { PlayingCard, SuitIcon, suitColors } from './PlayingCard';
import { Crown, Megaphone, SkipForward, AlertCircle, Sparkles, CheckCircle2, Lock } from 'lucide-react';
import { sound } from '../utils/sound';

interface BiddingModalProps {
  myPlayerId: string;
  biddingTurnPlayerId: string | null;
  biddingPassCount: number;
  my5Cards: Card[];
  players: Player[];
  trumpMode?: TrumpMode | null;
  trumpCallerPlayerId?: string | null;
  onSubmitBid: (action: 'SELECT_CARD_TRUMP' | 'BWINJI' | 'PASS', cardIdOrSuit?: string, suit?: Suit) => void;
  statusMessage: string;
}

export const BiddingModal: React.FC<BiddingModalProps> = ({
  myPlayerId,
  biddingTurnPlayerId,
  biddingPassCount,
  my5Cards,
  players,
  trumpMode,
  trumpCallerPlayerId,
  onSubmitBid,
  statusMessage,
}) => {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedBwinjiSuit, setSelectedBwinjiSuit] = useState<Suit | null>(null);

  const isMyTurn = biddingTurnPlayerId === myPlayerId;
  const isRungAlreadyChosen = trumpMode === 'CLOSE_TRUMP';
  const isDealerForced = biddingPassCount === 3 && isMyTurn && !isRungAlreadyChosen;
  const currentBidder = players.find((p) => p.id === biddingTurnPlayerId);
  const rungCaller = players.find((p) => p.id === trumpCallerPlayerId);

  const selectedCard = my5Cards.find((c) => c.id === selectedCardId);

  const handleSelectCard = (card: Card) => {
    if (!isMyTurn || isRungAlreadyChosen) return;
    sound.playCardSlide();
    setSelectedCardId(card.id);
    setSelectedBwinjiSuit(null);
  };

  const handleConfirmCloseTrump = () => {
    if (!isMyTurn || !selectedCardId || isRungAlreadyChosen) return;
    sound.playTrumpReveal();
    onSubmitBid('SELECT_CARD_TRUMP', selectedCardId);
  };

  const handleConfirmBwinji = (suit: Suit) => {
    if (!isMyTurn) return;
    sound.playTrumpReveal();
    onSubmitBid('BWINJI', suit, suit);
  };

  const handlePass = () => {
    if (!isMyTurn || isDealerForced) return;
    sound.playCardSlide();
    onSubmitBid('PASS');
  };

  const suitOptions: { suit: Suit; symbol: string }[] = [
    { suit: 'SPADES', symbol: '♠' },
    { suit: 'CLUBS', symbol: '♣' },
    { suit: 'HEARTS', symbol: '♥' },
    { suit: 'DIAMONDS', symbol: '♦' },
  ];

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-xl bg-gradient-to-b from-slate-900 via-slate-900 to-felt-dark border-2 border-amber-500/40 rounded-2xl p-4 sm:p-5 shadow-2xl relative overflow-hidden"
      >
        {/* Header */}
        <div className="text-center mb-3">
          <h2 className="text-xl sm:text-2xl font-cinzel font-black gold-gradient-text mt-1">
            {isRungAlreadyChosen
              ? isMyTurn
                ? 'CALL BWINJI OR PASS'
                : 'BWINJI CHALLENGE'
              : isMyTurn
              ? 'SELECT YOUR RUNG CARD OR BWINJI'
              : 'RUNG DECLARATION'}
          </h2>
        </div>

        {/* 5 Cards Rack */}
        <div className="mb-3.5 p-3 bg-felt-dark/90 rounded-xl border border-felt-border shadow-inner">
          <div className="text-[11px] sm:text-xs font-semibold text-amber-300 mb-2 text-center uppercase tracking-wider">
            {isRungAlreadyChosen
              ? 'Your First 5 Cards:'
              : isMyTurn
              ? '👉 Click a card to select it for Secret Rung:'
              : 'Your First 5 Dealt Cards:'}
          </div>
          <div className="flex justify-center items-center gap-2 sm:gap-3 py-1">
            {my5Cards.slice(0, 5).map((card) => {
              const isSelected = selectedCardId === card.id;

              return (
                <div
                  key={card.id}
                  className={`transition-all duration-200 ${
                    isMyTurn && !isRungAlreadyChosen ? 'cursor-pointer' : 'cursor-default'
                  } ${
                    isSelected
                      ? 'scale-110 -translate-y-2 ring-2 ring-amber-400 rounded-lg shadow-glow-gold z-10'
                      : isMyTurn && !isRungAlreadyChosen
                      ? 'hover:scale-105 hover:-translate-y-1'
                      : ''
                  }`}
                >
                  <PlayingCard
                    card={card}
                    size="sm"
                    isSelected={isSelected}
                    onClick={() => handleSelectCard(card)}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {isMyTurn ? (
          <div>
            {/* Rung Already Selected Notice */}
            {isRungAlreadyChosen && (
              <div className="flex items-center gap-2 p-2.5 bg-purple-950/80 border border-purple-500/50 rounded-xl text-xs text-purple-200 mb-3 shadow-md">
                <Megaphone className="w-4 h-4 text-purple-400 flex-shrink-0" />
                <span>
                  <strong>{rungCaller?.name || 'A player'}</strong> selected a Secret Rung Card. You cannot select a Rung card, but you can <strong>Call BWINJI</strong> to override, or <strong>Pass</strong>.
                </span>
              </div>
            )}

            {/* Forced Dealer Declaration Alert */}
            {isDealerForced && (
              <div className="flex items-center gap-2 p-2 bg-amber-950/60 border border-amber-500/40 rounded-lg text-xs text-amber-200 mb-3">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span>
                  First 3 players passed. As Dealer, you must declare a Rung or Bwinji.
                </span>
              </div>
            )}

            {/* Selection Confirmation Prompt */}
            <div className="mb-3 p-2.5 bg-slate-950/60 rounded-xl border border-slate-800 text-center">
              {selectedCard && !isRungAlreadyChosen ? (
                <div className="flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold text-amber-300">
                  <CheckCircle2 className="w-4 h-4 text-amber-400" />
                  <span>
                    Selected Card: <strong className="text-white">{selectedCard.rank} of {selectedCard.suit}</strong> (Suit: <strong className="text-amber-400">{selectedCard.suit}</strong>)
                  </span>
                </div>
              ) : selectedBwinjiSuit ? (
                <div className="flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold text-purple-300">
                  <Megaphone className="w-4 h-4 text-purple-400" />
                  <span>
                    Selected Bwinji Suit: <strong className="text-white">{selectedBwinjiSuit}</strong>
                  </span>
                </div>
              ) : (
                <div className="text-xs text-slate-400 animate-pulse">
                  {isRungAlreadyChosen
                    ? '👉 Choose a Bwinji Suit below to challenge, or click Pass'
                    : '👉 Click a card above for Secret Rung, or choose a Bwinji Suit below'}
                </div>
              )}
            </div>

            {/* Action Section */}
            <div className="flex flex-col gap-2.5 justify-center">
              {/* Option 1: Secret Rung Card (Close Trump) */}
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                {isRungAlreadyChosen ? (
                  <button
                    disabled
                    className="flex-1 py-2.5 px-4 rounded-xl font-cinzel font-bold text-xs sm:text-sm flex items-center justify-center gap-2 bg-slate-800/70 border border-slate-700 text-slate-400 cursor-not-allowed opacity-60"
                  >
                    <Lock className="w-4 h-4 text-slate-400" /> Rung Locked ({rungCaller?.name || 'Caller'})
                  </button>
                ) : (
                  <button
                    disabled={!selectedCardId}
                    onClick={handleConfirmCloseTrump}
                    className={`flex-1 py-3 px-4 rounded-xl font-cinzel font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition ${
                      selectedCardId
                        ? 'bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600 hover:from-amber-300 hover:to-yellow-400 text-slate-950 shadow-glow-gold cursor-pointer scale-102'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'
                    }`}
                  >
                    <Crown className="w-4 h-4 fill-slate-950" /> Confirm Secret Rung Card
                  </button>
                )}

                {!isDealerForced && (
                  <button
                    onClick={handlePass}
                    className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs border border-slate-700 flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                    {isRungAlreadyChosen ? 'Pass (Decline Bwinji)' : `Pass (${biddingPassCount + 1}/3)`}
                  </button>
                )}
              </div>

              {/* Option 2: Declare Bwinji with Suit */}
              <div className="p-3 bg-slate-950/80 rounded-xl border border-purple-500/40">
                <div className="text-xs sm:text-sm font-bold text-purple-300 mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 uppercase tracking-wider text-xs sm:text-sm font-cinzel">
                    <Megaphone className="w-4 h-4 text-purple-400" />
                    {isRungAlreadyChosen ? 'Call BWINJI to Override:' : 'Declare Bwinji'}
                  </span>
                  {selectedBwinjiSuit && (
                    <span className="text-amber-300 font-extrabold text-xs">Active: {selectedBwinjiSuit}</span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {suitOptions.map(({ suit }) => {
                    const isSuitActive = selectedBwinjiSuit === suit;
                    const color = suitColors[suit];
                    return (
                      <button
                        key={suit}
                        onClick={() => {
                          sound.playCardSlide();
                          setSelectedBwinjiSuit(suit);
                          setSelectedCardId(null);
                          handleConfirmBwinji(suit);
                        }}
                        className={`py-3 px-3 rounded-xl font-bold flex items-center justify-center gap-2 border transition-all cursor-pointer shadow-md bg-gradient-to-b from-white via-slate-50 to-slate-100 border-slate-300 hover:border-amber-400 hover:shadow-glow-gold hover:-translate-y-0.5 active:scale-95 text-slate-900 ${
                          isSuitActive
                            ? 'ring-4 ring-amber-400 border-amber-400 shadow-glow-gold scale-102'
                            : ''
                        }`}
                      >
                        <span className={`${color.text} flex items-center justify-center`}>
                          <SuitIcon suit={suit} className="w-6 h-6 sm:w-7 sm:h-7" />
                        </span>
                        <span className="font-cinzel font-black text-xs sm:text-sm text-slate-900 tracking-wider">
                          BWINJI
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-3 bg-slate-800/40 rounded-xl border border-slate-700">
            <div className="text-xs sm:text-sm font-semibold text-white mb-0.5">
              Waiting for <strong>{currentBidder?.name}</strong> {isRungAlreadyChosen ? 'to Call Bwinji or Pass...' : 'to select a Rung Card or Bwinji...'}
            </div>
            <div className="text-[11px] text-slate-400">
              {isRungAlreadyChosen
                ? `Rung established by ${rungCaller?.name || 'Caller'}`
                : `Passes so far: ${biddingPassCount}/3`}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};
