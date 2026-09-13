import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, Player } from '../../shared/types';
import { PlayingCard } from './PlayingCard';
import { Crown, Sparkles, RefreshCw, Layers, Scissors } from 'lucide-react';
import { sound } from '../utils/sound';

interface TossModalProps {
  players: Player[];
  myPlayerId: string;
  dealerPlayerIndex: number;
  tossCardsRemaining: number;
  tossDraws: { [playerId: string]: Card };
  tossDrawHistory?: { [playerId: string]: Card[] };
  tossDrawnThisRound?: { [playerId: string]: boolean };
  tossRound?: number;
  tiedPlayerIds: string[];
  isTieBreaker: boolean;
  isTossComplete: boolean;
  onDrawCard: (cardIndex: number) => void;
  onDistributeCards: () => void;
  statusMessage: string;
}

export const TossModal: React.FC<TossModalProps> = ({
  players,
  myPlayerId,
  dealerPlayerIndex,
  tossCardsRemaining,
  tossDraws,
  tossDrawHistory,
  tossDrawnThisRound,
  tossRound = 1,
  tiedPlayerIds,
  isTieBreaker,
  isTossComplete,
  onDrawCard,
  onDistributeCards,
  statusMessage,
}) => {
  const isMyTurnToDraw =
    !isTossComplete &&
    tiedPlayerIds.includes(myPlayerId) &&
    !tossDrawnThisRound?.[myPlayerId];

  const dealer = players[dealerPlayerIndex];
  const isMeDealer = isTossComplete && dealer && dealer.id === myPlayerId;

  const tiedPlayerNames = tiedPlayerIds
    .map((pid) => players.find((p) => p.id === pid)?.name)
    .filter(Boolean)
    .join(' & ');

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-2 sm:p-4 bg-black/35 pointer-events-auto overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-xl bg-gradient-to-b from-slate-900/95 via-slate-900/95 to-felt-dark/95 border-2 border-amber-500/50 rounded-2xl p-4 sm:p-5 shadow-2xl relative overflow-hidden backdrop-blur-md my-auto"
      >
        {/* Header Banner */}
        <div className="text-center mb-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 bg-amber-500/10 border border-amber-500/30 rounded-full mb-1">
            {isTieBreaker ? (
              <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
            ) : (
              <Crown className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span className="text-[10px] sm:text-[11px] font-semibold text-amber-300 uppercase tracking-wider">
              {isTieBreaker
                ? `Tie-Breaker Toss (Round ${tossRound})`
                : isTossComplete
                ? 'Match Toss Complete (Dealer Assigned)'
                : 'Match Toss (Determine Dealer)'}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-cinzel font-black gold-gradient-text">
            {isTieBreaker
              ? 'TIE-BREAKER DRAW'
              : isTossComplete
              ? 'TOSS RESULTS'
              : 'PICK YOUR TOSS CARD'}
          </h2>
          <p className="text-[10px] sm:text-xs text-slate-300">
            {isTieBreaker ? (
              <span>
                Tied players (<strong className="text-amber-400">{tiedPlayerNames}</strong>) must pick another card.
              </span>
            ) : (
              <span>Ace = 1, King = 13. Lowest card is Dealer.</span>
            )}
          </p>
        </div>

        {/* 4 Players Toss Reveal Stations */}
        <div className="grid grid-cols-4 gap-1.5 sm:gap-2.5 w-full mb-3">
          {players.map((p) => {
            const cardStack = tossDrawHistory?.[p.id] || (tossDraws[p.id] ? [tossDraws[p.id]] : []);
            const isTied = tiedPlayerIds.includes(p.id);
            const hasDrawnThisRound = tossDrawnThisRound?.[p.id];
            const isMe = p.id === myPlayerId;
            const isAssignedDealer = isTossComplete && dealer?.id === p.id;
            const needsToDrawInTieBreaker = isTieBreaker && isTied && !hasDrawnThisRound && !isTossComplete;

            return (
              <div
                key={p.id}
                className={`flex flex-col items-center p-1.5 sm:p-2 rounded-xl border transition-all ${
                  isAssignedDealer
                    ? 'bg-amber-950/70 border-amber-400 ring-2 ring-amber-400 shadow-glow-gold'
                    : isMe
                    ? 'bg-slate-900/90 border-blue-400/60'
                    : 'bg-slate-900/60 border-slate-700'
                } ${needsToDrawInTieBreaker ? 'ring-2 ring-rose-400/80 shadow-lg animate-pulse' : isTied && !isTossComplete ? 'ring-2 ring-amber-400/50' : ''}`}
              >
                <div className="text-[10px] sm:text-xs font-bold text-white mb-1 flex items-center justify-center gap-0.5 truncate max-w-full text-center">
                  {isAssignedDealer && <span>🎴</span>}
                  <span className="truncate">{p.name.split(' ')[0]}</span>
                  {isMe && <span className="text-amber-400 text-[9px]">(You)</span>}
                </div>

                <div className="min-h-[70px] sm:min-h-[85px] flex flex-col items-center justify-center">
                  <AnimatePresence mode="wait">
                    {cardStack.length > 0 ? (
                      <motion.div
                        key={`stack_${p.id}_${cardStack.length}`}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.3 }}
                        className="flex flex-col items-center"
                      >
                        <div className="relative flex items-center justify-center min-h-[58px] sm:min-h-[72px]">
                          {cardStack.map((card, cardIdx) => {
                            const isTop = cardIdx === cardStack.length - 1;
                            const offset = (cardIdx - (cardStack.length - 1)) * 3;
                            const rotation = (cardIdx - (cardStack.length - 1)) * 3;

                            return (
                              <motion.div
                                key={`${card.id}_${cardIdx}`}
                                initial={isTop ? { scale: 0.5, y: -10, rotateY: 180, opacity: 0 } : false}
                                animate={{
                                  scale: 1,
                                  y: isTop ? 0 : offset,
                                  rotate: isTop ? 0 : rotation,
                                  rotateY: 0,
                                  opacity: 1,
                                }}
                                transition={{ duration: 0.25 }}
                                className={isTop ? 'relative z-10' : 'absolute z-0 opacity-70'}
                              >
                                <PlayingCard card={card} size="xs" />
                              </motion.div>
                            );
                          })}
                        </div>

                        {isAssignedDealer && (
                          <div className="mt-1 flex flex-col items-center">
                            <div className="text-[8px] sm:text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 shadow">
                              DEALER
                            </div>
                          </div>
                        )}

                        {needsToDrawInTieBreaker && (
                          <div className="mt-0.5 px-1.5 py-0.5 bg-rose-500/20 border border-rose-400/60 rounded-full text-[8px] text-rose-300 font-bold animate-pulse flex items-center gap-0.5">
                            <RefreshCw className="w-2 h-2 animate-spin" /> Draw
                          </div>
                        )}
                      </motion.div>
                    ) : (
                      <motion.div
                        key="waiting"
                        animate={{ scale: [1, 1.05, 1] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="w-10 h-14 sm:w-12 sm:h-16 border border-dashed border-slate-600 rounded-md flex flex-col items-center justify-center text-slate-500 text-[9px] p-0.5 text-center"
                      >
                        {isTied ? 'Drawing...' : 'Waiting'}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}
        </div>

        {/* Dealer Action Box (When Toss is Fully Complete) */}
        {isTossComplete ? (
          <div className="flex flex-col items-center gap-2 pt-2 border-t border-amber-500/20">
            <div className="flex items-center justify-center gap-1.5">
              <span className="text-base sm:text-lg">🎴</span>
              <h3 className="text-sm sm:text-base font-cinzel font-bold text-amber-300">
                {isMeDealer
                  ? 'You are the Dealer'
                  : `${dealer?.name} is the Dealer`}
              </h3>
            </div>

            {isMeDealer ? (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  sound.playTrumpReveal();
                  onDistributeCards();
                }}
                className="px-6 py-2.5 bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600 hover:from-amber-300 text-slate-950 font-cinzel font-black text-xs sm:text-sm rounded-xl transition shadow-glow-gold flex items-center justify-center gap-2 cursor-pointer animate-pulse"
              >
                <Scissors className="w-4 h-4" /> Proceed to Shuffle & Cut
              </motion.button>
            ) : (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-950/60 border border-slate-700 rounded-xl text-xs text-amber-300/90 font-semibold animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                Waiting for {dealer?.name} to proceed to shuffle & cut...
              </div>
            )}
          </div>
        ) : (
          /* 52 Face-Down Cards Interactive Deck Grid (While players are drawing) */
          <div className="w-full bg-felt-dark/90 border border-felt-border rounded-xl p-2.5 sm:p-3 shadow-inner relative">
            <div className="flex items-center justify-between mb-1.5 text-[10px] sm:text-xs text-amber-300">
              <span>Deck: {tossCardsRemaining} cards</span>
              <span className="font-semibold truncate max-w-[65%] text-right">{statusMessage}</span>
            </div>

            {isMyTurnToDraw ? (
              <div className="mb-2 text-center">
                <span className="inline-block px-3 py-0.5 bg-amber-400 text-slate-950 font-bold text-[10px] sm:text-[11px] rounded-full shadow animate-pulse">
                  👉 {isTieBreaker ? 'Tied! Click any card to draw tie-breaker card!' : 'Click any face-down card below to draw!'}
                </span>
              </div>
            ) : (
              <div className="mb-2 text-center text-[10px] sm:text-[11px] text-slate-400">
                {isTieBreaker
                  ? `Waiting for ${tiedPlayerNames} to pick their tie-breaker cards...`
                  : 'Waiting for other players to pick their toss card...'}
              </div>
            )}

            {/* Scrollable / Responsive Card Spread */}
            <div className="flex flex-wrap justify-center gap-1 sm:gap-1.5 max-h-24 sm:max-h-28 overflow-y-auto p-1 bg-slate-950/40 rounded-lg border border-slate-800">
              {Array.from({ length: Math.min(52, tossCardsRemaining) }).map((_, idx) => (
                <motion.div
                  key={idx}
                  whileHover={isMyTurnToDraw ? { scale: 1.15, y: -4 } : {}}
                  whileTap={isMyTurnToDraw ? { scale: 0.95 } : {}}
                  onClick={() => {
                    if (isMyTurnToDraw) {
                      onDrawCard(idx);
                    }
                  }}
                  className={isMyTurnToDraw ? 'cursor-pointer' : 'cursor-not-allowed opacity-75'}
                >
                  <PlayingCard faceDown size="toss" />
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};
