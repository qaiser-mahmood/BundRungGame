import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Player, ScorecardState, TeamId } from '../../shared/types';
import { Trophy, Award, Sparkles, ArrowRight } from 'lucide-react';
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
  useEffect(() => {
    sound.playTrickWon();
  }, []);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <motion.div
        initial={{ scale: 0.85, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 18 }}
        className="w-full max-w-lg bg-slate-900 border-2 border-amber-500/80 rounded-3xl p-6 sm:p-8 shadow-2xl text-center relative overflow-hidden"
      >
        {/* Amber glow backdrop */}
        <div className="absolute inset-0 bg-gradient-to-b from-amber-500/10 via-transparent to-slate-950/40 pointer-events-none" />

        <h2 className="text-3xl sm:text-4xl font-cinzel font-black text-amber-400 tracking-wide mb-5 drop-shadow mt-2">
          {isNewMatchReady ? 'New Match Ready!' : `${winningTeam} Won!`}
        </h2>

        {/* Scorecard Summary Box */}
        <div className="bg-slate-950/80 border border-slate-700/80 rounded-2xl p-4 mb-6 text-left">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Dealer Scorecard
            </span>
            <span className="text-sm font-cinzel font-black text-amber-400">
              {scorecard.dealerScore} Points (Target: 100)
            </span>
          </div>

          <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden mb-2">
            <div
              className="bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, scorecard.dealerScore))}%` }}
            />
          </div>

          <div className="text-xs text-slate-300 font-medium">
            {isNewMatchReady ? 'New Match Dealer: ' : 'Active Dealer: '}
            <strong className="text-amber-300 text-sm">{dealer?.name}</strong> ({dealerTeamName})
          </div>
        </div>

        {/* Action Button */}
        <div className="flex flex-col gap-2.5">
          {isDealer ? (
            <button
              onClick={() => {
                sound.playCardSlide();
                onDistributeNextGame();
              }}
              className="w-full py-3.5 bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600 hover:from-amber-300 hover:to-yellow-400 text-slate-950 font-cinzel font-black text-base rounded-xl transition shadow-glow-gold flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>🎴</span> Distribute 5 Cards for Game {targetGameIndex}
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <div className="w-full py-3.5 bg-slate-800/90 border border-slate-700 rounded-xl text-slate-300 text-sm font-semibold flex items-center justify-center gap-2">
              <span className="animate-spin">⏳</span>
              <span>Waiting for <strong>{dealer?.name}</strong> to distribute cards for Game {targetGameIndex}...</span>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
