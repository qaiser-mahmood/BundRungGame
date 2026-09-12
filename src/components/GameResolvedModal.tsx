import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Player, ScorecardState, TeamId } from '../../shared/types';
import { Trophy, ArrowRight, Minimize2, Maximize2 } from 'lucide-react';
import { sound } from '../utils/sound';

interface GameResolvedModalProps {
  gameIndex: number;
  players: Player[];
  dealerPlayerIndex: number;
  myPlayerId: string;
  team1TricksWon: number;
  team2TricksWon: number;
  lastGameWinningTeam?: TeamId | null;
  scorecard: ScorecardState;
  statusMessage: string;
  teamNames?: { TEAM_1: string; TEAM_2: string };
  onDistributeNextGame: () => void;
  onOpenScorecard: () => void;
}

export const GameResolvedModal: React.FC<GameResolvedModalProps> = ({
  gameIndex,
  players,
  dealerPlayerIndex,
  myPlayerId,
  team1TricksWon,
  team2TricksWon,
  lastGameWinningTeam,
  scorecard,
  statusMessage,
  teamNames,
  onDistributeNextGame,
  onOpenScorecard,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    // 2.8s delay before banner appears so players clearly see the 4th card played & table state
    const timer = setTimeout(() => {
      setIsVisible(true);
      sound.playTrickWon();
    }, 2800);
    return () => clearTimeout(timer);
  }, []);

  if (!isVisible) return null;

  const dealer = players[dealerPlayerIndex];
  const isDealer = dealer && dealer.id === myPlayerId;
  const isNewMatchReady = statusMessage.includes('New Match Ready') || (gameIndex === 1 && team1TricksWon === 0 && team2TricksWon === 0);
  const team1Name = teamNames?.TEAM_1 || 'Team 1';
  const team2Name = teamNames?.TEAM_2 || 'Team 2';

  const winningTeam =
    lastGameWinningTeam === 'TEAM_1'
      ? team1Name
      : lastGameWinningTeam === 'TEAM_2'
      ? team2Name
      : team1TricksWon >= 7
      ? team1Name
      : team2Name;

  const winningTricks =
    lastGameWinningTeam === 'TEAM_1'
      ? team1TricksWon
      : lastGameWinningTeam === 'TEAM_2'
      ? team2TricksWon
      : Math.max(team1TricksWon, team2TricksWon);

  const targetGameIndex = isNewMatchReady ? 1 : gameIndex + 1;
  const dealerTeamName = dealer?.team === 'TEAM_1' ? team1Name : team2Name;

  return (
    <div className="fixed inset-x-4 top-12 sm:top-14 z-40 flex justify-center pointer-events-none">
      <motion.div
        initial={{ y: -20, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: -20, opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
        className="pointer-events-auto w-full max-w-md bg-slate-950/95 border-2 border-amber-400/90 rounded-2xl p-3 sm:p-3.5 shadow-2xl text-center relative overflow-hidden"
      >
        {isMinimized ? (
          /* Minimized pill view: keeps table and cards 100% unobstructed */
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-left min-w-0">
              <Trophy className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span className="font-cinzel font-black text-xs sm:text-sm text-amber-300 truncate">
                {isNewMatchReady ? 'New Match Ready!' : `🏆 ${winningTeam} Won Game ${gameIndex}!`}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={onOpenScorecard}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 rounded text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
              >
                📊 Scorecard
              </button>
              <button
                onClick={() => setIsMinimized(false)}
                className="p-1 text-slate-400 hover:text-white transition rounded hover:bg-slate-800 cursor-pointer"
                title="Expand banner"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          /* Small & Brief Rung-reveal-style Banner */
          <>
            {/* Top Header Row */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 text-left min-w-0">
                <div className="p-1.5 bg-amber-500/20 border border-amber-500/40 rounded-xl text-amber-400 flex-shrink-0">
                  <Trophy className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-cinzel font-black text-amber-300 leading-tight truncate">
                    {isNewMatchReady ? 'New Match Ready!' : `${winningTeam} Won Game ${gameIndex}!`}
                  </h3>
                  <p className="text-[11px] sm:text-xs text-slate-300 truncate">
                    {statusMessage || `${winningTricks} tricks won`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={onOpenScorecard}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-white border border-amber-500/40 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-sm"
                  title="View Scorecard"
                >
                  <span>📊</span>
                  <span>Scorecard</span>
                </button>
                <button
                  onClick={() => setIsMinimized(true)}
                  className="p-1 text-slate-400 hover:text-white transition rounded-lg hover:bg-slate-800 cursor-pointer"
                  title="Minimize banner to inspect table"
                >
                  <Minimize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              </div>
            </div>

            {/* Compact Scorecard & Next Dealer Pill */}
            <div className="flex items-center justify-between px-2.5 py-1 bg-slate-900/90 border border-slate-800 rounded-lg mb-2 text-[11px] sm:text-xs text-slate-300">
              <div className="flex items-center gap-1">
                <span className="text-slate-400">Dealer Score:</span>
                <strong className="text-amber-400 font-cinzel">{scorecard.dealerScore} pts</strong>
              </div>
              <div className="truncate ml-2">
                {isNewMatchReady ? 'New Dealer: ' : 'Next Dealer: '}
                <strong className="text-amber-300">{dealer?.name}</strong>{' '}
                <span className="text-slate-400">({dealerTeamName})</span>
              </div>
            </div>

            {/* Action Row */}
            <div>
              {isDealer ? (
                <button
                  onClick={() => {
                    sound.playCardSlide();
                    onDistributeNextGame();
                  }}
                  className="w-full py-1.5 sm:py-2 bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600 hover:from-amber-300 hover:to-yellow-400 text-slate-950 font-cinzel font-black text-xs sm:text-sm rounded-xl transition shadow-glow-gold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>🎴</span> Distribute 5 Cards for Game {targetGameIndex}
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <div className="w-full py-1.5 bg-slate-900/90 border border-slate-800 rounded-xl text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5">
                  <span className="animate-spin text-amber-400">⏳</span>
                  <span>Waiting for <strong>{dealer?.name}</strong> to distribute...</span>
                </div>
              )}
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
};
