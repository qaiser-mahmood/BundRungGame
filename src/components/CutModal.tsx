import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Player } from '../../shared/types';
import { PlayingCard } from './PlayingCard';
import { Scissors, Shuffle, CheckCircle, Hand } from 'lucide-react';
import { sound } from '../utils/sound';

interface CutModalProps {
  players: Player[];
  dealerPlayerIndex: number;
  cutOfferPlayerId: string | null;
  myPlayerId: string;
  isCutPhase: boolean;
  onShuffle: () => void;
  onOfferCut: () => void;
  onPerformCut: (cardIndex: number) => void;
  statusMessage: string;
}

export const CutModal: React.FC<CutModalProps> = ({
  players,
  dealerPlayerIndex,
  cutOfferPlayerId,
  myPlayerId,
  isCutPhase,
  onShuffle,
  onOfferCut,
  onPerformCut,
  statusMessage,
}) => {
  const [selectedCutIndex, setSelectedCutIndex] = useState<number | null>(null);
  const [isSwapping, setIsSwapping] = useState(false);
  const [hasShuffled, setHasShuffled] = useState(false);

  const dealer = players[dealerPlayerIndex];
  const isDealer = dealer && dealer.id === myPlayerId;
  const isCutPlayer = cutOfferPlayerId === myPlayerId;
  const cutPlayer = players.find((p) => p.id === cutOfferPlayerId);

  const handleCardClick = (idx: number) => {
    if (!isCutPlayer || isSwapping) return;
    setSelectedCutIndex(idx);
    setIsSwapping(true);
    sound.playCardSlide();

    // Trigger animated cut and lock
    setTimeout(() => {
      onPerformCut(idx);
      setIsSwapping(false);
      setSelectedCutIndex(null);
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-xl bg-slate-900 border-2 border-amber-500/40 rounded-2xl p-6 shadow-2xl text-center relative overflow-hidden"
      >
        {/* Header */}
        <div className="inline-flex items-center gap-1.5 px-3 py-0.5 bg-amber-500/10 border border-amber-500/30 rounded-full mb-2">
          <Scissors className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[10px] sm:text-xs font-bold text-amber-300 uppercase tracking-wider">
            Deck Cut & Shuffle
          </span>
        </div>

        <h3 className="text-xl sm:text-2xl font-cinzel font-black gold-gradient-text mb-1">
          {isCutPhase ? 'CUT THE DECK' : 'DEALER PRE-DEAL'}
        </h3>
        <p className="text-xs sm:text-sm text-slate-300 mb-4">
          {statusMessage}
        </p>

        {/* Dealer Pre-Deal Controls */}
        {!isCutPhase && (
          <div className="flex flex-col items-center gap-3 py-3">
            <div className="flex -space-x-3 justify-center mb-1">
              {[0, 1, 2, 3].map((i) => (
                <PlayingCard key={i} faceDown size="sm" />
              ))}
            </div>

            {isDealer ? (
              <div className="flex flex-col items-center gap-3">
                <div className="text-[11px] text-slate-400">
                  {hasShuffled ? (
                    <span className="text-emerald-400 font-bold">✓ Deck has been shuffled by you</span>
                  ) : (
                    <span>Deck is in natural order. You may shuffle or offer cut directly.</span>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2.5">
                  <button
                    onClick={() => {
                      sound.playShuffle();
                      setHasShuffled(true);
                      onShuffle();
                    }}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 font-semibold rounded-xl text-xs sm:text-sm border border-amber-500/30 flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Shuffle className="w-4 h-4" /> {hasShuffled ? 'Shuffle Again' : 'Shuffle Deck'}
                  </button>

                  <button
                    onClick={() => {
                      sound.playCardSlide();
                      onOfferCut();
                    }}
                    className="px-5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 font-bold rounded-xl text-xs sm:text-sm shadow-glow-gold flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Hand className="w-4 h-4" /> Offer Cut to {players[(dealerPlayerIndex + 1) % 4]?.name}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-xs text-amber-300/80 bg-slate-800/60 px-4 py-2 rounded-lg border border-slate-700">
                Waiting for Dealer (<strong>{dealer?.name}</strong>) to shuffle / offer cut...
              </div>
            )}
          </div>
        )}

        {/* Interactive Deck Cut Pile (Section 4.2) */}
        {isCutPhase && (
          <div className="py-2">
            <div className="text-xs font-semibold text-amber-300 mb-3">
              {isCutPlayer ? (
                <span className="text-amber-400 animate-pulse">
                  👉 Click any card in the deck pile below to cut & swap:
                </span>
              ) : (
                `Waiting for ${cutPlayer?.name} to cut the deck...`
              )}
            </div>

            <div className="relative h-28 flex items-center justify-center my-4">
              <div className="flex -space-x-8 sm:-space-x-10 justify-center">
                {Array.from({ length: 18 }).map((_, idx) => {
                  const cardActualIndex = Math.floor((idx / 18) * 52);
                  const isCutPoint = selectedCutIndex === cardActualIndex;

                  return (
                    <motion.div
                      key={idx}
                      whileHover={isCutPlayer && !isSwapping ? { y: -16, scale: 1.15 } : {}}
                      onClick={() => handleCardClick(cardActualIndex)}
                      className={`relative ${isCutPlayer ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                    >
                      <PlayingCard
                        faceDown
                        size="md"
                        className={isCutPoint ? 'ring-4 ring-emerald-400 -translate-y-4' : ''}
                      />
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {isSwapping && (
              <div className="text-xs font-bold text-emerald-400 animate-pulse flex items-center justify-center gap-1.5 mt-2">
                <CheckCircle className="w-4 h-4" /> Splitting and swapping Top & Bottom piles...
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
};
