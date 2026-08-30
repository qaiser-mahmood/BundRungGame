import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { TeamId } from '../../shared/types';
import { Trophy, Skull, RefreshCw, Sparkles } from 'lucide-react';
import { sound } from '../utils/sound';

interface GameOverModalProps {
  losingTeamKhoti: TeamId | null;
  matchWinnerTeam: TeamId | null;
  score: number;
  teamNames?: { TEAM_1: string; TEAM_2: string };
  onRematchSameRoster: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  losingTeamKhoti,
  matchWinnerTeam,
  score,
  teamNames,
  onRematchSameRoster,
}) => {
  useEffect(() => {
    sound.playFanfare();
    // Confetti burst for winners
    try {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch (e) {}
  }, []);

  const losingTeamName = (losingTeamKhoti && teamNames?.[losingTeamKhoti]) || (losingTeamKhoti === 'TEAM_1' ? 'Team 1' : 'Team 2');
  const winningTeamName = (matchWinnerTeam && teamNames?.[matchWinnerTeam]) || (matchWinnerTeam === 'TEAM_1' ? 'Team 1' : 'Team 2');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <motion.div
        initial={{ scale: 0.8, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 15 }}
        className="w-full max-w-lg bg-slate-900 border-4 border-amber-500 rounded-3xl p-6 sm:p-8 shadow-2xl text-center relative overflow-hidden"
      >
        {/* Glow backdrop */}
        <div className="absolute inset-0 bg-gradient-to-b from-amber-500/10 via-transparent to-red-950/20 pointer-events-none" />

        <h2 className="text-4xl sm:text-6xl font-cinzel font-black text-red-500 tracking-wider mb-2 filter drop-shadow-[0_0_20px_rgba(239,68,68,0.6)]">
          KHOTI!
        </h2>

        <p className="text-lg sm:text-2xl font-cinzel font-bold text-red-400 mb-6">
          {losingTeamName}
        </p>

        {/* Winner Announcement */}
        <div className="p-4 bg-emerald-950/40 border border-emerald-500/30 rounded-2xl mb-6 flex items-center justify-center gap-3">
          <Trophy className="w-8 h-8 text-amber-400" />
          <div className="text-left">
            <div className="text-xs uppercase font-bold text-emerald-400">Match Champions</div>
            <div className="text-lg font-bold text-white">{winningTeamName}</div>
          </div>
        </div>

        {/* Rematch Button */}
        <button
          onClick={onRematchSameRoster}
          className="w-full py-3.5 bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600 hover:from-amber-300 hover:to-yellow-400 text-slate-950 font-cinzel font-bold text-base rounded-xl transition shadow-glow-gold flex items-center justify-center gap-2 cursor-pointer"
        >
          <RefreshCw className="w-5 h-5" /> Start New Match
        </button>
      </motion.div>
    </div>
  );
};
